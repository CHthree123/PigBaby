import { Preferences } from '@capacitor/preferences';

// ========== Accounting Types ==========

export interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  note: string;
  date: string;    // YYYY-MM-DD
  month: string;   // YYYY-MM
  tag: string;     // expense tag, empty for income
}

export interface AppData {
  monthlyBudget: number;
  records: Transaction[];
}

// ========== Tag Types ==========

export const DEFAULT_TAGS = ['餐饮', '交通', '购物', '娱乐', '学习', '其他'];

export const TAG_COLORS: Record<string, string> = {
  '餐饮': '#FF6B6B',
  '交通': '#6BC5D9',
  '购物': '#FFD93D',
  '娱乐': '#C084FC',
  '学习': '#7BC67E',
  '其他': '#9CA3AF',
};

// ========== Savings Goal Types ==========

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  deadline: string;   // YYYY-MM-DD or empty
  createdAt: string;
}

export interface SavingsData {
  goals: SavingsGoal[];
}

// ========== Task Types ==========

export interface Task {
  id: string;
  content: string;
  date: string;           // YYYY-MM-DD
  tag?: 'instant' | 'longterm';  // legacy, no longer used in UI
  reminder?: string | null;  // YYYY-MM-DDTHH:mm local time, null = no reminder
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  order: number;
}

export interface TasksData {
  tasks: Task[];
}

// ========== Tips Types ==========

export interface Tip {
  id: string;
  content: string;
  createdAt: string;
}

export interface TipsData {
  tips: Tip[];
}

// ========== Project Types ==========

export interface ProjectStage {
  id: string;
  name: string;
  completed: boolean;
  order: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  stages: ProjectStage[];
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
}

export interface ProjectsData {
  projects: Project[];
}

// ========== CheckIn Types ==========

export interface CheckInGoal {
  id: string;
  name: string;
  type: 'weekly' | 'monthly';
  targetCount: number;
  createdAt: string;
  order?: number;  // position inside the task list (shared order space with Task.order)
}

export interface CheckInRecord {
  date: string;       // YYYY-MM-DD
  goalId: string;
  status: 'success' | 'fail';
}

export interface CheckInSummary {
  id: string;
  goalId: string;
  periodKey: string;   // "2026-06-02" (monday) for week, "2026-06" for month
  text: string;
  updatedAt: string;
}

export interface CheckInData {
  goals: CheckInGoal[];
  records: CheckInRecord[];
  summaries: CheckInSummary[];
}

// ========== Date Notes Types ==========

export interface DateNote {
  id: string;
  date: string;     // YYYY-MM-DD
  note: string;
  createdAt: string;
}

export interface DateNotesData {
  notes: DateNote[];
}

// ========== Storage Keys ==========

const STORAGE_KEY = 'pigbaby_data';
const DATE_NOTES_KEY = 'pigbaby_date_notes';
const CUSTOM_TAGS_KEY = 'pigbaby_custom_tags';
const TAG_COLORS_KEY = 'pigbaby_tag_colors';
const TAG_NOTES_KEY = 'pigbaby_tag_notes';
const SAVINGS_KEY = 'pigbaby_savings_goals';
const THEME_KEY = 'pigbaby_theme';
const TASKS_KEY = 'pigbaby_tasks';
const CHECKIN_KEY = 'pigbaby_checkin';
const TIPS_KEY = 'pigbaby_tips';
const PROJECTS_KEY = 'pigbaby_projects';

// ========== Main Data (Accounting) ==========

export async function loadData(): Promise<AppData> {
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  if (!value) {
    return { monthlyBudget: 3000, records: [] };
  }
  const parsed = JSON.parse(value);
  // migrate old records without tag field（v1.7 起收入也有标签）
  if (parsed.records) {
    parsed.records = parsed.records.map((r: Transaction) => ({
      ...r,
      tag: r.tag || '其他',
    }));
  }
  return parsed as AppData;
}

export async function saveData(data: AppData): Promise<void> {
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(data) });
}

// ========== Custom Tags (legacy: 仅在迁移到标签表时读取) ==========

export async function loadCustomTags(): Promise<string[]> {
  const { value } = await Preferences.get({ key: CUSTOM_TAGS_KEY });
  if (!value) return [];
  return JSON.parse(value) as string[];
}

// ========== Tag Registry（统一标签表：新增/重命名/换色/删除） ==========

export interface TagDef {
  name: string;
  color: string;
  order: number;
}

export interface TagRegistry {
  expense: TagDef[];
  income: TagDef[];
}

export const DEFAULT_INCOME_TAGS = ['工资', '红包', '理财', '报销', '转账', '其他'];

