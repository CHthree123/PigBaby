import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Transaction } from './storage';

export interface ParsedSmsRecord {
  amount: number;
  type: 'income' | 'expense';
  note: string;
  source: string;
  merchant: string;
  date: string;    // YYYY-MM-DD (from SMS timestamp)
  time: number;
  raw: string;
}

interface SmsReaderPlugin {
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  syncPending(): Promise<{ records: ParsedSmsRecord[] }>;
  queryRecent(options?: { limit?: number }): Promise<{ records: ParsedSmsRecord[] }>;
}

export const SmsReader: SmsReaderPlugin = registerPlugin<SmsReaderPlugin>('SmsReader');
export const isNative = Capacitor.isNativePlatform();

// merchant keyword -> expense tag
const TAG_KEYWORDS: [string, string[]][] = [
  ['餐饮', ['美团', '饿了么', '肯德基', '麦当劳', '瑞幸', '星巴克', '喜茶', '蜜雪', '茶百道', '古茗',
    '沪上阿姨', '霸王茶姬', '餐厅', '食堂', '外卖', '汉堡', '奶茶', '咖啡', '面馆', '小吃', '蛋糕', '面包']],
  ['交通', ['滴滴', '高德', '出租车', '地铁', '铁路', '12306', '公交', '加油', '石化', '石油',
    '停车', '高速', '过路费', '哈啰', '青桔', '共享单车']],
  ['购物', ['淘宝', '天猫', '京东', '拼多多', '唯品会', '抖音', '超市', '便利店', '沃尔玛', '永辉',
    '名创', '屈臣氏', '盒马', '朴朴', '叮咚', '菜鸟', '顺丰', '快递', '优选']],
  ['娱乐', ['腾讯', '网易', '爱奇艺', '优酷', '哔哩', 'bilibili', 'B站', '游戏', '电影', '猫眼',
    '演出', 'Steam', '会员', '视频', '音乐', '喜马拉雅', '咪咕']],
  ['学习', ['当当', '图书', '书店', '知乎', '得到', '课程', '培训', '教育', '作业帮', '有道']],
];

function guessTag(record: ParsedSmsRecord): string {
  const text = `${record.note} ${record.merchant}`;
  for (const [tag, keywords] of TAG_KEYWORDS) {
    if (keywords.some((k) => text.includes(k))) return tag;
  }
  return '其他';
}

// Turn parsed SMS records into transactions, skipping ones already in the ledger
export function buildTransactions(
  parsed: ParsedSmsRecord[],
  existing: Transaction[]
): { transactions: Transaction[]; added: number } {
  const seen = new Set(existing.map((r) => `${r.date}|${r.amount}|${r.type}|${r.note}`));
  const transactions: Transaction[] = [];
  let added = 0;
  for (const p of parsed) {
    const key = `${p.date}|${p.amount}|${p.type}|${p.note}`;
    if (seen.has(key)) continue;
    seen.add(key);
    added += 1;
    transactions.push({
      id: `${Date.now()}-${added}`,
      amount: p.amount,
      type: p.type,
      note: p.note || (p.type === 'income' ? '收入' : '支出'),
      date: p.date,
      month: p.date.slice(0, 7),
      tag: guessTag(p),
    });
  }
  return { transactions, added };
}
