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

  constructor(records: Transaction[]) {
    for (const r of records) {
      const note = norm(r.note);
      if (!note) continue;
      const tag = r.tag || '其他';

      let nt = this.noteToTags.get(note);
      if (!nt) { nt = new Map(); this.noteToTags.set(note, nt); }
      nt.set(tag, (nt.get(tag) || 0) + 1);

      let tn = this.tagNotes.get(tag);
      if (!tn) { tn = new Map(); this.tagNotes.set(tag, tn); }
      tn.set(note, (tn.get(note) || 0) + 1);

      const h = hourFromId(r.id);
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
}
