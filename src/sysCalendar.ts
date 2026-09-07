// 节假日来源：可选「手机系统日历」（实时读取订阅的节假日日历）。
// 开启且授权后，UI 以本模块数据优先；查不到（未授权/无节假日订阅）时组件回退到内置节假日表。
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { CapacitorCalendar, CalendarPermissionScope } from '@capgo/capacitor-calendar';

export interface SysHoliday {
  name: string;
  emoji: string;
}

const SYNC_PREF = 'pigbaby_sys_cal_sync';
const CACHE_TTL = 10 * 60 * 1000; // 同月份 10 分钟内不重复查询

// 系统里看起来像“节假日/假期”订阅的日历（中国节假日、法定节假日、holiday 等）
const HOLIDAY_CAL_RE = /节假日|节日|假期|法定|假日|农历|holiday|festival|feast/i;
// 调休/补班事件不算节假日（也不用于渲染）
const WORKDAY_RE = /班|调休|值班|加班/i;
// 没有匹配到节假日日历时，按事件标题再筛一道，避免把个人日程当节日
const FEST_RE = /节|除夕|春节|元宵|清明|端午|中秋|重阳|七夕|圣诞|元旦|国庆|劳动|新年|假日|腊八/i;

const FEST_EMOJI: Array<[RegExp, string]> = [
  [/除夕/, '🧧'], [/春节|新年/, '🏮'], [/元宵/, '🏮'], [/情人/, '💕'],
  [/妇女/, '👩'], [/植树/, '🌲'], [/愚人/, '🃏'], [/清明/, '🌿'],
  [/劳动/, '🛠️'], [/青年/, '🔥'], [/母亲/, '🌷'], [/儿童/, '🧒'],
  [/端午/, '🐲'], [/父亲/, '👔'], [/建党/, '🚩'], [/七夕/, '💫'],
  [/建军/, '⭐'], [/教师/, '📚'], [/中秋/, '🌕'], [/国庆|祖国/, '🇨🇳'],
  [/重阳/, '🌿'], [/万圣/, '🎃'], [/感恩/, '🦃'], [/冬至/, '🥟'],
  [/圣诞/, '🎄'], [/元旦/, '🎉'], [/腊八/, '🍚'], [/小年/, '🍬'],
];

function emojiForName(name: string): string {
  for (const [re, emoji] of FEST_EMOJI) {
    if (re.test(name)) return emoji;
  }
  return '🎉';
}

function localDateStr(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return localDateStr(dt.getTime());
}

// 事件标题去掉年份/日期前缀与空白，如「2026年10月1日 国庆节」→「国庆节」
function cleanEventTitle(title: string): string {
  const cleaned = title
    .replace(/^[\s　]*\d{4}[-./年]\s*\d{1,2}[-./月]\s*\d{1,2}日?/, '')
    .replace(/^[\s　]*\d{1,2}[-./月]\s*\d{1,2}日?/, '')
    .replace(/^\d{4}\s*[-./年]?\s*/g, '')
    .replace(/[（(【\[]?[^（(【\[]*\d{1,2}:\d{2}[^）)】\]]*[）)】\]]?/g, '')
    .trim();
  return cleaned.length > 8 ? cleaned.slice(0, 8) : cleaned;
}

export function sysCalendarAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export async function loadSysCalEnabled(): Promise<boolean> {
  const { value } = await Preferences.get({ key: SYNC_PREF });
  return value === '1';
}

export async function setSysCalEnabled(on: boolean): Promise<void> {
  if (on) await Preferences.set({ key: SYNC_PREF, value: '1' });
  else await Preferences.remove({ key: SYNC_PREF });
}

export async function sysCalPermissionGranted(): Promise<boolean> {
  try {
    const p = await CapacitorCalendar.checkPermission({ scope: CalendarPermissionScope.READ_CALENDAR });
    return p.result === 'granted';
  } catch {
    return false;
  }
}

export async function requestSysCalPermission(): Promise<boolean> {
  try {
    const p = await CapacitorCalendar.requestReadOnlyCalendarAccess();
    return p.result === 'granted';
  } catch {
    return false;
  }
}

const monthCache = new Map<string, { at: number; days: Map<string, SysHoliday> }>();

async function fetchSysMonth(month: string): Promise<Map<string, SysHoliday> | null> {
  const hit = monthCache.get(month);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.days;
  try {
    if (!(await loadSysCalEnabled())) return null;
    if (!(await sysCalPermissionGranted())) return null;
    const [y, m] = month.split('-').map(Number);
    const from = new Date(y, m - 1, 1).getTime();
    const to = new Date(y, m, 1).getTime();

    const { result: calendars } = await CapacitorCalendar.listCalendars();
    const holidayCalIds = calendars
      .filter((c) => HOLIDAY_CAL_RE.test(`${c.title || ''} ${c.internalTitle || ''}`))
      .map((c) => c.id);
    const restrictCalIds = holidayCalIds.length > 0 ? new Set(holidayCalIds) : null;

    const { result: events } = await CapacitorCalendar.listEventsInRange({ from, to });
    const days = new Map<string, SysHoliday>();
    for (const ev of events) {
      if (restrictCalIds && ev.calendarId && !restrictCalIds.has(ev.calendarId)) continue;
      const raw = (ev.title || '').trim();
      if (!raw || WORKDAY_RE.test(raw)) continue;
      if (!restrictCalIds && !FEST_RE.test(raw)) continue;
      const name = cleanEventTitle(raw);
      if (!name) continue;

      const spanDays = Math.max(0, Math.floor((ev.endDate - ev.startDate) / 86400000));
      // 异常长的连续事件（>15 天）一般是生日/纪念日重复项，跳过
      if (spanDays > 15) continue;
      const first = localDateStr(ev.startDate);
      const total = Math.max(1, spanDays); // 跨天事件逐日标记；同天事件只标当天
      for (let i = 0; i < total; i++) {
        const ds = addDays(first, i);
        if (ds < `${month}-01` || !ds.startsWith(month)) break;
        const emoji = emojiForName(name);
        const prev = days.get(ds);
        if (prev) {
          // 同日多条时优先春节/元旦/国庆等大节日名称
          if (/春节|元旦|国庆/.test(name) && !/春节|元旦|国庆/.test(prev.name)) days.set(ds, { name, emoji });
        } else {
          days.set(ds, { name, emoji });
        }
      }
    }
    // 查询成功就缓存（含空结果，避免切换月份时反复查询同一月）
    monthCache.set(month, { at: Date.now(), days });
    return days;
  } catch {
    return null;
  }
}

// 拉取一批「yyyy-MM」月份的节假日，返回 dateStr -> 信息 的合并表（可能为空表）
export async function getSysHolidaysForMonths(months: string[]): Promise<Map<string, SysHoliday>> {
  const merged = new Map<string, SysHoliday>();
  const unique = [...new Set(months.filter(Boolean))];
  const results = await Promise.all(unique.map((mm) => fetchSysMonth(mm)));
  results.forEach((days) => days?.forEach((v, k) => merged.set(k, v)));
  return merged;
}

// Profile 页状态探测：手机里是否存在疑似节假日订阅日历
export async function sysCalHasHolidayCalendars(): Promise<boolean> {
  try {
    const { result: calendars } = await CapacitorCalendar.listCalendars();
    return calendars.some((c) => HOLIDAY_CAL_RE.test(`${c.title || ''} ${c.internalTitle || ''}`));
  } catch {
    return false;
  }
}
