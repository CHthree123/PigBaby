import { useEffect, useMemo, useState } from 'react';
import type { Task, DateNote } from '../storage';
import { loadDateNotes, saveDateNotes } from '../storage';
import { getHoliday } from '../holidays';
import { getSysHolidaysForMonths, type SysHoliday } from '../sysCalendar';
import EmptyState from './EmptyState';
import ReminderBadge from './ReminderBadge';

interface Props {
  tasks?: Task[];                        // 传入时显示所选日期的任务区（独立日历时不传）
  onToggleTask?: (taskId: string) => void;
  onEditTask?: (task: Task) => void;
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

export default function CalendarView({ tasks, onToggleTask, onEditTask }: Props) {
  const today = todayStr();
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(today);
  const [dateNotes, setDateNotes] = useState<DateNote[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [editingNoteDate, setEditingNoteDate] = useState<string | null>(null);
  const [sysHolidays, setSysHolidays] = useState<Map<string, SysHoliday>>(new Map());

  useEffect(() => {
    loadDateNotes().then((n) => setDateNotes(n.notes));
  }, []);

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
    keys.add(selectedDate.slice(0, 7));
    return [...keys].sort().join(',');
  }, [calYear, calMonth, selectedDate]);

  useEffect(() => {
    let alive = true;
    const months = sysMonthsKey.split(',').filter(Boolean);
    getSysHolidaysForMonths(months).then((m) => { if (alive) setSysHolidays(m); });
    return () => { alive = false; };
  }, [sysMonthsKey]);

  const taskDates = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks || []) {
      if (!t.completed) set.add(t.date);
    }
    return set;
  }, [tasks]);

  const noteDates = useMemo(() => {
    const set = new Set<string>();
    for (const n of dateNotes) set.add(n.date);
    return set;
  }, [dateNotes]);

  const selectedNote = useMemo(
    () => dateNotes.find((n) => n.date === selectedDate),
    [dateNotes, selectedDate]
  );

  const dateTasks = useMemo(
    () => (tasks || []).filter((t) => t.date === selectedDate).sort((a, b) => a.order - b.order),
    [tasks, selectedDate]
  );

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

  const handleSaveNote = async () => {
    if (!noteInput.trim()) return;
    const existing = dateNotes.find((n) => n.date === selectedDate);
    let updated: DateNote[];
    if (existing) {
      updated = dateNotes.map((n) => (n.id === existing.id ? { ...n, note: noteInput.trim() } : n));
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

  return (
    <div className="calendar-view">
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
      {tasks && (
        <>
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
                    onClick={() => onToggleTask?.(task.id)}
                  >{task.completed ? '✓' : ''}</div>
                  <div className={`task-content ${task.completed ? 'done' : ''}`} onClick={() => onEditTask?.(task)}>
                    {task.content}
                    <ReminderBadge reminder={task.reminder} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
