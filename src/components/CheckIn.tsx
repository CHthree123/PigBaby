import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CheckInGoal, CheckInData, CheckInRecord, CheckInSummary } from '../storage';
import { loadCheckIn, saveCheckIn } from '../storage';
import { getSysHolidaysForMonths, type SysHoliday } from '../sysCalendar';
import EmptyState from './EmptyState';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateStrOfMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekDateStrings(monday: Date): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return days;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function getFirstDayOfWeek(y: number, m: number): number {
  return new Date(y, m - 1, 1).getDay();
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

export default function CheckIn() {
  const [data, setData] = useState<CheckInData>({ goals: [], records: [], summaries: [] });
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [weekOffset, setWeekOffset] = useState(0); // 0 = this week
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [editingGoal, setEditingGoal] = useState<CheckInGoal | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalType, setGoalType] = useState<'weekly' | 'monthly'>('weekly');
  const [goalCountInput, setGoalCountInput] = useState('3');

  const clampCount = (n: number, t: 'weekly' | 'monthly') => {
    const max = t === 'weekly' ? 7 : 31;
    if (isNaN(n)) return 1;
    return Math.min(max, Math.max(1, Math.round(n)));
  };

  // Summary
  const [summaryText, setSummaryText] = useState('');
  const [summarySaved, setSummarySaved] = useState(true);
  const summaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = todayStr();
  const justToggled = useRef(false);

  // 节假日标记：开启「手机日历同步」时取系统日历，否则内置表（本组件只渲染标记）
  const [sysHolidays, setSysHolidays] = useState<Map<string, SysHoliday>>(new Map());

  const refresh = useCallback(async () => {
    const d = await loadCheckIn();
    setData(d);
    if (!activeGoalId && d.goals.length > 0) {
      setActiveGoalId(d.goals[0].id);
    }
  }, [activeGoalId]);

  useEffect(() => { refresh(); }, []);

  // Open on the view matching the goal type: weekly goal -> week view,
  // monthly goal -> month view (previously it always opened on the week
  // view, so monthly goals showed a week page on first entry)
  useEffect(() => {
    const g = data.goals.find((gg) => gg.id === activeGoalId);
    if (g) setViewMode(g.type === 'weekly' ? 'week' : 'month');
  }, [activeGoalId, data.goals]);

  const activeGoal = useMemo(
    () => data.goals.find((g) => g.id === activeGoalId) || null,
    [data.goals, activeGoalId]
  );

  const getRecord = (goalId: string, date: string): CheckInRecord | undefined =>
    data.records.find((r) => r.goalId === goalId && r.date === date);

  // 目标开始日：优先 createdAt，老数据回退用 id（毫秒时间戳）
  const goalStart = useMemo(() => {
    if (!activeGoal) return null;
    if (activeGoal.createdAt) return activeGoal.createdAt;
    const ms = parseInt(activeGoal.id, 10);
    return !isNaN(ms) && ms >= 1e12 ? dateStrOfMs(ms) : null;
  }, [activeGoal]);

  // 未完成的天（创建日起、今天及以前、无记录）显示浅色 ✗，与任务列表状态同步
  const isMissed = (dateStr: string): boolean =>
    !!activeGoal && !!goalStart && dateStr <= today && dateStr >= goalStart
    && !getRecord(activeGoal.id, dateStr);

  const handleToggleDay = async (goalId: string, date: string) => {
    if (date > today) return;
    const existing = getRecord(goalId, date);
    let updated: CheckInRecord[];
    if (!existing) {
      updated = [...data.records, { date, goalId, status: 'success' }];
    } else if (existing.status === 'success') {
      updated = data.records.map((r) =>
        r.goalId === goalId && r.date === date ? { ...r, status: 'fail' } : r
      );
    } else {
      updated = data.records.filter(
        (r) => !(r.goalId === goalId && r.date === date)
      );
    }
    const newData = { ...data, records: updated };
    setData(newData);
    justToggled.current = true;
    await saveCheckIn(newData);
  };

  const handleSaveGoal = async () => {
    if (!goalName.trim()) return;
    const count = clampCount(parseInt(goalCountInput, 10), goalType);
    const updated = { ...data };
    if (editingGoal) {
      updated.goals = updated.goals.map((g) =>
        g.id === editingGoal.id
          ? { ...g, name: goalName.trim(), type: goalType, targetCount: count }
          : g
      );
    } else {
      updated.goals = [
        ...updated.goals,
        {
          id: Date.now().toString(),
          name: goalName.trim(),
          type: goalType,
          targetCount: count,
          createdAt: todayStr(),
        },
      ];
    }
    await saveCheckIn(updated);
    setData(updated);
    if (!activeGoalId && updated.goals.length > 0) {
      setActiveGoalId(updated.goals[0].id);
    }
    setShowSettings(false);
    setEditingGoal(null);
    setGoalName('');
  };

  const handleDeleteGoal = async (goalId: string) => {
    const updated = {
      goals: data.goals.filter((g) => g.id !== goalId),
      records: data.records.filter((r) => r.goalId !== goalId),
      summaries: data.summaries.filter((s) => s.goalId !== goalId),
    };
    await saveCheckIn(updated);
    setData(updated);
    if (activeGoalId === goalId) {
      setActiveGoalId(updated.goals[0]?.id || null);
    }
  };

  const openEditGoal = (goal: CheckInGoal) => {
    setEditingGoal(goal);
    setGoalName(goal.name);
    setGoalType(goal.type);
    setGoalCountInput(String(goal.targetCount));
    setShowSettings(true);
  };

  const openNewGoal = () => {
    setEditingGoal(null);
    setGoalName('');
    setGoalType('weekly');
    setGoalCountInput('3');
    setShowSettings(true);
  };

  // ---- Week View ----
  const weekMonday = (() => {
    const now = new Date();
    const mon = mondayOfWeek(now);
    mon.setDate(mon.getDate() + weekOffset * 7);
    return mon;
  })();
  const weekDays = weekDateStrings(weekMonday);
  const weekEnd = new Date(weekMonday);
  weekEnd.setDate(weekMonday.getDate() + 6);

  // 拉取屏幕上出现的月份（周视图跨度可能跨月）的节假日
  const visibleMonthsKey = useMemo(() => {
    const keys = new Set<string>();
    if (viewMode === 'week') {
      weekDays.forEach((d) => keys.add(d.slice(0, 7)));
    } else {
      keys.add(`${calYear}-${String(calMonth).padStart(2, '0')}`);
    }
    return [...keys].sort().join(',');
  }, [viewMode, weekDays, calYear, calMonth]);

  useEffect(() => {
    let alive = true;
    const months = visibleMonthsKey.split(',').filter(Boolean);
    if (months.length === 0) return;
    getSysHolidaysForMonths(months).then((m) => { if (alive) setSysHolidays(m); });
    return () => { alive = false; };
  }, [visibleMonthsKey]);

  const weekProgress = useMemo(() => {
    if (!activeGoal || activeGoal.type !== 'weekly') return null;
    const count = weekDays.filter((d) => {
      const r = getRecord(activeGoal.id, d);
      return r && r.status === 'success';
    }).length;
    return { count, target: activeGoal.targetCount, pct: Math.min(100, Math.round((count / activeGoal.targetCount) * 100)) };
  }, [weekDays, activeGoal, data.records]);

  // ---- Month View ----
  const monthProgress = useMemo(() => {
    if (!activeGoal || activeGoal.type !== 'monthly') return null;
    const yearMonth = `${calYear}-${String(calMonth).padStart(2, '0')}`;
    const count = data.records.filter(
      (r) => r.goalId === activeGoal.id && r.date.startsWith(yearMonth) && r.status === 'success'
    ).length;
    return { count, target: activeGoal.targetCount, pct: Math.min(100, Math.round((count / activeGoal.targetCount) * 100)) };
  }, [calYear, calMonth, activeGoal, data.records]);

  const totalDays = daysInMonth(calYear, calMonth);
  const prevMonthDays = daysInMonth(calYear, calMonth - 1 === 0 ? 12 : calMonth - 1);

  // Columns run Monday-first (一..日) but getDay() is Sunday-first (0=Sunday),
  // so months starting on a Sunday used to be shifted one column off.
  const leadingBlanks = (getFirstDayOfWeek(calYear, calMonth) + 6) % 7;

  const monthCalendarDays: { day: number; month: 'prev' | 'current' | 'next'; dateStr: string }[] = [];
  for (let i = leadingBlanks - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = calMonth - 1 === 0 ? 12 : calMonth - 1;
    const y = calMonth - 1 === 0 ? calYear - 1 : calYear;
    monthCalendarDays.push({ day: d, month: 'prev', dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  for (let d = 1; d <= totalDays; d++) {
    monthCalendarDays.push({ day: d, month: 'current', dateStr: `${calYear}-${String(calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  const remaining = 42 - monthCalendarDays.length;
  for (let d = 1; d <= remaining; d++) {
    const m = calMonth + 1 > 12 ? 1 : calMonth + 1;
    const y = calMonth + 1 > 12 ? calYear + 1 : calYear;
    monthCalendarDays.push({ day: d, month: 'next', dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }

  const canUseWeek = activeGoal?.type === 'weekly';
  const canUseMonth = activeGoal?.type === 'monthly';

  // Summary period key
  const summaryPeriodKey = useMemo(() => {
    if (!activeGoal) return '';
    if (viewMode === 'week') {
      return weekDateStrings(weekMonday)[0]; // monday date
    }
    return `${calYear}-${String(calMonth).padStart(2, '0')}`;
  }, [activeGoal, viewMode, weekMonday, calYear, calMonth]);

  const currentSummary = useMemo(() => {
    if (!activeGoal || !summaryPeriodKey) return null;
    return data.summaries.find(
      (s) => s.goalId === activeGoal.id && s.periodKey === summaryPeriodKey
    ) || null;
  }, [data.summaries, activeGoal, summaryPeriodKey]);

  // Load summary when period/goal changes
  useEffect(() => {
    setSummaryText(currentSummary?.text ?? '');
    setSummarySaved(true);
  }, [summaryPeriodKey, activeGoalId]);

  const handleSaveSummary = async (text: string) => {
    if (!activeGoal || !summaryPeriodKey) return;
    setSummarySaved(false);
    const existing = data.summaries.find(
      (s) => s.goalId === activeGoal.id && s.periodKey === summaryPeriodKey
    );
    let updatedSummaries: CheckInSummary[];
    if (!text.trim()) {
      updatedSummaries = data.summaries.filter(
        (s) => !(s.goalId === activeGoal.id && s.periodKey === summaryPeriodKey)
      );
    } else if (existing) {
      updatedSummaries = data.summaries.map((s) =>
        s.id === existing.id ? { ...s, text: text.trim(), updatedAt: new Date().toISOString() } : s
      );
    } else {
      updatedSummaries = [
        ...data.summaries,
        {
          id: Date.now().toString(),
          goalId: activeGoal.id,
          periodKey: summaryPeriodKey,
          text: text.trim(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }
    const newData = { ...data, summaries: updatedSummaries };
    setData(newData);
    await saveCheckIn(newData);
    setSummarySaved(true);
  };

  const handleSummaryChange = (text: string) => {
    setSummaryText(text);
    if (summaryTimer.current) clearTimeout(summaryTimer.current);
    summaryTimer.current = setTimeout(() => handleSaveSummary(text), 800);
  };

  return (
    <div className="checkin-page">
      {/* Goal selector */}
      <div className="checkin-goal-tabs">
        {data.goals.map((goal) => (
          <button
            key={goal.id}
            className={`checkin-goal-tab ${goal.id === activeGoalId ? 'active' : ''}`}
            onClick={() => {
              setActiveGoalId(goal.id);
              setViewMode(goal.type === 'weekly' ? 'week' : 'month');
              setWeekOffset(0);
            }}
            onContextMenu={(e) => { e.preventDefault(); openEditGoal(goal); }}
          >
            {goal.name}
          </button>
        ))}
        <button className="checkin-goal-tab add" onClick={openNewGoal}>+ 新目标</button>
      </div>

      {!activeGoal ? (
        <EmptyState emoji="✅" title="还没有打卡目标~" tips={['点击"+ 新目标"开始打卡吧！', '坚持就是胜利', '每天进步一点点', '养成好习惯']} />
      ) : (
        <>
          {/* View toggle */}
          <div className="ac-subnav" style={{ justifyContent: 'center' }}>
            <button
              className={`ac-subnav-btn ${canUseWeek && viewMode === 'week' ? 'active' : ''}`}
              onClick={() => { if (canUseWeek) { setViewMode('week'); setWeekOffset(0); } }}
              style={{ opacity: canUseWeek ? 1 : 0.5 }}
            >
              📅 周视图
            </button>
            <button
              className={`ac-subnav-btn ${canUseMonth && viewMode === 'month' ? 'active' : ''}`}
              onClick={() => { if (canUseMonth) { setViewMode('month'); const n = new Date(); setCalYear(n.getFullYear()); setCalMonth(n.getMonth() + 1); } }}
              style={{ opacity: canUseMonth ? 1 : 0.5 }}
            >
              🗓 月视图
            </button>
          </div>

          {/* Progress */}
          {viewMode === 'week' && weekProgress && (
            <div className="checkin-progress">
              <div className="checkin-progress-text">
                进度：{weekProgress.count}/{weekProgress.target} 次
              </div>
              <div className="checkin-progress-bar">
                <div className="checkin-progress-fill" style={{ width: `${weekProgress.pct}%` }} />
              </div>
            </div>
          )}
          {viewMode === 'month' && monthProgress && (
            <div className="checkin-progress">
              <div className="checkin-progress-text">
                进度：{monthProgress.count}/{monthProgress.target} 天
              </div>
              <div className="checkin-progress-bar">
                <div className="checkin-progress-fill" style={{ width: `${monthProgress.pct}%` }} />
              </div>
            </div>
          )}

          {/* Week View */}
          {viewMode === 'week' && (
            <div className="checkin-week">
              <div className="checkin-week-header">
                <button className="mini-cal-nav" onClick={() => setWeekOffset((o) => o - 1)}>‹</button>
                <span className="checkin-week-label">
                  {weekDays[0]} ~ {weekDays[6]}
                </span>
                <button className="mini-cal-nav" onClick={() => setWeekOffset((o) => o + 1)}>›</button>
                {weekOffset !== 0 && (
                  <button className="ac-subnav-btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setWeekOffset(0)}>📍 今天</button>
                )}
              </div>
              <div className="checkin-week-grid">
                {weekDays.map((dateStr, idx) => {
                  const rec = getRecord(activeGoal.id, dateStr);
                  const isToday = dateStr === today;
                  const isFuture = dateStr > today;
                  const missed = isMissed(dateStr);
                  return (
                    <div key={dateStr} className="checkin-day-col">
                      <div className="checkin-day-label">{WEEKDAYS[idx]}</div>
                      <button
                        className={`checkin-dot ${rec?.status === 'success' ? 'success' : ''} ${rec?.status === 'fail' ? 'fail' : ''} ${missed ? 'missed' : ''} ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''}`}
                        onClick={() => handleToggleDay(activeGoal.id, dateStr)}
                        disabled={isFuture}
                      >
                        {rec?.status === 'success' ? '✓' : rec?.status === 'fail' ? '✗' : missed ? '✗' : ''}
                      </button>
                      <div className="checkin-day-num">{dateStr.slice(8)}</div>
                      <div className="checkin-day-holiday">{sysHolidays.get(dateStr)?.emoji ?? ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Month View */}
          {viewMode === 'month' && (
            <div className="checkin-month">
              <div className="mini-cal-header">
                <button className="mini-cal-nav" onClick={() => {
                  if (calMonth === 1) { setCalMonth(12); setCalYear((y) => y - 1); }
                  else setCalMonth((m) => m - 1);
                }}>‹</button>
                <span className="mini-cal-title">{calYear}年{calMonth}月</span>
                <button className="mini-cal-nav" onClick={() => {
                  if (calMonth === 12) { setCalMonth(1); setCalYear((y) => y + 1); }
                  else setCalMonth((m) => m + 1);
                }}>›</button>
                {(calYear !== new Date().getFullYear() || calMonth !== new Date().getMonth() + 1) && (
                  <button className="ac-subnav-btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => { const n = new Date(); setCalYear(n.getFullYear()); setCalMonth(n.getMonth() + 1); }}>📍 今天</button>
                )}
              </div>
              <div className="mini-cal-weekdays">
                {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
              </div>
              <div className="checkin-month-grid">
                {monthCalendarDays.map(({ day, month, dateStr }) => {
                  const rec = getRecord(activeGoal.id, dateStr);
                  const isToday = dateStr === today;
                  const isFuture = dateStr > today;
                  const isOther = month !== 'current';
                  const missed = !isOther && isMissed(dateStr);
                  return (
                    <button
                      key={dateStr}
                      className={`checkin-month-dot ${rec?.status === 'success' ? 'success' : ''} ${rec?.status === 'fail' ? 'fail' : ''} ${missed ? 'missed' : ''} ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''} ${isOther ? 'other' : ''}`}
                      onClick={() => handleToggleDay(activeGoal.id, dateStr)}
                      disabled={isFuture || isOther}
                    >
                      {day}
                      {!isOther && sysHolidays.get(dateStr) && (
                        <span className="checkin-month-holi">{sysHolidays.get(dateStr)?.emoji}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="checkin-summary">
            <div className="checkin-summary-header">
              <span>📝 {viewMode === 'week' ? '本周' : '本月'}总结</span>
              {!summarySaved && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>保存中...</span>}
            </div>
            <textarea
              className="checkin-summary-input"
              placeholder={viewMode === 'week' ? '这周有什么收获或感想？' : '这个月有什么收获或感想？'}
              value={summaryText}
              onChange={(e) => handleSummaryChange(e.target.value)}
              rows={3}
            />
          </div>
        </>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="ac-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3>{editingGoal ? '✏️ 编辑目标' : '✅ 新建打卡目标'}</h3>
            <div className="arm-field">
              <label className="arm-label">目标名称</label>
              <input className="arm-input" type="text" placeholder="例如：健身" value={goalName} onChange={(e) => setGoalName(e.target.value)} autoFocus />
            </div>
            <div className="arm-field">
              <label className="arm-label">目标类型</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="tag-chip" type="button"
                  style={{ flex: 1, padding: '10px 20px', background: goalType === 'weekly' ? 'var(--primary)' : 'var(--bg)', color: goalType === 'weekly' ? 'var(--on-primary)' : 'var(--text-secondary)' }}
                  onClick={() => { setGoalType('weekly'); setGoalCountInput(String(clampCount(parseInt(goalCountInput, 10), 'weekly'))); }}
                >📅 周目标</button>
                <button
                  className="tag-chip" type="button"
                  style={{ flex: 1, padding: '10px 20px', background: goalType === 'monthly' ? 'var(--primary)' : 'var(--bg)', color: goalType === 'monthly' ? 'var(--on-primary)' : 'var(--text-secondary)' }}
                  onClick={() => { setGoalType('monthly'); setGoalCountInput(String(clampCount(parseInt(goalCountInput, 10), 'monthly'))); }}
                >🗓 月目标</button>
              </div>
            </div>
            <div className="arm-field">
              <label className="arm-label">
                {goalType === 'weekly' ? '每周次数' : '每月天数'}（{goalType === 'weekly' ? '1-7' : '1-31'}）
              </label>
              <input
                className="arm-input"
                type="number"
                inputMode="numeric"
                placeholder={goalType === 'weekly' ? '1-7' : '1-31'}
                value={goalCountInput}
                onChange={(e) => setGoalCountInput(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={() => setGoalCountInput(String(clampCount(parseInt(goalCountInput, 10), goalType)))}
              />
            </div>
            {editingGoal && (
              <div className="arm-field" style={{ textAlign: 'center' }}>
                <button className="ac-modal-btn cancel" style={{ color: '#FF6B6B' }} onClick={() => handleDeleteGoal(editingGoal.id)}>删除此目标</button>
              </div>
            )}
            <div className="ac-modal-btns">
              <button className="ac-modal-btn cancel" onClick={() => setShowSettings(false)}>取消</button>
              <button className="ac-modal-btn confirm" onClick={handleSaveGoal}>{editingGoal ? '保存' : '创建'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
