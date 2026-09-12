import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import {
  loadData,
  saveData,
  loadTagRegistry,
  loadPendingCaptures,
  savePendingCaptures,
  loadSkipConfirm,
  appendCaptureLog,
  loadCaptureLog,
  loadCaptureRules,
  bumpCaptureRuleHits,
  type PendingCapture,
  type Transaction,
  type CaptureLogEntry,
  type CaptureRule,
} from './storage';
import { guessTagByText, guessIncomeTagByText } from './tagRules';
import { MemoryEngine } from './tagMemory';

// 自动记账（通知监听）：采集层在 Android 原生，解析/过滤/学习/合并在 JS，
// 便于快速校准规则而不用改原生。

export interface RawCapture {
  id: string;
  pkg: string;
  app: string;      // 来源应用（微信/支付宝/抖音/淘宝…）
  title: string;
  text: string;
  bigText: string;
  subText: string;
  summaryText?: string;
  infoText?: string;
  titleBig?: string;
  conversationTitle?: string;
  ticker?: string;
  extraText?: string;   // 兜底收集的其他文本（多行样式/嵌套消息体），分隔符 ⏎
  rawDump?: string;     // 原始 extras 转储（key=value），仅调试页展示
  when: number;     // ms
}

// 无障碍读取到的页面（实验：微信/支付宝的账单、支付、微信支付聊天页）
export interface AccessScreen {
  id: string;
  pkg: string;
  app: string;
  text: string;
  when: number;
}