const INCOME_TAG_COLORS: Record<string, string> = {
  '工资': '#7BC67E',
  '红包': '#FF6B6B',
  '理财': '#FFD93D',
  '报销': '#6BC5D9',
  '转账': '#C084FC',
  '其他': '#9CA3AF',
};

const TAGS_V2_KEY = 'pigbaby_tags_v2';

export const TAG_COLOR_POOL = [
  '#FF6B6B', '#6BC5D9', '#FFD93D', '#C084FC', '#7BC67E',
  '#F97316', '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1',
];

function defaultIncomeTagDefs(): TagDef[] {
  return DEFAULT_INCOME_TAGS.map((name, i) => ({
    name,
    color: INCOME_TAG_COLORS[name] || '#9CA3AF',
    order: i,
  }));
}

export async function loadTagRegistry(): Promise<TagRegistry> {
  const { value } = await Preferences.get({ key: TAGS_V2_KEY });
  if (value) {
    const parsed = JSON.parse(value) as TagRegistry;
    if (!parsed.income || parsed.income.length === 0) parsed.income = defaultIncomeTagDefs();
    return parsed;
  }
  // 一次性迁移：内置标签 + 自定义标签 + 已保存颜色
  const custom = await loadCustomTags();
  const { value: colorsRaw } = await Preferences.get({ key: TAG_COLORS_KEY });
  const legacyColors: Record<string, string> = colorsRaw
    ? { ...TAG_COLORS, ...JSON.parse(colorsRaw) }
    : { ...TAG_COLORS };
  const names = [...DEFAULT_TAGS];
  for (const t of custom) if (!names.includes(t)) names.push(t);
  const registry: TagRegistry = {
    expense: names.map((name, i) => ({
      name,
      color: legacyColors[name] || getRandomTagColor(),
      order: i,
    })),
    income: defaultIncomeTagDefs(),
  };
  await saveTagRegistry(registry);
  return registry;
}

export async function saveTagRegistry(reg: TagRegistry): Promise<void> {
  await Preferences.set({ key: TAGS_V2_KEY, value: JSON.stringify(reg) });
}

export async function addTag(type: 'expense' | 'income', name: string): Promise<boolean> {
  const t = name.trim();
  if (!t) return false;
  const reg = await loadTagRegistry();
  if (reg[type].some((d) => d.name === t)) return false;
  reg[type] = [...reg[type], { name: t, color: getRandomTagColor(), order: reg[type].length }];
  await saveTagRegistry(reg);
  return true;
}

export async function deleteTag(type: 'expense' | 'income', name: string): Promise<void> {
  const reg = await loadTagRegistry();
  reg[type] = reg[type].filter((d) => d.name !== name);
  await saveTagRegistry(reg);
}

export async function setTagColor(type: 'expense' | 'income', name: string, color: string): Promise<void> {
  const reg = await loadTagRegistry();
  reg[type] = reg[type].map((d) => (d.name === name ? { ...d, color } : d));
  await saveTagRegistry(reg);
}

// 重命名：同步更新标签表、全部历史记录、备注记忆（自动记账规则接入后也一并更新）
export async function renameTag(
  type: 'expense' | 'income',
  oldName: string,
  newName: string
): Promise<boolean> {
  const t = newName.trim();
  if (!t || t === oldName) return false;
  const reg = await loadTagRegistry();
  if (reg[type].some((d) => d.name === t)) return false;
  reg[type] = reg[type].map((d) => (d.name === oldName ? { ...d, name: t } : d));
  await saveTagRegistry(reg);

  const data = await loadData();
  let changed = false;
  const records = data.records.map((r) => {
    if (r.type === type && r.tag === oldName) {
      changed = true;
      return { ...r, tag: t };
    }
    return r;
  });
  if (changed) await saveData({ ...data, records });

  const tn = await loadTagNotes();
  if (tn[oldName]) {
    const target = tn[t] || {};
    for (const [note, count] of Object.entries(tn[oldName])) {
      target[note] = (target[note] || 0) + count;
    }
    tn[t] = target;
    delete tn[oldName];
    await saveTagNotes(tn);
  }
  return true;
}

// 颜色总表（含两种类型），供记录列表 / 统计 / 图表读取
export async function loadTagColors(): Promise<Record<string, string>> {
  const reg = await loadTagRegistry();
  const out: Record<string, string> = { ...TAG_COLORS };
  for (const d of [...reg.expense, ...reg.income]) out[d.name] = d.color;
  return out;
}

// ========== Tag Notes (legacy: 旧版备注计数器，仅重命名时保持键名同步) ==========

