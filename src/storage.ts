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
  // migrate old records without tag field
  if (parsed.records) {
    parsed.records = parsed.records.map((r: Transaction) => ({
      ...r,
      tag: r.tag || (r.type === 'expense' ? '其他' : ''),
    }));
  }
  return parsed as AppData;
}

export async function saveData(data: AppData): Promise<void> {
  await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(data) });
}

// ========== Custom Tags ==========

export async function loadCustomTags(): Promise<string[]> {
  const { value } = await Preferences.get({ key: CUSTOM_TAGS_KEY });
  if (!value) return [];
  return JSON.parse(value) as string[];
}

export async function saveCustomTags(tags: string[]): Promise<void> {
  await Preferences.set({ key: CUSTOM_TAGS_KEY, value: JSON.stringify(tags) });
}

// ========== Tag Colors ==========

export async function loadTagColors(): Promise<Record<string, string>> {
  const { value } = await Preferences.get({ key: TAG_COLORS_KEY });
  if (!value) return { ...TAG_COLORS };
  return { ...TAG_COLORS, ...JSON.parse(value) };
}

export async function saveTagColors(colors: Record<string, string>): Promise<void> {
  await Preferences.set({ key: TAG_COLORS_KEY, value: JSON.stringify(colors) });
}

// ========== Tag Notes (remembered note per tag, keyed by usage count) ==========

export type TagNotes = Record<string, Record<string, number>>; // tag -> note -> count

export async function loadTagNotes(): Promise<TagNotes> {
  const { value } = await Preferences.get({ key: TAG_NOTES_KEY });
  if (!value) return {};
  return JSON.parse(value) as TagNotes;
}

export async function saveTagNotes(tn: TagNotes): Promise<void> {
  await Preferences.set({ key: TAG_NOTES_KEY, value: JSON.stringify(tn) });
}

export async function incrementTagNote(tag: string, note: string): Promise<void> {
  const tn = await loadTagNotes();
  tn[tag] = tn[tag] || {};
  tn[tag][note] = (tn[tag][note] || 0) + 1;
  await saveTagNotes(tn);
}

export async function deleteTagNote(tag: string, note: string): Promise<void> {
  const tn = await loadTagNotes();
  if (tn[tag]) {
    delete tn[tag][note];
    if (Object.keys(tn[tag]).length === 0) delete tn[tag];
    await saveTagNotes(tn);
  }
}

const TAG_COLOR_POOL = [
  '#FF6B6B', '#6BC5D9', '#FFD93D', '#C084FC', '#7BC67E',
  '#F97316', '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1',
];

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
