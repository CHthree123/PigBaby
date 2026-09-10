import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import {
  loadData,
  saveData,
  loadTagRegistry,
  loadPendingCaptures,
  savePendingCaptures,
  loadSkipConfirm,
  type PendingCapture,
  type Transaction,
} from './storage';
import { guessTagByText, guessIncomeTagByText } from './tagRules';
import { MemoryEngine } from './tagMemory';

// 自动记账（通知监听）：采集层在 Android 原生，解析/打标/去重在 JS，
// 便于快速校准规则而不用改原生。

export interface RawCapture {
  id: string;
  pkg: string;
  app: string;      // 微信 / 支付宝
  title: string;
  text: string;
  bigText: string;
  subText: string;
  summaryText?: string;
  infoText?: string;
  titleBig?: string;
  conversationTitle?: string;
  extraText?: string;   // 兜底收集的其他文本（多行样式/自定义模板），分隔符 ⏎
  when: number;     // ms
}

interface AutoCapturePlugin {
  checkEnabled(): Promise<{ enabled: boolean }>;
  openSettings(): Promise<void>;
  pullCaptured(): Promise<{ captures: RawCapture[] }>;
  clearCaptured(options: { ids: string[] }): Promise<void>;
  addListener(
    eventName: 'capture',
    listenerFunc: (data: { fresh: boolean }) => void
  ): Promise<PluginListenerHandle>;
}

export const AutoCapture = registerPlugin<AutoCapturePlugin>('AutoCapture');
export const isNativeCapture = Capacitor.isNativePlatform();

export interface ParseResult {
  ok: boolean;
  reason?: string;
  parsed?: Omit<PendingCapture, 'createdAt'>;
}

// 来源词干扰方向判断（"微信支付"里含"支付"），先剔除
const SOURCE_WORDS = ['微信收款助手', '微信支付', '微信', '支付宝'];

const EXPENSE_WORDS = ['支付成功', '付款成功', '支付', '付款', '已付', '支出', '消费', '扣款', '扣费', '转出', '扣除', '已扣'];
const INCOME_WORDS = ['收款到账', '收款', '到账', '收入', '收到', '入账', '转入', '退款', '退回'];

function stripSources(s: string): string {
  let out = s;
  for (const w of SOURCE_WORDS) out = out.split(w).join('');
  return out;
}

function extractAmount(text: string): number | null {
  const patterns = [
    /[¥￥]\s*(\d+(?:[.,]\d{1,2})?)/,
    /(\d+(?:[.,]\d{1,2})?)\s*元/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (!isNaN(v) && v > 0 && v < 1e7) return v;
    }
  }
  return null;
}

function extractDirection(body: string): 'income' | 'expense' | null {
  const firstIdx = (words: string[]) => {
    let best = -1;
    for (const w of words) {
      const i = body.indexOf(w);
      if (i >= 0 && (best === -1 || i < best)) best = i;
    }
    return best;
  };
  const ei = firstIdx(EXPENSE_WORDS);
  const ii = firstIdx(INCOME_WORDS);
  if (ei === -1 && ii === -1) return null;
  if (ei === -1) return 'income';
  if (ii === -1) return 'expense';
  // 两类词都有：以出现更早的为准
  return ii < ei ? 'income' : 'expense';
}

function extractMerchant(body: string): string {
  const patterns = [
    /向\s*(.{1,24}?)\s*(?:付款|支付|转账)/,
    /(.{1,24}?)\s*向你(?:转账|付款)/,
    /(?:来自|收款方|商户|商家)[:：]?\s*(.{1,24}?)(?:\s|$)/,
  ];
  for (const p of patterns) {
    const m = body.match(p);
    if (m && m[1]) {
      const name = m[1].replace(/[，。,.!！、]/g, '').trim();
      if (name && name.length <= 24) return name;
    }
  }
  return '';
}

function pickTag(
  type: 'income' | 'expense',
  text: string,
  tagNames: Set<string>,
  engine: MemoryEngine
): string {
  const ruleTag = type === 'income' ? guessIncomeTagByText(text) : guessTagByText(text);
  if (ruleTag && tagNames.has(ruleTag)) return ruleTag;
  const sugg = engine.suggestTags(text, undefined, 1);
  if (sugg.length && tagNames.has(sugg[0].tag)) return sugg[0].tag;
  if (tagNames.has('其他')) return '其他';
  return tagNames.values().next().value || '其他';
}

// 汇总通知里所有可用文本（去重），解析与调试展示都用它
export function captureText(c: RawCapture): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (s?: string) => {
    for (const seg of (s || '').split('⏎')) {
      const t = seg.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      parts.push(t);
    }
  };
  push(c.title);
  push(c.text);
  push(c.bigText);
  push(c.subText);
  push(c.summaryText);
  push(c.infoText);
  push(c.titleBig);
  push(c.conversationTitle);
  push(c.extraText);
  return parts.join(' ');
}

