import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Task, TasksData, DateNote, CheckInData, CheckInRecord } from '../storage';
import { loadTasks, saveTasks, loadDateNotes, saveDateNotes, loadCheckIn, saveCheckIn } from '../storage';
import AddTaskModal from '../components/AddTaskModal';
import DraggableFab from '../components/DraggableFab';
import CheckIn from '../components/CheckIn';
import Tips from '../components/Tips';
import Projects from '../components/Project';
import EmptyState from '../components/EmptyState';
import { getHoliday } from '../holidays';
import { getSysHolidaysForMonths, type SysHoliday } from '../sysCalendar';
import { ensureNotificationPermission, resyncReminders, scheduleTaskReminder, openExactAlarmSettings, type ReminderScheduleResult } from '../notifications';

// After setting a reminder, tell the user what happened instead of failing silently
function feedbackReminder(r: ReminderScheduleResult) {
  if (r.status === 'permission-needed') {
    alert('未开启通知权限，无法发送任务提醒。请在系统弹窗中点击"允许"，再重新设置提醒时间。');
  } else if (r.status === 'failed') {
    alert(`提醒设置失败：${r.message}`);
  } else if (r.status === 'inexact') {
    alert('提醒已设置，但系统未授予"闹钟和提醒"权限，熄屏时可能收不到通知。已为你打开系统设置，请开启后重新设置一次提醒。');
    openExactAlarmSettings();
  }
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function getFirstDayOfWeek(y: number, m: number): number {
  return new Date(y, m - 1, 1).getDay();
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function ReminderBadge({ reminder }: { reminder?: string | null }) {
  if (!reminder) return null;
  return <span className="task-reminder-time">⏰ {reminder.slice(11)}</span>;
}

interface UndoState {
  taskId: string;
  content: string;
}

// Check-in goals surface in the task list as virtual items (date always = today,
// so they never look overdue and reset every day). `goalId` links back to the
// check-in record; `order` is shared with Task.order for cross-type sorting.
interface TaskViewItem {
  id: string;
  content: string;
  date: string;
  completed: boolean;
  completedAt: string | null;
  order: number;
  isCheckin: boolean;
  goalId?: string;
  reminder?: string | null;
  createdAt: string;
}

const CHECKIN_ORDER_BASE = 1e9;

type SubTab = 'tasks' | 'calendar' | 'checkin' | 'tips' | 'projects';

export default function Tasks() {
  const today = todayStr();
  const now = new Date();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showAddModal, setShowAddModal] = useState(false);
  const [subTab, setSubTabRaw] = useState<SubTab>('tasks');
  const subTabKeyRef = useRef(0);
  const [subTabKey, setSubTabKey] = useState(0);
  const setSubTab = (v: SubTab) => {
    if (v === subTab) return;
    subTabKeyRef.current += 1;
    setSubTabKey(subTabKeyRef.current);
    setSubTabRaw(v);
    if (v !== 'calendar' && searchParams.get('view') === 'calendar') {
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
    }
  };

  // Bottom-nav 日历 entry (navigate('/tasks?view=calendar')) selects the view
  useEffect(() => {
    const wantCalendar = searchParams.get('view') === 'calendar';
    if (wantCalendar && subTab !== 'calendar') {
      subTabKeyRef.current += 1;
      setSubTabKey(subTabKeyRef.current);
      setSubTabRaw('calendar');
    } else if (!wantCalendar && subTab === 'calendar') {
      subTabKeyRef.current += 1;
      setSubTabKey(subTabKeyRef.current);
      setSubTabRaw('tasks');
    }
  }, [searchParams, subTab]);

  const [checkinData, setCheckinData] = useState<CheckInData>({ goals: [], records: [], summaries: [] });
  const [hideCompleted, setHideCompleted] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [futureExpanded, setFutureExpanded] = useState(false);
  const [dateNotes, setDateNotes] = useState<DateNote[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [editingNoteDate, setEditingNoteDate] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  // Holidays fetched from the phone's system calendar (only when enabled +
  // granted in Profile; falls back to the built-in table otherwise)
  const [sysHolidays, setSysHolidays] = useState<Map<string, SysHoliday>>(new Map());

  // ---- 长按 1.5s 拖拽排序 ----
  const [dragItems, setDragItems] = useState<TaskViewItem[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0); // 被拖行的 translateY
  const dragItemsRef = useRef<TaskViewItem[]>([]);
  const baseListRef = useRef<TaskViewItem[]>([]);
  const dragCtl = useRef<{ active: boolean; id: string; grabOffset: number } | null>(null);
  const holdCtl = useRef<{ id: string; x: number; y: number; items: TaskViewItem[]; timer: ReturnType<typeof setTimeout> } | null>(null);
  const suppressClick = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 7-day strip around the current week (Mon-Sun), shiftable with the arrows
  const weekDays = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() - ((base.getDay() + 6) % 7) + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { dateStr: ds, day: d.getDate(), isToday: ds === today };
    });
  }, [weekOffset, today]);

  const weekLabel = useMemo(() => {
    const [y, m, d] = weekDays[0].dateStr.split('-');
    return `${y}年${parseInt(m)}月${parseInt(d)}日 起`;
  }, [weekDays]);

  const [undo, setUndo] = useState<UndoState | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [undoText, setUndoText] = useState('');
  const undoTime = useRef(Date.now());

  const refresh = useCallback(async () => {
    const t = await loadTasks();
    setTasks(t.tasks);
    await resyncReminders(t.tasks);
    const n = await loadDateNotes();
    setDateNotes(n.notes);
    const c = await loadCheckIn();
    setCheckinData(c);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Coming back from the check-in tab re-reads check-in state so the task list
  // reflects toggles made there
  useEffect(() => {
    if (subTab === 'tasks') refresh();
  }, [subTab]);

  const dateTasks = useMemo(
    () => tasks.filter((t) => t.date === selectedDate).sort((a, b) => a.order - b.order),
    [tasks, selectedDate]
  );

  const incompleteTasks = useMemo(() => dateTasks.filter((t) => !t.completed), [dateTasks]);
  const completedTasks = useMemo(() => dateTasks.filter((t) => t.completed), [dateTasks]);

  // Check-in goals appear in the task list as virtual items dated TODAY, so
  // they never roll over as overdue: a goal left unchecked simply resets to
  // unchecked the next day (completion = today's record status).
  const checkinItems = useMemo<TaskViewItem[]>(() => {
    if (selectedDate !== today) return [];
    // Goals marked as given-up (fail) today disappear from the task list
    return checkinData.goals
      .filter((g) => !checkinData.records.some((r) => r.goalId === g.id && r.date === today && r.status === 'fail'))
      .map((g) => {
        const rec = checkinData.records.find((r) => r.goalId === g.id && r.date === today);
        return {
          id: `checkin-${g.id}`,
          goalId: g.id,
          content: g.name,
          date: today,
          completed: rec?.status === 'success',
          completedAt: rec?.status === 'success' ? new Date().toISOString() : null,
          order: g.order ?? CHECKIN_ORDER_BASE,
          isCheckin: true,
          createdAt: '',
        };
      });
  }, [checkinData, selectedDate, today]);

  // All unfinished tasks shown on today's view in ONE sequence sorted by the
  // shared `order` field (real tasks + check-in goals use the same order
  // space, so ▲▼ moves work across the boundary). Concatenating a past group
  // and a today group would undo cross-boundary moves, so the whole list must
  // be one sortable set; rolled tasks keep their date badge.
  const todayViewTasks = useMemo<TaskViewItem[]>(() => {
    if (selectedDate !== today) return incompleteTasks.map((t) => ({ ...t, isCheckin: false }));
    const merged: TaskViewItem[] = [
      ...tasks.filter((t) => !t.completed && t.date <= today).map((t) => ({ ...t, isCheckin: false })),
      ...checkinItems.filter((c) => !c.completed),
    ];
    return merged.sort((a, b) => a.order - b.order || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [selectedDate, today, tasks, checkinItems]);

  const completedViewItems = useMemo<TaskViewItem[]>(() => {
    const merged: TaskViewItem[] = [
      ...completedTasks.map((t) => ({ ...t, isCheckin: false })),
      ...checkinItems.filter((c) => c.completed),
    ];
    return merged.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }, [completedTasks, checkinItems]);

  const futureTaskDates = useMemo(() => {
    return [...new Set(tasks.filter((t) => !t.completed && t.date > today).map((t) => t.date))].sort();
  }, [tasks, today]);

  const futureTasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const d of futureTaskDates) {
      map[d] = tasks.filter((t) => t.date === d && !t.completed).sort((a, b) => a.order - b.order);
    }
    return map;
  }, [tasks, futureTaskDates]);

  const taskDates = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (!t.completed) set.add(t.date);
    }
    return set;
  }, [tasks]);

  // System-calendar holidays win; anything else falls back to the built-in table
  const selectedHoliday = useMemo(
    () => sysHolidays.get(selectedDate) ?? getHoliday(selectedDate),
    [sysHolidays, selectedDate]
  );

  const noteDates = useMemo(() => {
    const set = new Set<string>();
    for (const n of dateNotes) set.add(n.date);
    return set;
  }, [dateNotes]);

  const selectedNote = useMemo(() => {
    return dateNotes.find((n) => n.date === selectedDate);
  }, [dateNotes, selectedDate]);

  // Calendar data
  const firstDay = getFirstDayOfWeek(calYear, calMonth);
  const totalDays = daysInMonth(calYear, calMonth);
  const prevMonthDays = daysInMonth(calYear, calMonth - 1 === 0 ? 12 : calMonth - 1);

  const calendarDays: { day: number; month: 'prev' | 'current' | 'next'; dateStr: string }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = calMonth - 1 === 0 ? 12 : calMonth - 1;
    const y = calMonth - 1 === 0 ? calYear - 1 : calYear;
    calendarDays.push({ day: d, month: 'prev', dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  for (let d = 1; d <= totalDays; d++) {
    calendarDays.push({ day: d, month: 'current', dateStr: `${calYear}-${String(calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  const remaining = 42 - calendarDays.length;
  for (let d = 1; d <= remaining; d++) {
    const m = calMonth + 1 > 12 ? 1 : calMonth + 1;
    const y = calMonth + 1 > 12 ? calYear + 1 : calYear;
    calendarDays.push({ day: d, month: 'next', dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }

  const prevCalMonth = () => {
    if (calMonth === 1) { setCalMonth(12); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextCalMonth = () => {
    if (calMonth === 12) { setCalMonth(1); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  // Fetch system-calendar holidays for every month visible on screen (the
  // calendar grid may show parts of the adjacent months too)
  const sysMonthsKey = useMemo(() => {
    const keys = new Set([`${calYear}-${String(calMonth).padStart(2, '0')}`]);
    const lead = getFirstDayOfWeek(calYear, calMonth);
    const rem = 42 - (lead + daysInMonth(calYear, calMonth));
    if (lead > 0) {
      const y = calMonth === 1 ? calYear - 1 : calYear;
      const m = calMonth === 1 ? 12 : calMonth - 1;
      keys.add(`${y}-${String(m).padStart(2, '0')}`);
    }
    if (rem > 0) {
      const y = calMonth === 12 ? calYear + 1 : calYear;
      const m = calMonth === 12 ? 1 : calMonth + 1;
      keys.add(`${y}-${String(m).padStart(2, '0')}`);
    }
    for (const d of weekDays) keys.add(d.dateStr.slice(0, 7));
    keys.add(selectedDate.slice(0, 7));
    return [...keys].sort().join(',');
  }, [calYear, calMonth, weekDays, selectedDate]);

  useEffect(() => {
    let alive = true;
    const months = sysMonthsKey.split(',').filter(Boolean);
    getSysHolidaysForMonths(months).then((m) => { if (alive) setSysHolidays(m); });
    return () => { alive = false; };
  }, [sysMonthsKey]);

  // ---- Undo ----
  const showUndo = (taskId: string, content: string, text = '✅ 任务已完成') => {
    undoTime.current = Date.now();
    setUndo({ taskId, content });
    setUndoText(text);
    setUndoVisible(true);
  };

  const handleUndo = async () => {
    if (!undo) return;
    if (undo.taskId.startsWith('checkin-')) {
      // Undoing a check-in action (completion or give-up) removes today's record
      const goalId = undo.taskId.slice('checkin-'.length);
      const records = checkinData.records.filter((r) => !(r.goalId === goalId && r.date === today));
      const newData = { ...checkinData, records };
      await saveCheckIn(newData);
      setCheckinData(newData);
    } else {
      const updated = tasks.map((t) =>
        t.id === undo.taskId ? { ...t, completed: false, completedAt: null } : t
      );
      await saveTasks({ tasks: updated });
      setTasks(updated);
      await resyncReminders(updated);
    }
    setUndoText('↩ 已撤销');
    setUndo(null);
    setTimeout(() => setUndoVisible(false), 1500);
  };

  useEffect(() => {
    if (!undo || !undoVisible) return;
    const timer = setTimeout(() => {
      if (Date.now() - undoTime.current >= 2900) {
        setUndoVisible(false);
        setUndo(null);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [undo, undoVisible]);

  // ---- Task actions ----
  const handleAddTask = async (task: Task) => {
    const maxOrder = Math.max(0, ...tasks.map((t) => t.order));
    const newTask = { ...task, order: maxOrder + 1 };
    const updated: TasksData = { tasks: [...tasks, newTask] };
    let scheduleResult: ReminderScheduleResult | null = null;
    if (newTask.reminder) {
      await ensureNotificationPermission();
      scheduleResult = await scheduleTaskReminder(newTask);
    }
    await saveTasks(updated);
    setShowAddModal(false);
    setSelectedDate(task.date);
    await refresh();
    if (scheduleResult) feedbackReminder(scheduleResult);
  };

  const handleSaveNote = async () => {
    if (!noteInput.trim()) return;
    const existing = dateNotes.find((n) => n.date === selectedDate);
    let updated: DateNote[];
    if (existing) {
      updated = dateNotes.map((n) =>
        n.id === existing.id ? { ...n, note: noteInput.trim() } : n
      );
    } else {
      const newNote: DateNote = {
        id: Date.now().toString(),
        date: selectedDate,
        note: noteInput.trim(),
        createdAt: new Date().toISOString(),
      };
      updated = [...dateNotes, newNote];
    }
    await saveDateNotes({ notes: updated });
    setDateNotes(updated);
    setNoteInput('');
    setEditingNoteDate(null);
  };

  const handleDeleteNote = async () => {
    const updated = dateNotes.filter((n) => n.date !== selectedDate);
    await saveDateNotes({ notes: updated });
    setDateNotes(updated);
    setNoteInput('');
    setEditingNoteDate(null);
  };

  const handleSaveEdit = async (updatedTask: Task) => {
    const updated = tasks.map((t) =>
      t.id === updatedTask.id ? updatedTask : t
    );
    await saveTasks({ tasks: updated });
    setTasks(updated);
    let scheduleResult: ReminderScheduleResult | null = null;
    if (updatedTask.reminder) {
      scheduleResult = await scheduleTaskReminder(updatedTask);
    }
    await resyncReminders(updated);
    setEditingTask(null);
    if (scheduleResult) feedbackReminder(scheduleResult);
  };

  const handleDeleteTask = async (taskId: string) => {
    const updated = tasks.filter((t) => t.id !== taskId);
    await saveTasks({ tasks: updated });
    setTasks(updated);
    await resyncReminders(updated);
    setEditingTask(null);
  };

  const handleToggleComplete = async (taskId: string) => {
    // Check-in goal: toggle today's record (success <-> no record). A 'fail'
    // record counts as not done, so tapping completes it (replaces with success).
    if (taskId.startsWith('checkin-')) {
      const goalId = taskId.slice('checkin-'.length);
      const goal = checkinData.goals.find((g) => g.id === goalId);
      if (!goal) return;
      const existing = checkinData.records.find((r) => r.goalId === goalId && r.date === today);
      let records: CheckInRecord[];
      if (existing?.status === 'success') {
        records = checkinData.records.filter((r) => !(r.goalId === goalId && r.date === today));
      } else {
        records = [
          ...checkinData.records.filter((r) => !(r.goalId === goalId && r.date === today)),
          { date: today, goalId, status: 'success' },
        ];
      }
      const newData = { ...checkinData, records };
      await saveCheckIn(newData);
      setCheckinData(newData);
      if (existing?.status !== 'success') showUndo(taskId, goal.name, '✅ 打卡完成');
      return;
    }

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (!task.completed) {
      const updated = tasks.map((t) =>
        t.id === taskId ? { ...t, completed: true, completedAt: new Date().toISOString() } : t
      );
      await saveTasks({ tasks: updated });
      setTasks(updated);
      await resyncReminders(updated);
      showUndo(taskId, task.content);
    } else {
      const updated = tasks.map((t) =>
        t.id === taskId ? { ...t, completed: false, completedAt: null } : t
      );
      await saveTasks({ tasks: updated });
      setTasks(updated);
      await resyncReminders(updated);
    }
  };

  // "Give up" today's check-in: mark the day as fail (shown as ✗ in the
  // check-in page) and remove the goal from today's task list. The undo toast
  // gives a short window to take the mark back (removes today's record).
  const handleQuitCheckin = async (goalId: string) => {
    const goal = checkinData.goals.find((g) => g.id === goalId);
    if (!goal) return;
    const records = [
      ...checkinData.records.filter((r) => !(r.goalId === goalId && r.date === today)),
      { date: today, goalId, status: 'fail' as const },
    ];
    const newData = { ...checkinData, records };
    await saveCheckIn(newData);
    setCheckinData(newData);
    showUndo(`checkin-${goalId}`, goal.name, '✅ 打卡已放弃');
  };

  // Reassign order 0..n-1 to a whole list (real tasks + check-in goals), only
  // touching `order`. Real task orders go to Tasks storage, check-in goal
  // orders to CheckIn storage (shared numeric space, so drag works across
  // rolled tasks, today's tasks and check-in goals in one sequence).
  const persistListOrder = async (list: TaskViewItem[]) => {
    const taskOrderById: Record<string, number> = {};
    const checkinOrders: Record<string, number> = {};
    list.forEach((t, i) => {
      if (t.isCheckin) checkinOrders[t.goalId!] = i;
      else taskOrderById[t.id] = i;
    });
    const updatedTasks = tasks.map((t) => {
      const n = taskOrderById[t.id];
      return n !== undefined ? { ...t, order: n } : t;
    });
    await saveTasks({ tasks: updatedTasks });
    setTasks(updatedTasks);
    const goalIds = Object.keys(checkinOrders);
    if (goalIds.length > 0) {
      const updatedGoals = checkinData.goals.map((g) =>
        checkinOrders[g.id] !== undefined ? { ...g, order: checkinOrders[g.id] } : g
      );
      const newData = { ...checkinData, goals: updatedGoals };
      await saveCheckIn(newData);
      setCheckinData(newData);
    }
  };
  // keep the latest closure available to the (stable) drag listeners
  const persistRef = useRef(persistListOrder);
  persistRef.current = persistListOrder;

  // ---- 长按拖拽排序 ----
  const DRAG_HOLD_MS = 1500;

  const clearHold = () => {
    if (holdCtl.current?.timer) clearTimeout(holdCtl.current.timer);
    holdCtl.current = null;
    window.removeEventListener('pointermove', handlePreDragMove);
    window.removeEventListener('pointerup', handlePreDragEnd);
    window.removeEventListener('pointercancel', handlePreDragEnd);
  };

  const onDragEnd = () => {
    const ctl = dragCtl.current;
    if (!ctl?.active) return;
    ctl.active = false;
    dragCtl.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
    document.body.style.overflow = '';
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 250);
    const finalList = dragItemsRef.current;
    const base = baseListRef.current;
    const changed = finalList.length !== base.length || finalList.some((it, i) => it.id !== base[i]?.id);
    setDragId(null);
    setDragItems(null);
    setDragY(0);
    if (changed) void persistRef.current(finalList);
  };

  const onDragMove = (e: PointerEvent) => {
    const ctl = dragCtl.current;
    if (!ctl?.active) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-task-id="${ctl.id}"]`);
    if (!el) { onDragEnd(); return; }
    // 拖到屏幕上下边缘自动滚动列表
    const edge = 60;
    if (e.clientY < edge) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);

    // 让被拖行的视觉位置跟手：rect 已含当前 translateY，补差即可
    const rect = el.getBoundingClientRect();
    setDragY((v) => v + (e.clientY - ctl.grabOffset - rect.top));

    const order = dragItemsRef.current;
    const cur = order.findIndex((it) => it.id === ctl.id);
    if (cur === -1) return;
    const rows = listRef.current ? Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-task-id]')) : [];
    let target = 0;
    for (let i = 0; i < rows.length; i++) {
      if (i === cur) continue;
      const rc = rows[i].getBoundingClientRect();
      if (e.clientY > rc.top + rc.height / 2) target++;
    }
    if (target === cur) return;

    const curTop = rows[cur].getBoundingClientRect().top;
    const dragH = rows[cur].getBoundingClientRect().height;
    const targetTop = rows[target].getBoundingClientRect().top;
    // 下移时新位顶面 = 目标行原顶 -（被拖行高度+行缝）；上移直接落到目标行顶
    const gapUnder = cur + 1 < rows.length
      ? rows[cur + 1].getBoundingClientRect().top - (curTop + dragH)
      : 0;
    const layoutDelta = target < cur
      ? targetTop - curTop
      : targetTop - curTop - (dragH + Math.max(0, gapUnder));

    const next = [...order];
    const [moved] = next.splice(cur, 1);
    next.splice(target, 0, moved);
    dragItemsRef.current = next;
    setDragItems(next);
    setDragY((v) => v - layoutDelta);
  };

  const activateDrag = (hold: NonNullable<typeof holdCtl.current>) => {
    if (dragCtl.current?.active) return;
    if (hold.items.length < 2) return;
    if (!hold.items.some((it) => it.id === hold.id)) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-task-id="${hold.id}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    clearHold();
    const items = [...hold.items];
    dragItemsRef.current = items;
    baseListRef.current = items;
    dragCtl.current = { active: true, id: hold.id, grabOffset: hold.y - rect.top };
    setDragItems(items);
    setDragId(hold.id);
    setDragY(0);
    document.body.style.overflow = 'hidden';
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
    try { navigator.vibrate?.(10); } catch { /* 震动不可用时忽略 */ }
  };

  const handleRowPointerDown = (e: RPointerEvent, id: string) => {
    if (selectedDate !== today) return;
    if (dragCtl.current?.active || holdCtl.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const items = dragItems ?? todayViewTasks;
    if (!items.some((it) => it.id === id)) return;
    holdCtl.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      items,
      timer: setTimeout(() => {
        const hold = holdCtl.current;
        if (hold && hold.id === id) activateDrag(hold);
      }, DRAG_HOLD_MS),
    };
    // 手指/鼠标移到行外或提前松开时也要能取消（指针可能未捕获在行上）
    window.addEventListener('pointermove', handlePreDragMove);
    window.addEventListener('pointerup', handlePreDragEnd);
    window.addEventListener('pointercancel', handlePreDragEnd);
  };

  const handlePreDragMove = (e: PointerEvent) => {
    const h = holdCtl.current;
    if (!h) return;
    if (Math.abs(e.clientX - h.x) > 10 || Math.abs(e.clientY - h.y) > 10) clearHold();
  };

  const handlePreDragEnd = () => clearHold();

  const handleRowPointerMove = (e: RPointerEvent) => {
    const h = holdCtl.current;
    if (!h) return;
    // 按住期间手指大幅移动 → 视为滚动页面，取消待触发拖拽
    if (Math.abs(e.clientX - h.x) > 10 || Math.abs(e.clientY - h.y) > 10) clearHold();
  };

  const handleRowPointerEnd = () => clearHold();

  const handleRowClick = (e: RMouseEvent, task: TaskViewItem) => {
    if (suppressClick.current) return;
    const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
    if (act === 'toggle') {
      void handleToggleComplete(task.id);
    } else if (act === 'quit') {
      if (task.isCheckin && !task.completed) void handleQuitCheckin(task.goalId!);
    } else if (!task.isCheckin) {
      setEditingTask(task);
    }
  };

  const formatCompletedTime = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // ---- Sub-tab views ----
  if (subTab === 'calendar') {
    return (
      <div className="tasks-page">
        <div className="ac-subnav">
          <button className="ac-subnav-btn" onClick={() => setSubTab('tasks')}>任务</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('checkin')}>打卡</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('tips')}>Tips</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('projects')}>工程</button>
        </div>
        <div key={`calendar-${subTabKey}`} className="view-slide-in">
          {/* Full month calendar */}
          <div className="mini-calendar">
            <div className="mini-cal-header">
              <button className="mini-cal-nav" onClick={prevCalMonth}>‹</button>
              <span className="mini-cal-title">{calYear}年{calMonth}月</span>
              <button className="mini-cal-nav" onClick={nextCalMonth}>›</button>
            </div>
            <div className="mini-cal-weekdays">
              {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
            </div>
            <div className="mini-cal-grid">
              {calendarDays.map(({ day, month, dateStr }) => {
                const holiday = sysHolidays.get(dateStr) ?? getHoliday(dateStr);
                const isHoliday = !!holiday;
                const hasTask = taskDates.has(dateStr);
                const hasNote = noteDates.has(dateStr);
                return (
                  <div
                    key={dateStr}
                    className={`mini-cal-day ${month !== 'current' ? 'other' : ''} ${dateStr === today ? 'today' : ''} ${dateStr === selectedDate ? 'selected' : ''} ${isHoliday ? 'holiday' : ''} ${hasNote ? 'annotated' : ''}`}
                    onClick={() => {
                      if (month === 'current') setSelectedDate(dateStr);
                    }}
                  >
                    {day}
                    <span className="mini-cal-indicators">
                      {isHoliday && <span className="mini-cal-holiday" title={holiday?.name}>{holiday?.emoji}</span>}
                      {hasTask && !isHoliday && <span className="mini-cal-dot" />}
                      {hasNote && <span className="mini-cal-note-dot" title="有备注" />}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Date note */}
          <div className="date-note-area">
            {selectedNote && editingNoteDate !== selectedDate ? (
              <div className="date-note-display">
                <span className="date-note-icon">📝</span>
                <span className="date-note-text">{selectedNote.note}</span>
                <button className="date-note-edit-btn" onClick={() => { setNoteInput(selectedNote.note); setEditingNoteDate(selectedDate); }}>编辑</button>
                <button className="date-note-del-btn" onClick={handleDeleteNote}>✕</button>
              </div>
            ) : editingNoteDate === selectedDate ? (
              <div className="date-note-edit">
                <input
                  className="date-note-input"
                  type="text"
                  placeholder="输入日期备注..."
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNote(); if (e.key === 'Escape') { setEditingNoteDate(null); setNoteInput(''); } }}
                  autoFocus
                />
                <button className="date-note-save-btn" onClick={handleSaveNote}>保存</button>
                <button className="date-note-cancel-btn" onClick={() => { setEditingNoteDate(null); setNoteInput(''); }}>取消</button>
              </div>
            ) : (
              <button className="date-note-add-btn" onClick={() => { setNoteInput(''); setEditingNoteDate(selectedDate); }}>
                + 添加备注
              </button>
            )}
          </div>

          {/* Tasks of the selected day */}
          <div className="calendar-day-title">
            {selectedDate === today ? '今天' : selectedDate} 的任务
          </div>
          {dateTasks.length === 0 ? (
            <EmptyState emoji="📋" title="这天没有任务~" />
          ) : (
            <div className="task-list">
              {dateTasks.map((task) => (
                <div key={task.id} className="task-item">
                  <div
                    className={`task-checkbox ${task.completed ? 'checked' : ''}`}
                    onClick={() => handleToggleComplete(task.id)}
                  >{task.completed ? '✓' : ''}</div>
                  <div className={`task-content ${task.completed ? 'done' : ''}`} onClick={() => setEditingTask(task)}>
                    {task.content}
                    <ReminderBadge reminder={task.reminder} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (subTab === 'checkin') {
    return (
      <div className="tasks-page">
        <div className="ac-subnav">
          <button className="ac-subnav-btn" onClick={() => setSubTab('tasks')}>任务</button>
          <button className="ac-subnav-btn active" onClick={() => setSubTab('checkin')}>打卡</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('tips')}>Tips</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('projects')}>工程</button>
        </div>
        <div key={`checkin-${subTabKey}`} className="view-slide-in"><CheckIn /></div>
      </div>
    );
  }

  if (subTab === 'tips') {
    return (
      <div className="tasks-page">
        <div className="ac-subnav">
          <button className="ac-subnav-btn" onClick={() => setSubTab('tasks')}>任务</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('checkin')}>打卡</button>
          <button className="ac-subnav-btn active" onClick={() => setSubTab('tips')}>Tips</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('projects')}>工程</button>
        </div>
        <div key={`tips-${subTabKey}`} className="view-slide-in"><Tips /></div>
      </div>
    );
  }

  if (subTab === 'projects') {
    return (
      <div className="tasks-page">
        <div className="ac-subnav">
          <button className="ac-subnav-btn" onClick={() => setSubTab('tasks')}>任务</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('checkin')}>打卡</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('tips')}>Tips</button>
          <button className="ac-subnav-btn active" onClick={() => setSubTab('projects')}>工程</button>
        </div>
        <div key={`projects-${subTabKey}`} className="view-slide-in"><Projects /></div>
      </div>
    );
  }

  // ---- Tasks tab ----
  return (
    <div className="tasks-page">
      <div className="ac-subnav">
        <button className="ac-subnav-btn active" onClick={() => setSubTab('tasks')}>任务</button>
        <button className="ac-subnav-btn" onClick={() => setSubTab('checkin')}>打卡</button>
        <button className="ac-subnav-btn" onClick={() => setSubTab('tips')}>Tips</button>
        <button className="ac-subnav-btn" onClick={() => setSubTab('projects')}>工程</button>
      </div>
      <div key={`tasks-${subTabKey}`} className="view-slide-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

      {/* Week strip: quick date switching (full calendar lives in 日历) */}
      <div className="week-strip">
        <div className="week-strip-header">
          <span className="week-strip-label">{weekLabel}</span>
          <button
            className="week-strip-today"
            onClick={() => { setWeekOffset(0); setSelectedDate(today); }}
          >今天</button>
        </div>
        <div className="week-strip-row">
          <button className="week-strip-nav" onClick={() => setWeekOffset((w) => w - 1)}>‹</button>
          <div className="week-strip-days">
            {weekDays.map(({ dateStr, day, isToday }) => {
              const holiday = sysHolidays.get(dateStr) ?? getHoliday(dateStr);
              const hasTask = taskDates.has(dateStr);
              const hasNote = noteDates.has(dateStr);
              return (
                <div
                  key={dateStr}
                  className={`week-strip-day ${dateStr === selectedDate ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => setSelectedDate(dateStr)}
                >
                  <span className="week-strip-weekday">周{['日', '一', '二', '三', '四', '五', '六'][new Date(dateStr).getDay()]}</span>
                  <span className="week-strip-num">{day}</span>
                  <span className="week-strip-mark">
                    {holiday && <span className="mini-cal-holiday">{holiday.emoji}</span>}
                    {hasTask && !holiday && <span className="mini-cal-dot" />}
                    {hasNote && <span className="mini-cal-note-dot" title="有备注" />}
                  </span>
                </div>
              );
            })}
          </div>
          <button className="week-strip-nav" onClick={() => setWeekOffset((w) => w + 1)}>›</button>
        </div>
      </div>

      {/* Task List */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
            {selectedDate === today ? '今天' : selectedDate} 的任务
            {selectedHoliday && (
              <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: '#E8708A' }}>
                {selectedHoliday.emoji} {selectedHoliday.name}
              </span>
            )}
          </h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>隐藏已完成</span>
            <span
              style={{
                position: 'relative',
                display: 'inline-block',
                width: 40,
                height: 22,
                borderRadius: 11,
                background: hideCompleted ? 'var(--primary, #FF9BB3)' : '#D0CCD0',
                transition: 'background 0.25s',
                cursor: 'pointer',
              }}
              onClick={() => setHideCompleted((v) => !v)}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: hideCompleted ? 20 : 2,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  transition: 'left 0.25s',
                }}
              />
            </span>
          </label>
        </div>

        {todayViewTasks.length === 0 && completedViewItems.length === 0 ? (
          <EmptyState emoji="📋" title="📋 这天没有任务~" />
        ) : (
          <>
            {/* One unified sequence: rolled past tasks (with date badge) + today's tasks + check-in goals.
                Hold a row ~1.5 s to drag-sort; taps still toggle/edit/give up. */}
            {todayViewTasks.length > 0 && (
              <div
                className="task-list"
                ref={listRef}
                onContextMenu={(e) => e.preventDefault()}
              >
                {(dragItems ?? todayViewTasks).map((task) => {
                  const isDragRow = dragId === task.id;
                  const dragProps = selectedDate === today ? {
                    onPointerDown: (e: RPointerEvent) => handleRowPointerDown(e, task.id),
                    onPointerMove: handleRowPointerMove,
                    onPointerUp: handleRowPointerEnd,
                    onPointerCancel: handleRowPointerEnd,
                  } : {};
                  return (
                    <div
                      key={task.id}
                      data-task-id={task.id}
                      className={`task-item ${isDragRow ? 'dragging' : ''}`}
                      style={isDragRow ? { '--drag-y': `${dragY}px` } as CSSProperties : undefined}
                      onClick={(e) => handleRowClick(e, task)}
                      {...dragProps}
                    >
                      <div className="task-checkbox" data-act="toggle" />
                      <div className="task-content">
                        {task.isCheckin && <span className="checkin-task-badge">打卡</span>}
                        {task.content}
                        {!task.isCheckin && task.date < today && <span className="task-rolled-date">{task.date.slice(5)}</span>}
                        {!task.isCheckin && <ReminderBadge reminder={task.reminder} />}
                      </div>
                      {task.isCheckin && !task.completed && (
                        <button
                          className="task-quit-btn"
                          data-act="quit"
                        >
                          放弃
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Completed */}
            {!hideCompleted && completedViewItems.length > 0 && (
              <>
                <div className="task-section-title" style={{ marginTop: 12 }}>✅ 已完成</div>
                <div className="task-list">
                  {completedViewItems.map((task) => (
                    <div key={task.id} className="task-item completed">
                      <div
                        className="task-checkbox checked"
                        onClick={() => { if (!suppressClick.current) void handleToggleComplete(task.id); }}
                      >✓</div>
                      <div className="task-content done" onClick={() => { if (!task.isCheckin) setEditingTask(task); }}>
                        {task.isCheckin && <span className="checkin-task-badge">打卡</span>}
                        {task.content}
                        {!task.isCheckin && <ReminderBadge reminder={task.reminder} />}
                      </div>
                      <span className="task-completed-time">{task.isCheckin ? '今天' : formatCompletedTime(task.completedAt)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Future tasks collapsed nav */}
      {futureTaskDates.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="future-nav" onClick={() => setFutureExpanded(!futureExpanded)}>
            <span>{futureExpanded ? '▼' : '▶'} 📅 未来任务</span>
            <span className="future-nav-count">
              {futureTaskDates.reduce((sum, d) => sum + (futureTasksByDate[d]?.length ?? 0), 0)}个
            </span>
          </div>
          {futureExpanded && (
            <div className="future-list">
              {futureTaskDates.map((date) => {
                const dateTasks = futureTasksByDate[date] ?? [];
                const holiday = sysHolidays.get(date) ?? getHoliday(date);
                if (dateTasks.length === 0) return null;

                return (
                  <div key={date}>
                    <div className="future-date-header">
                      {date}
                      {holiday && <span style={{ marginLeft: 6, fontSize: 12, color: '#E8708A' }}>{holiday.emoji} {holiday.name}</span>}
                    </div>
                    <div style={{ paddingLeft: 8 }}>
                      {dateTasks.map((task) => (
                        <div key={task.id} className="task-item">
                          <div
                            className="task-checkbox"
                            onClick={() => handleToggleComplete(task.id)}
                          />
                          <div className="task-content" onClick={() => setEditingTask(task)}>{task.content}<ReminderBadge reminder={task.reminder} /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <DraggableFab onClick={() => setShowAddModal(true)} />

      {showAddModal && (
        <AddTaskModal
          defaultDate={selectedDate}
          onSave={handleAddTask}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editingTask && (
        <AddTaskModal
          defaultDate={selectedDate}
          editTask={editingTask}
          onSave={handleSaveEdit}
          onDelete={handleDeleteTask}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Undo Toast */}
      {undoVisible && (
        <div className={`undo-toast ${undoVisible ? 'show' : ''}`}>
          <span>{undoText}</span>
          {undo && <button className="undo-btn" onClick={handleUndo}>撤销</button>}
        </div>
      )}
    </div>
    </div>
  );
}