export type TagNotes = Record<string, Record<string, number>>; // tag -> note -> count

export async function loadTagNotes(): Promise<TagNotes> {
  const { value } = await Preferences.get({ key: TAG_NOTES_KEY });
  if (!value) return {};
  return JSON.parse(value) as TagNotes;
}

export async function saveTagNotes(tn: TagNotes): Promise<void> {
  await Preferences.set({ key: TAG_NOTES_KEY, value: JSON.stringify(tn) });
}

export function getRandomTagColor(): string {
  return TAG_COLOR_POOL[Math.floor(Math.random() * TAG_COLOR_POOL.length)];
}

// ========== Savings Goals ==========

export async function loadSavingsGoals(): Promise<SavingsData> {
  const { value } = await Preferences.get({ key: SAVINGS_KEY });
  if (!value) return { goals: [] };
  return JSON.parse(value) as SavingsData;
}

export async function saveSavingsGoals(data: SavingsData): Promise<void> {
  await Preferences.set({ key: SAVINGS_KEY, value: JSON.stringify(data) });
}

// ========== Tasks ==========

export async function loadTasks(): Promise<TasksData> {
  const { value } = await Preferences.get({ key: TASKS_KEY });
  if (!value) return { tasks: [] };
  const parsed = JSON.parse(value) as TasksData;
  // migrate tasks saved before the reminder field existed
  parsed.tasks = parsed.tasks.map((t) => ({ ...t, reminder: t.reminder ?? null }));
  return parsed;
}

export async function saveTasks(data: TasksData): Promise<void> {
  await Preferences.set({ key: TASKS_KEY, value: JSON.stringify(data) });
}

// ========== CheckIn ==========

export async function loadCheckIn(): Promise<CheckInData> {
  const { value } = await Preferences.get({ key: CHECKIN_KEY });
  if (!value) return { goals: [], records: [], summaries: [] };
  const parsed = JSON.parse(value) as CheckInData;
  if (!parsed.summaries) parsed.summaries = [];
  return parsed;
}

export async function saveCheckIn(data: CheckInData): Promise<void> {
  await Preferences.set({ key: CHECKIN_KEY, value: JSON.stringify(data) });
}

// ========== Tips ==========

export async function loadTips(): Promise<TipsData> {
  const { value } = await Preferences.get({ key: TIPS_KEY });
  if (!value) return { tips: [] };
  return JSON.parse(value) as TipsData;
}

export async function saveTips(data: TipsData): Promise<void> {
  await Preferences.set({ key: TIPS_KEY, value: JSON.stringify(data) });
}

// ========== Projects ==========

export async function loadProjects(): Promise<ProjectsData> {
  const { value } = await Preferences.get({ key: PROJECTS_KEY });
  if (!value) return { projects: [] };
  return JSON.parse(value) as ProjectsData;
}

export async function saveProjects(data: ProjectsData): Promise<void> {
  await Preferences.set({ key: PROJECTS_KEY, value: JSON.stringify(data) });
}

// ========== App Features（功能模块开关）与 小猪按钮 ==========

export interface AppFeatures {
  accounting: boolean;
  tasks: boolean;
}

const FEATURES_KEY = 'pigbaby_features';
const PIG_ACTION_KEY = 'pigbaby_pig_action';

export async function loadFeatures(): Promise<AppFeatures> {
  const { value } = await Preferences.get({ key: FEATURES_KEY });
  if (!value) return { accounting: true, tasks: true };
  const parsed = JSON.parse(value) as Partial<AppFeatures>;
  return { accounting: parsed.accounting !== false, tasks: parsed.tasks !== false };
}

export async function saveFeatures(f: AppFeatures): Promise<void> {
  await Preferences.set({ key: FEATURES_KEY, value: JSON.stringify(f) });
}

export type PigAction = 'expense' | 'task';

export async function loadPigAction(): Promise<PigAction> {
  const { value } = await Preferences.get({ key: PIG_ACTION_KEY });
  return value === 'task' ? 'task' : 'expense';
}

export async function savePigAction(a: PigAction): Promise<void> {
  await Preferences.set({ key: PIG_ACTION_KEY, value: a });
}

// ========== 记账模式（预算制 / 余额制） ==========

export type MoneyMode = 'budget' | 'balance';

export interface InitialBalance {
  amount: number;
  fromDate: string;   // YYYY-MM-DD，余额从这个日期起计算
}

const MONEY_MODE_KEY = 'pigbaby_money_mode';
const INITIAL_BALANCE_KEY = 'pigbaby_initial_balance';

export async function loadMoneyMode(): Promise<MoneyMode> {
  const { value } = await Preferences.get({ key: MONEY_MODE_KEY });
  return value === 'balance' ? 'balance' : 'budget';
}