export function parseCapture(
  c: RawCapture,
  tagNames: Set<string>,
  engine: MemoryEngine
): ParseResult {
  const combined = captureText(c);
  if (!combined) return { ok: false, reason: '通知无文本' };
  const body = stripSources(combined);
  const amount = extractAmount(combined);
  if (amount === null) return { ok: false, reason: '未识别到金额' };
  const type = extractDirection(body);
  if (!type) return { ok: false, reason: '未识别到收支方向' };
  const merchant = extractMerchant(body);
  const tag = pickTag(type, `${merchant} ${body}`, tagNames, engine);
  const note = merchant || `${c.app}自动记账`;
  return {
    ok: true,
    parsed: { id: c.id, app: c.app, when: c.when, amount, type, merchant, note, tag, raw: combined },
  };
}

const DEDUP_WINDOW_MS = 10 * 60 * 1000;

function msOf(id: string): number | null {
  const ms = parseInt(id, 10);
  return isNaN(ms) || ms < 1e12 ? null : ms;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateOfMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 跨通道去重：已有记录（含短信导入）±10 分钟 + 金额 + 方向；草稿之间同样去重
export function isDuplicateCapture(
  parsed: Omit<PendingCapture, 'createdAt'>,
  records: Transaction[],
  pendings: { amount: number; type: string; when: number }[]
): boolean {
  const date = dateOfMs(parsed.when);
  for (const r of records) {
    if (r.type !== parsed.type) continue;
    if (Math.abs(r.amount - parsed.amount) > 0.001) continue;
    const rms = msOf(r.id);
    if (rms !== null) {
      if (Math.abs(rms - parsed.when) <= DEDUP_WINDOW_MS) return true;
    } else if (r.date === date) {
      return true;
    }
  }
  for (const p of pendings) {
    if (p.type !== parsed.type) continue;
    if (Math.abs(p.amount - parsed.amount) > 0.001) continue;
    if (Math.abs(p.when - parsed.when) <= DEDUP_WINDOW_MS) return true;
  }
  return false;
}

export interface SyncResult {
  total: number;
  drafts: number;
  posted: number;
  skipped: number;
}

/**
 * 拉取原生捕获 → 解析 → 去重 → 生成待确认草稿（或按设置直接入账）→ 确认清除。
 * 处理失败的捕获也会被清除，只在「最近捕获」调试页可见。
 */
export async function syncCaptures(): Promise<SyncResult> {
  const result: SyncResult = { total: 0, drafts: 0, posted: 0, skipped: 0 };
  if (!isNativeCapture) return result;

  let captures: RawCapture[] = [];
  try {
    const res = await AutoCapture.pullCaptured();
    captures = res.captures || [];
  } catch {
    return result;
  }
  if (captures.length === 0) return result;
  result.total = captures.length;

  const data = await loadData();
  const reg = await loadTagRegistry();
  const tagNames = new Set([...reg.expense, ...reg.income].map((d) => d.name));
  const engine = new MemoryEngine(data.records);
  const pending = await loadPendingCaptures();
  const skipConfirm = await loadSkipConfirm();

  const ids: string[] = [];
  const newDrafts: PendingCapture[] = [];
  const newRecords: Transaction[] = [];
  let idx = 0;

  for (const c of captures) {
    const r = parseCapture(c, tagNames, engine);
    if (!r.ok || !r.parsed) {
      // 解析失败的保留在队列里，「最近捕获」页可见，便于校准规则
      result.skipped++;
      continue;
    }
    ids.push(c.id);
    if (isDuplicateCapture(r.parsed, data.records, [...pending, ...newDrafts])) {
      result.skipped++;
      continue;
    }
    if (skipConfirm) {
      idx++;
      const date = dateOfMs(r.parsed.when);
      newRecords.push({
        id: r.parsed.id || `${r.parsed.when}-${idx}`,
        amount: r.parsed.amount,
        type: r.parsed.type,
        note: r.parsed.note,
        date,
        month: date.slice(0, 7),
        tag: r.parsed.tag,
      });
      result.posted++;
    } else {
      newDrafts.push({ ...r.parsed, createdAt: Date.now() });
      result.drafts++;
    }
  }

  if (newRecords.length > 0) {
    await saveData({ ...data, records: [...data.records, ...newRecords] });
  }
  if (newDrafts.length > 0) {
    await savePendingCaptures([...pending, ...newDrafts]);
  }
  try {
    await AutoCapture.clearCaptured({ ids });
  } catch {
    // 清除失败时保留队列，下次同步会按去重跳过重复项
  }
  return result;
}