interface AutoCapturePlugin {
  checkEnabled(): Promise<{ enabled: boolean }>;
  status(): Promise<{ enabled: boolean; connected: boolean }>;
  openSettings(): Promise<void>;
  scanActive(): Promise<{ added: number }>;
  pullCaptured(): Promise<{ captures: RawCapture[] }>;
  clearCaptured(options: { ids: string[] }): Promise<void>;
  checkAccessibility(): Promise<{ enabled: boolean }>;
  openAccessibilitySettings(): Promise<void>;
  pullScreens(): Promise<{ screens: AccessScreen[] }>;
  clearScreens(options: { ids: string[] }): Promise<void>;
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
const SOURCE_WORDS = [
  '微信收款助手', '微信支付', '抖音支付', '微信', '支付宝',
  '抖音', '淘宝', '京东', '拼多多', '美团', '云闪付',
];

const EXPENSE_WORDS = ['支付成功', '付款成功', '支付', '付款', '已付', '实付', '支出', '消费', '扣款', '扣费', '转出', '扣除', '已扣', '充值'];
const INCOME_WORDS = ['收款到账', '收款', '到账', '收入', '收到', '入账', '转入', '退款', '退回'];

function stripSources(s: string): string {
  let out = s;
  for (const w of SOURCE_WORDS) out = out.split(w).join('');
  return out;
}

// 提取金额：优先"实付款/支付/扣款…"锚点后的数字，其次 ¥ 形式，最后 X元 形式；
// 排除优惠/立减类数字（"共减3.00元，实付款55.00元" 应取 55）
export function extractAmount(text: string): number | null {
  const NUM = '(\\d+(?:[.,]\\d{1,2})?)';
  const cands: { value: number; index: number; prio: number }[] = [];
  const add = (m: RegExpMatchArray, prio: number) => {
    const v = parseFloat(m[1].replace(',', '.'));
    if (!isNaN(v) && v > 0 && v < 1e7) cands.push({ value: v, index: m.index ?? 0, prio });
  };
  const anchored = new RegExp(
    '(?:实付|已付|付款|支付|扣款|扣费|到账|收款|退款|入账|消费|退回|转出|转入|充值)\\s*(?:金额)?[:：]?\\s*[¥￥]?\\s*' + NUM,
    'g'
  );
  for (const m of text.matchAll(anchored)) add(m, 0);
  for (const m of text.matchAll(new RegExp('[¥￥]\\s*' + NUM, 'g'))) add(m, 1);
  for (const m of text.matchAll(new RegExp(NUM + '\\s*元', 'g'))) add(m, 2);
  const kept = cands.filter((c) => {
    const before = text.slice(Math.max(0, c.index - 4), c.index);
    return !/[优惠立减免折抵满券省]/.test(before);
  });
  if (kept.length === 0) return null;
  kept.sort((a, b) => a.prio - b.prio || a.index - b.index);
  return kept[0].value;
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
  push(c.ticker);
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

// ========== 分类（敏感转账 / 噪音过滤 / 可记账 / 不确定）与本地学习规则 ==========

export type CaptureClass = 'sensitive' | 'noise' | 'transaction' | 'uncertain';

export interface CaptureClassify {
  cls: CaptureClass;
  reason: string;
  rule?: CaptureRule;   // 命中的学习规则（用于累计命中次数）
}

// 转账按敏感处理（不自动生成草稿）：仅微信/支付宝（用户确认范围）
const SENSITIVE_APPS = new Set(['微信', '支付宝']);

// 提醒类消息（钱还没动）：不建草稿，随后真实的支付通知会再来一条
const REMINDER_WORDS = ['待支付', '待付款', '待缴费', '请支付', '请付款', '待还款', '逾期'];

// 强噪音标记（广告/营销/物流）：谨慎维护——宁可漏滤，不可误滤真实收支
const NOISE_WORDS = [
  '物流', '快递', '发货', '派件', '签收', '取件', '包裹',
  '优惠券', '限时', '秒杀', '抢购', '满减', '大促', '签到', '积分', '会员',
  '开播', '直播预告', '点赞', '关注了',
];

// 收支动词（与解析方向词表同步维护）
const TRANSACTION_WORDS = [
  '支付', '付款', '扣款', '扣费', '消费', '到账', '收款', '退款',
  '入账', '实付', '已付', '退回', '转出', '转入', '充值',
];

// 学习规则的特征词停用词：通用金融词汇与虚词，不参与指纹
const TOKEN_STOPWORDS = [
  '支付', '付款', '收款', '到账', '退款', '入账', '成功', '交易', '提醒', '通知',
  '微信', '支付宝', '账单', '余额', '红包', '消费', '收入', '支出', '扣款', '扣费',
  '收到', '优惠', '订单', '资金', '变动', '最新', '动态', '消息', '收取', '领取',
  '已', '可', '的', '了', '您', '请', '为', '共',
];

/** 从消息文本提取 ≤4 个特征词（连续中文段、去停用词）；空数组表示无特征词、不可教学 */
export function extractTokens(text: string): string[] {
  let s = text;
  for (const w of TOKEN_STOPWORDS) s = s.split(w).join(' ');
  s = s.replace(/[^一-龥]+/g, ' ');
  const out: string[] = [];
  for (const seg of s.split(/\s+/)) {
    if (seg.length < 2) continue;
    const t = seg.length > 8 ? seg.slice(0, 8) : seg;
    if (out.some((x) => x.includes(t) || t.includes(x))) continue;
    out.push(t);
    if (out.length >= 4) break;
  }
  return out;
}

/** 命中规则：全部特征词都出现（全局匹配，不分应用），取特征词最多的一条 */
export function matchCaptureRule(text: string, rules: CaptureRule[]): CaptureRule | null {
  let best: CaptureRule | null = null;
  for (const r of rules) {
    if (r.tokens.length === 0) continue;
    if (!r.tokens.every((t) => text.includes(t))) continue;
    if (!best || r.tokens.length > best.tokens.length) best = r;
  }
  return best;
}

/** 判定顺序：敏感转账 → 学习规则 → 提醒类 → 可记账 → 噪音 → 不确定 */
export function classifyCapture(c: RawCapture, text: string, rules: CaptureRule[]): CaptureClassify {
  if (SENSITIVE_APPS.has(c.app) && text.includes('转账')) {
    return { cls: 'sensitive', reason: '含「转账」，不自动记账，建议手动补记' };
  }
  const rule = matchCaptureRule(text, rules);
  if (rule && rule.decision === 'filter') {
    return { cls: 'noise', reason: `按学习规则过滤（${rule.tokens.join(' + ')}）`, rule };
  }
  if (rule && rule.decision === 'record') {
    return { cls: 'transaction', reason: '', rule };
  }
  const body = stripSources(text);
  for (const w of REMINDER_WORDS) {
    if (body.includes(w)) return { cls: 'noise', reason: `提醒类消息（${w}，未实际扣款），已过滤` };
  }
  const amount = extractAmount(text);
  if (amount !== null && TRANSACTION_WORDS.some((w) => body.includes(w))) {
    return { cls: 'transaction', reason: '' };
  }
  for (const w of NOISE_WORDS) {
    if (body.includes(w)) return { cls: 'noise', reason: `广告/物流类消息（${w}），已自动过滤` };
  }
  return {
    cls: 'uncertain',
    reason: amount === null ? '未识别到金额' : '未识别到明确的收支动词',
  };
}

// 同一笔交易的合并窗口：各应用通知一般几秒内到达，3 分钟足够且不易误并两笔真实同额消费
const MERGE_WINDOW_MS = 3 * 60 * 1000;
// 与已入账记录的重复判定窗口（钱已确认，放宽到 10 分钟防延迟的第二通道重复入账）
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

// 与已有记录去重：±10 分钟 + 金额 + 方向（含手动补记与短信时代的历史记录）
export function isDuplicateRecord(
  parsed: Omit<PendingCapture, 'createdAt'>,
  records: Transaction[]
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
  return false;
}

// 同类通知合并：同向 + 同额 + ±3 分钟（如淘宝与支付宝各推一条的同一笔付款、
// 同一应用对同一事件的重复推送），只补信息不新建草稿
export function findMergeTarget(
  parsed: Omit<PendingCapture, 'createdAt'>,
  pool: PendingCapture[]
): PendingCapture | undefined {
  return pool.find(
    (p) =>
      p.type === parsed.type &&
      Math.abs(p.amount - parsed.amount) <= 0.001 &&
      Math.abs(p.when - parsed.when) <= MERGE_WINDOW_MS
  );
}

export function mergeInto(target: PendingCapture, parsed: Omit<PendingCapture, 'createdAt'>): void {
  if (!target.merchant && parsed.merchant) target.merchant = parsed.merchant;
  const placeholder = !target.note || target.note.endsWith('自动记账');
  if (placeholder && parsed.merchant) target.note = parsed.merchant;
  if ((!target.tag || target.tag === '其他') && parsed.tag && parsed.tag !== '其他') {
    target.tag = parsed.tag;
  }
  if (!target.raw.includes(parsed.raw)) {
    target.raw = `${target.raw} ⏎ [合并 ${parsed.app}] ${parsed.raw}`.slice(0, 600);
  }
}

export interface SyncResult {
  total: number;
  drafts: number;
  posted: number;
  merged: number;
  filtered: number;
  sensitive: number;
  duplicate: number;
  uncertain: number;
}

/**
 * 拉取原生捕获 → 分类（敏感/噪音/学习规则）→ 解析 → 合并/去重 →
 * 生成待确认草稿（或按设置直接入账）→ 清除已处理项。
 * 敏感转账、解析失败与不确定的捕获保留在队列，「最近捕获」页可见、可手动处理。
 */
export async function syncCaptures(): Promise<SyncResult> {
  const result: SyncResult = {
    total: 0, drafts: 0, posted: 0, merged: 0, filtered: 0, sensitive: 0, duplicate: 0, uncertain: 0,
  };
  if (!isNativeCapture) return result;

  // 先扫一遍当前通知栏，补抓还在栏里但未被记录的通知（漏单兜底）
  try {
    await AutoCapture.scanActive();
  } catch {
    // 监听未连接时忽略
  }

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
  const rules = await loadCaptureRules();
  const existingLog = await loadCaptureLog();
  const loggedKeys = new Map(existingLog.map((e) => [e.id, `${e.action}|${e.reason}`]));

  const ids: string[] = [];
  const newDrafts: PendingCapture[] = [];
  const newRecords: Transaction[] = [];
  const logEntries: CaptureLogEntry[] = [];
  const ruleHits = new Set<string>();
  let idx = 0;

  const logBase = (c: RawCapture) => ({
    id: c.id,
    app: c.app,
    when: c.when,
    title: c.title,
    text: c.text,
    detail: ((c.extraText || '') + ' ' + (c.rawDump || '')).trim().slice(0, 300),
    loggedAt: Date.now(),
  });
  // 保留在队列里的条目每次同步都会被再次处理，内容未变的日志不重写，避免刷屏
  const logOnce = (c: RawCapture, action: CaptureLogEntry['action'], ok: boolean, reason: string) => {
    if (loggedKeys.get(c.id) === `${action}|${reason}`) return;
    loggedKeys.set(c.id, `${action}|${reason}`);
    logEntries.push({ ...logBase(c), ok, reason, action });
  };

  for (const c of [...captures].sort((a, b) => a.when - b.when)) {
    const text = captureText(c);
    if (!text) continue;
    const { cls, reason, rule } = classifyCapture(c, text, rules);
    if (rule) ruleHits.add(rule.id);

    if (cls === 'sensitive') {
      result.sensitive++;
      logOnce(c, 'sensitive', false, reason);
      continue; // 保留在队列，等用户手动补记或忽略
    }
    if (cls === 'noise') {
      ids.push(c.id);
      result.filtered++;
      logOnce(c, 'filtered', false, reason);
      continue;
    }

    const r = parseCapture(c, tagNames, engine);
    if (!r.ok || !r.parsed) {
      result.uncertain++;
      logOnce(c, 'skipped', false, reason || r.reason || '未识别');
      continue; // 保留在队列，等用户手动补记/教学
    }

    const target = findMergeTarget(r.parsed, [...pending, ...newDrafts]);
    if (target) {
      mergeInto(target, r.parsed);
      ids.push(c.id);
      result.merged++;
      logOnce(c, 'merged', true, `与${target.app}通知合并为同一笔（¥${target.amount.toFixed(2)}）`);
      continue;
    }
    if (isDuplicateRecord(r.parsed, [...data.records, ...newRecords])) {
      ids.push(c.id);
      result.duplicate++;
      logOnce(c, 'duplicate', true, '与已有记录重复，已跳过');
      continue;
    }
    ids.push(c.id);
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
      logOnce(c, 'posted', true, `直接入账 ¥${r.parsed.amount.toFixed(2)}`);
    } else {
      newDrafts.push({ ...r.parsed, createdAt: Date.now() });
      result.drafts++;
      logOnce(c, 'draft', true, `生成待确认 ¥${r.parsed.amount.toFixed(2)}`);
    }
  }

  if (logEntries.length > 0) {
    await appendCaptureLog(logEntries);
  }
  await bumpCaptureRuleHits([...ruleHits]);

  if (newRecords.length > 0) {
    await saveData({ ...data, records: [...data.records, ...newRecords] });
  }
  // 已有草稿可能被合并补了信息（mergeInto 原地修改），也要写回
  if (newDrafts.length > 0 || result.merged > 0) {
    await savePendingCaptures([...pending, ...newDrafts]);
  }
  try {
    await AutoCapture.clearCaptured({ ids });
  } catch {
    // 清除失败时保留队列，下次同步会按合并/去重逻辑跳过重复项
  }
  return result;
}