export async function saveMoneyMode(m: MoneyMode): Promise<void> {
  await Preferences.set({ key: MONEY_MODE_KEY, value: m });
}

export async function loadInitialBalance(): Promise<InitialBalance | null> {
  const { value } = await Preferences.get({ key: INITIAL_BALANCE_KEY });
  if (!value) return null;
  return JSON.parse(value) as InitialBalance;
}

export async function saveInitialBalance(b: InitialBalance): Promise<void> {
  await Preferences.set({ key: INITIAL_BALANCE_KEY, value: JSON.stringify(b) });
}

// ========== 自动记账（通知监听）：设置与待确认草稿 ==========

export interface PendingCapture {
  id: string;
  app: string;              // 来源应用（微信/支付宝/抖音/淘宝…）
  when: number;             // 通知时间（ms），也用作确认入账后的记录 id 前缀
  amount: number;
  type: 'income' | 'expense';
  merchant: string;
  note: string;
  tag: string;
  raw: string;              // 原始通知文本（调试用）
  createdAt: number;
}

const AUTO_CAPTURE_KEY = 'pigbaby_auto_capture';
const AUTO_SKIP_CONFIRM_KEY = 'pigbaby_auto_confirm_skip';
const AUTO_AI_KEY = 'pigbaby_auto_ai';
const PENDING_KEY = 'pigbaby_pending_captures';

export async function loadAutoCapture(): Promise<boolean> {
  const { value } = await Preferences.get({ key: AUTO_CAPTURE_KEY });
  return value === '1';
}

export async function saveAutoCapture(on: boolean): Promise<void> {
  await Preferences.set({ key: AUTO_CAPTURE_KEY, value: on ? '1' : '0' });
}

// 跳过确认：开=捕获后直接入账；关（默认）=每笔都要人工确认
export async function loadSkipConfirm(): Promise<boolean> {
  const { value } = await Preferences.get({ key: AUTO_SKIP_CONFIRM_KEY });
  return value === '1';
}

export async function saveSkipConfirm(on: boolean): Promise<void> {
  await Preferences.set({ key: AUTO_SKIP_CONFIRM_KEY, value: on ? '1' : '0' });
}

// AI 增强（预留：接入大模型打标，默认关闭）
export async function loadAiEnhance(): Promise<boolean> {
  const { value } = await Preferences.get({ key: AUTO_AI_KEY });
  return value === '1';
}

export async function saveAiEnhance(on: boolean): Promise<void> {
  await Preferences.set({ key: AUTO_AI_KEY, value: on ? '1' : '0' });
}

export async function loadPendingCaptures(): Promise<PendingCapture[]> {
  const { value } = await Preferences.get({ key: PENDING_KEY });
  if (!value) return [];
  return JSON.parse(value) as PendingCapture[];
}

export async function savePendingCaptures(list: PendingCapture[]): Promise<void> {
  await Preferences.set({ key: PENDING_KEY, value: JSON.stringify(list) });
}

export async function removePendingCapture(id: string): Promise<PendingCapture[]> {
  const list = (await loadPendingCaptures()).filter((p) => p.id !== id);
  await savePendingCaptures(list);
  return list;
}

// ========== 捕获学习规则（本地关键词学习：教会 App 某类消息该记账还是该过滤） ==========

export interface CaptureRule {
  id: string;
  tokens: string[];              // 特征词，全部命中即视为同类消息
  decision: 'record' | 'filter';
  sample: string;                // 教学时的消息原文（展示用）
  createdAt: number;
  hits: number;                  // 规则命中次数
}

const CAPTURE_RULES_KEY = 'pigbaby_capture_learn';

export async function loadCaptureRules(): Promise<CaptureRule[]> {
  const { value } = await Preferences.get({ key: CAPTURE_RULES_KEY });
  if (!value) return [];
  return JSON.parse(value) as CaptureRule[];
}

export async function saveCaptureRules(rules: CaptureRule[]): Promise<void> {
  await Preferences.set({ key: CAPTURE_RULES_KEY, value: JSON.stringify(rules) });
}

