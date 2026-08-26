import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Task, TasksData, DateNote } from '../storage';
import { loadTasks, saveTasks, loadDateNotes, saveDateNotes } from '../storage';
import AddTaskModal from '../components/AddTaskModal';
import DraggableFab from '../components/DraggableFab';
import CheckIn from '../components/CheckIn';
import Tips from '../components/Tips';
import Projects from '../components/Project';
import EmptyState from '../components/EmptyState';
import { getHoliday, getHolidayDates } from '../holidays';
import { ensureNotificationPermission, resyncReminders } from '../notifications';

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

type SubTab = 'tasks' | 'checkin' | 'tips' | 'projects';

export default function Tasks() {
  const today = todayStr();
  const now = new Date();

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
  };

  const [hideCompleted, setHideCompleted] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [futureExpanded, setFutureExpanded] = useState(false);
  const [dateNotes, setDateNotes] = useState<DateNote[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [editingNoteDate, setEditingNoteDate] = useState<string | null>(null);

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
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const dateTasks = useMemo(
    () => tasks.filter((t) => t.date === selectedDate).sort((a, b) => a.order - b.order),
    [tasks, selectedDate]
  );

  const incompleteTasks = useMemo(() => dateTasks.filter((t) => !t.completed), [dateTasks]);
  const completedTasks = useMemo(() => dateTasks.filter((t) => t.completed), [dateTasks]);

  const pastIncompleteTasks = useMemo(() => {
    return tasks.filter((t) => !t.completed && t.date < today).sort((a, b) => a.order - b.order || a.date.localeCompare(b.date));
  }, [tasks, today]);

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

  const holidayDates = useMemo(() => getHolidayDates(), []);
  const selectedHoliday = useMemo(() => getHoliday(selectedDate), [selectedDate]);

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

  // ---- Undo ----
  const showUndo = (taskId: string, content: string) => {
    undoTime.current = Date.now();
    setUndo({ taskId, content });
    setUndoText('✅ 任务已完成');
    setUndoVisible(true);
  };

  const handleUndo = async () => {
    if (!undo) return;
    const updated = tasks.map((t) =>
      t.id === undo.taskId ? { ...t, completed: false, completedAt: null } : t
    );
    await saveTasks({ tasks: updated });
    setTasks(updated);
    await resyncReminders(updated);
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
    if (newTask.reminder) {
      await ensureNotificationPermission();
    }
    await saveTasks(updated);
    setShowAddModal(false);
    setSelectedDate(task.date);
    await refresh();
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
    await resyncReminders(updated);
    setEditingTask(null);
  };

  const handleDeleteTask = async (taskId: string) => {
    const updated = tasks.filter((t) => t.id !== taskId);
    await saveTasks({ tasks: updated });
    setTasks(updated);
    await resyncReminders(updated);
    setEditingTask(null);
  };

  const handleToggleComplete = async (taskId: string) => {
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

  // Reorder a list of tasks by reassigning order 0..n-1; only touches `order`,
  // never date/completed, so rolled tasks keep their overdue status
  const reorderList = async (list: Task[], taskId: string, direction: 'up' | 'down') => {
    const idx = list.findIndex((t) => t.id === taskId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === list.length - 1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];

    const updatedTasks = tasks.map((t) => {
      const newIdx = list.findIndex((r) => r.id === t.id);
      if (newIdx !== -1) return { ...t, order: newIdx };
      return t;
    });

    await saveTasks({ tasks: updatedTasks });
    setTasks(updatedTasks);
  };

  const handleMoveTask = (taskId: string, direction: 'up' | 'down') => {
    void reorderList([...incompleteTasks], taskId, direction);
  };

  const handleMoveRolledTask = (taskId: string, direction: 'up' | 'down') => {
    void reorderList([...pastIncompleteTasks], taskId, direction);
  };

  const formatCompletedTime = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // ---- Sub-tab views ----
  if (subTab === 'checkin') {
    return (
      <div className="tasks-page">
        <div className="ac-subnav">
          <button className="ac-subnav-btn" onClick={() => setSubTab('tasks')}>📋 任务</button>
          <button className="ac-subnav-btn active" onClick={() => setSubTab('checkin')}>✅ 打卡</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('tips')}>💡 Tips</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('projects')}>🏗 工程</button>
        </div>
        <div key={`checkin-${subTabKey}`} className="view-slide-in"><CheckIn /></div>
      </div>
    );
  }

  if (subTab === 'tips') {
    return (
      <div className="tasks-page">
        <div className="ac-subnav">
          <button className="ac-subnav-btn" onClick={() => setSubTab('tasks')}>📋 任务</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('checkin')}>✅ 打卡</button>
          <button className="ac-subnav-btn active" onClick={() => setSubTab('tips')}>💡 Tips</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('projects')}>🏗 工程</button>
        </div>
        <div key={`tips-${subTabKey}`} className="view-slide-in"><Tips /></div>
      </div>
    );
  }

  if (subTab === 'projects') {
    return (
      <div className="tasks-page">
        <div className="ac-subnav">
          <button className="ac-subnav-btn" onClick={() => setSubTab('tasks')}>📋 任务</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('checkin')}>✅ 打卡</button>
          <button className="ac-subnav-btn" onClick={() => setSubTab('tips')}>💡 Tips</button>
          <button className="ac-subnav-btn active" onClick={() => setSubTab('projects')}>🏗 工程</button>
        </div>
        <div key={`projects-${subTabKey}`} className="view-slide-in"><Projects /></div>
      </div>
    );
  }

  // ---- Tasks tab ----
  return (
    <div className="tasks-page">
      <div className="ac-subnav">
        <button className="ac-subnav-btn active" onClick={() => setSubTab('tasks')}>📋 任务</button>
        <button className="ac-subnav-btn" onClick={() => setSubTab('checkin')}>✅ 打卡</button>
        <button className="ac-subnav-btn" onClick={() => setSubTab('tips')}>💡 Tips</button>
        <button className="ac-subnav-btn" onClick={() => setSubTab('projects')}>🏗 工程</button>
      </div>
      <div key={`tasks-${subTabKey}`} className="view-slide-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

      {/* Mini Calendar */}
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
            const isHoliday = holidayDates.has(dateStr);
            const holiday = getHoliday(dateStr);
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
          )})}
        </div>
      </div>

      {/* Date Note */}
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

      {/* Task List */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
            📅 {selectedDate === today ? '今天' : selectedDate} 的任务
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

        {incompleteTasks.length === 0 && completedTasks.length === 0 && !(selectedDate === today && pastIncompleteTasks.length > 0) ? (
          <EmptyState emoji="📋" title="📋 这天没有任务~" />
        ) : (
          <>
            {/* Past incomplete rolled to today */}
            {selectedDate === today && pastIncompleteTasks.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="task-section-title" style={{ color: '#E8708A' }}>📌 过去未完成 · 已顺延</div>
                <div className="task-list">
                  {pastIncompleteTasks.map((task, idx) => (
                    <div key={task.id} className="task-item rolled">
                      <div className="task-move-btns">
                        <button className="task-move-btn" disabled={idx === 0} onClick={() => handleMoveRolledTask(task.id, 'up')}>▲</button>
                        <button className="task-move-btn" disabled={idx === pastIncompleteTasks.length - 1} onClick={() => handleMoveRolledTask(task.id, 'down')}>▼</button>
                      </div>
                      <div
                        className="task-checkbox"
                        onClick={() => handleToggleComplete(task.id)}
                      />
                      <div className="task-content" onClick={() => setEditingTask(task)}>
                        {task.content}
                        <span className="task-rolled-date">{task.date.slice(5)}</span>
                        <ReminderBadge reminder={task.reminder} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Incomplete for selected date */}
            {incompleteTasks.length > 0 && (
              <div className="task-list">
                {incompleteTasks.map((task, idx) => (
                  <div key={task.id} className="task-item">
                    <div className="task-move-btns">
                      <button className="task-move-btn" disabled={idx === 0} onClick={() => handleMoveTask(task.id, 'up')}>▲</button>
                      <button className="task-move-btn" disabled={idx === incompleteTasks.length - 1} onClick={() => handleMoveTask(task.id, 'down')}>▼</button>
                    </div>
                    <div
                      className="task-checkbox"
                      onClick={() => handleToggleComplete(task.id)}
                    />
                    <div className="task-content" onClick={() => setEditingTask(task)}>{task.content}<ReminderBadge reminder={task.reminder} /></div>
                  </div>
                ))}
              </div>
            )}

            {/* Completed */}
            {!hideCompleted && completedTasks.length > 0 && (
              <>
                <div className="task-section-title" style={{ marginTop: 12 }}>✅ 已完成</div>
                <div className="task-list">
                  {completedTasks.map((task) => (
                    <div key={task.id} className="task-item completed">
                      <div style={{ width: 32, flexShrink: 0 }} />
                      <div
                        className="task-checkbox checked"
                        onClick={() => handleToggleComplete(task.id)}
                      >✓</div>
                      <div className="task-content done" onClick={() => setEditingTask(task)}>{task.content}<ReminderBadge reminder={task.reminder} /></div>
                      <span className="task-completed-time">{formatCompletedTime(task.completedAt)}</span>
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
                const holiday = getHoliday(date);
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
