import type { Transaction } from './storage';

// 记账记忆引擎：全部从历史记录实时推导（备注→标签、标签+时段→备注），
// 不维护额外计数器。第二批自动记账的打标也复用该引擎。

export interface TagSuggestion {
  tag: string;
  count: number;
}

export interface NoteSuggestion {
  note: string;
  count: number;
}

export interface AmountSuggestion {
  note: string;
  tag: string;
  score: number;
  count: number;
}

// 备注框是否可被自动填入：空 / 自动记账占位 / 仍是上一次自动填入的值
export function canAutoFillNote(current: string, lastAutoFilled: string | null): boolean {
  const c = current.trim();
  return !c || c.endsWith('自动记账') || current === lastAutoFilled;
}

function hourFromId(id: string): number | null {
  const ms = parseInt(id, 10);
  if (isNaN(ms) || ms < 1e12) return null;
  const d = new Date(ms);
  const h = d.getHours();
  return isNaN(h) ? null : h;
}

// 时段：早 5-10 / 午 11-14 / 下午 15-17 / 晚 18-22 / 夜 23-4
export function hourBucket(hour: number): number {
  if (hour >= 5 && hour <= 10) return 0;
  if (hour >= 11 && hour <= 14) return 1;
  if (hour >= 15 && hour <= 17) return 2;
  if (hour >= 18 && hour <= 22) return 3;
  return 4;
}

export function currentHour(): number {
  return new Date().getHours();
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export class MemoryEngine {
  private noteToTags = new Map<string, Map<string, number>>();
  private tagNotes = new Map<string, Map<string, number>>();
  private tagBucketNotes = new Map<string, Map<string, number>>();
  // 金额 + 时段 → 备注索引（按类型分开）
  private amountIndex = new Map<
    'income' | 'expense',
    Map<string, { note: string; tag: string; amount: number; bucket: number | null }[]>
  >();

  constructor(records: Transaction[]) {
    for (const r of records) {
      const note = norm(r.note);
      if (!note) continue;
      // 自动记账生成的通用备注（如"微信自动记账"）不含有效信息，跳过以免污染学习
      if (note.endsWith('自动记账')) continue;
      const tag = r.tag || '其他';
      const h = hourFromId(r.id);

      let nt = this.noteToTags.get(note);
      if (!nt) { nt = new Map(); this.noteToTags.set(note, nt); }
      nt.set(tag, (nt.get(tag) || 0) + 1);

      let tn = this.tagNotes.get(tag);
      if (!tn) { tn = new Map(); this.tagNotes.set(tag, tn); }
      tn.set(note, (tn.get(note) || 0) + 1);

      let ai = this.amountIndex.get(r.type);
      if (!ai) { ai = new Map(); this.amountIndex.set(r.type, ai); }
      let list = ai.get(note);
      if (!list) { list = []; ai.set(note, list); }
      list.push({ note: r.note.trim(), tag, amount: r.amount, bucket: h === null ? null : hourBucket(h) });

      if (h !== null) {
        const key = `${tag}|${hourBucket(h)}`;
        let tb = this.tagBucketNotes.get(key);
        if (!tb) { tb = new Map(); this.tagBucketNotes.set(key, tb); }
        tb.set(note, (tb.get(note) || 0) + 1);
      }
    }
  }

  // 输入备注 → 推荐标签（包含匹配 + 时段偏好加权）
  suggestTags(noteInput: string, hour = currentHour(), limit = 5): TagSuggestion[] {
    const q = norm(noteInput);
    if (!q) return [];
    const bucket = hourBucket(hour);
    const scores = new Map<string, number>();
    for (const [note, tagCounts] of this.noteToTags) {
      if (!(note.includes(q) || q.includes(note))) continue;
      const weight = note === q ? 1.5 : 1;
      for (const [tag, count] of tagCounts) {
        scores.set(tag, (scores.get(tag) || 0) + count * weight);
      }
    }
    for (const [tag, score] of scores) {
      const tb = this.tagBucketNotes.get(`${tag}|${bucket}`);
      if (tb) {
        let total = 0;
        for (const c of tb.values()) total += c;
        scores.set(tag, score + Math.min(total * 0.2, 2));
      }
    }
    return [...scores.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // 当前标签下 → 推荐备注（同时段用过的排前）
  suggestNotes(tag: string, hour = currentHour(), limit = 6, ignored: string[] = []): NoteSuggestion[] {
    const tn = this.tagNotes.get(tag);
    if (!tn) return [];
    const bucket = this.tagBucketNotes.get(`${tag}|${hourBucket(hour)}`);
    const out: NoteSuggestion[] = [];
    for (const [note, count] of tn) {
      if (ignored.includes(note)) continue;
      const bonus = bucket?.get(note) || 0;
      out.push({ note, count: count + bonus });
    }
    return out.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  // 金额 + 时段 → 推荐备注：金额越接近（精确 > ±10% > ±30%）、时段越贴近分数越高；
  // 同备注取最强单条贡献，再按出现次数小幅放大（防大量弱命中压过精确命中）
  suggestForAmount(
    type: 'income' | 'expense',
    amount: number,
    hour = currentHour(),
    limit = 4,
    ignored: Record<string, string[]> = {}
  ): AmountSuggestion[] {
    const ai = this.amountIndex.get(type);
    if (!ai || amount <= 0) return [];
    const bucket = hourBucket(hour);
    const out: AmountSuggestion[] = [];
    for (const [key, entries] of ai) {
      let best = 0;
      let count = 0;
      const tagScore = new Map<string, number>();
      for (const e of entries) {
        const diff = Math.abs(e.amount - amount);
        const ratio = diff / Math.max(amount, 0.01);
        const sim = diff <= 0.01 ? 3 : ratio <= 0.1 ? 2 : ratio <= 0.3 ? 1 : 0;
        if (sim === 0) continue;
        const time = e.bucket !== null && e.bucket === bucket ? 2 : 1;
        const contribution = sim * time;
        count++;
        if (contribution > best) best = contribution;
        tagScore.set(e.tag, (tagScore.get(e.tag) || 0) + contribution);
      }
      if (best === 0) continue;
      let tag = '';
      let top = 0;
      for (const [t, s] of tagScore) {
        if (s > top) { top = s; tag = t; }
      }
      if ((ignored[tag] || []).some((x) => norm(x) === key)) continue;
      const score = Math.round(best * (1 + 0.3 * Math.min(count - 1, 4)) * 100) / 100;
      out.push({ note: entries[0].note, tag, score, count });
    }
    return out.sort((a, b) => b.score - a.score || b.count - a.count).slice(0, limit);
  }
}