export async function addCaptureRule(input: {
  tokens: string[];
  decision: 'record' | 'filter';
  sample: string;
}): Promise<CaptureRule> {
  const rules = await loadCaptureRules();
  const key = (t: string[]) => [...t].sort().join('+');
  const dup = rules.find((r) => r.decision === input.decision && key(r.tokens) === key(input.tokens));
  if (dup) return dup;
  const rule: CaptureRule = {
    id: `r${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    tokens: input.tokens,
    decision: input.decision,
    sample: input.sample.slice(0, 120),
    createdAt: Date.now(),
    hits: 0,
  };
  await saveCaptureRules([...rules, rule]);
  return rule;
}

export async function deleteCaptureRule(id: string): Promise<void> {
  const rules = await loadCaptureRules();
  await saveCaptureRules(rules.filter((r) => r.id !== id));
}

export async function bumpCaptureRuleHits(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const rules = await loadCaptureRules();
  const set = new Set(ids);
  await saveCaptureRules(rules.map((r) => (set.has(r.id) ? { ...r, hits: r.hits + 1 } : r)));
}

// ========== 自动记账捕获历史（调试/追溯用，独立于工作队列，不会被清除） ==========

export type CaptureAction =
  | 'draft'      // 生成待确认草稿
  | 'posted'     // 直接入账
  | 'skipped'    // 未识别（保留在队列待处理）
  | 'duplicate'  // 与已入账记录重复
  | 'merged'     // 与已有草稿合并为同一笔
  | 'filtered'   // 噪音/学习规则过滤
  | 'sensitive'; // 转账类敏感消息

export interface CaptureLogEntry {
  id: string;
  app: string;
  when: number;
  title: string;
  text: string;
  detail: string;      // 其他文本/原始字段摘要（截断）
  ok: boolean;
  reason: string;      // 未识别原因或说明
  action: CaptureAction;
  loggedAt: number;
}

const CAPTURE_LOG_KEY = 'pigbaby_capture_log';
const CAPTURE_LOG_MAX = 120;

export async function loadCaptureLog(): Promise<CaptureLogEntry[]> {
  const { value } = await Preferences.get({ key: CAPTURE_LOG_KEY });
  if (!value) return [];
  return JSON.parse(value) as CaptureLogEntry[];
}

export async function appendCaptureLog(entries: CaptureLogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const existing = await loadCaptureLog();
  const byId = new Map<string, CaptureLogEntry>();
  for (const e of existing) byId.set(e.id, e);
  for (const e of entries) byId.set(e.id, e);
  const merged = [...byId.values()].sort((a, b) => b.when - a.when).slice(0, CAPTURE_LOG_MAX);
  await Preferences.set({ key: CAPTURE_LOG_KEY, value: JSON.stringify(merged) });
}

export async function deleteCaptureLogEntry(id: string): Promise<void> {
  const log = await loadCaptureLog();
  await Preferences.set({ key: CAPTURE_LOG_KEY, value: JSON.stringify(log.filter((e) => e.id !== id)) });
}

export async function clearCaptureLog(): Promise<void> {
  await Preferences.set({ key: CAPTURE_LOG_KEY, value: '[]' });
}

// ========== 智能推荐（记账记忆）开关与忽略列表 ==========

const SMART_REC_KEY = 'pigbaby_smart_rec';
const IGNORED_NOTES_KEY = 'pigbaby_memory_ignored';

export async function loadSmartRec(): Promise<boolean> {
  const { value } = await Preferences.get({ key: SMART_REC_KEY });
  return value !== '0';
}

export async function saveSmartRec(on: boolean): Promise<void> {
  await Preferences.set({ key: SMART_REC_KEY, value: on ? '1' : '0' });
}

export async function loadIgnoredNotes(): Promise<Record<string, string[]>> {
  const { value } = await Preferences.get({ key: IGNORED_NOTES_KEY });
  return value ? (JSON.parse(value) as Record<string, string[]>) : {};
}

export async function addIgnoredNote(tag: string, note: string): Promise<void> {
  const ig = await loadIgnoredNotes();
  const list = ig[tag] || [];
  if (!list.includes(note)) list.push(note);
  ig[tag] = list;
  await Preferences.set({ key: IGNORED_NOTES_KEY, value: JSON.stringify(ig) });
}

// ========== Theme ==========

export type ThemeName = 'light' | 'dark';

export async function loadTheme(): Promise<ThemeName> {
  const { value } = await Preferences.get({ key: THEME_KEY });
  return value === 'dark' ? 'dark' : 'light';
}

export async function saveTheme(t: ThemeName): Promise<void> {
  await Preferences.set({ key: THEME_KEY, value: t });
}

// ========== Date Notes ==========

export async function loadDateNotes(): Promise<DateNotesData> {
  const { value } = await Preferences.get({ key: DATE_NOTES_KEY });
  if (!value) return { notes: [] };
  return JSON.parse(value) as DateNotesData;
}

export async function saveDateNotes(data: DateNotesData): Promise<void> {
  await Preferences.set({ key: DATE_NOTES_KEY, value: JSON.stringify(data) });
}
