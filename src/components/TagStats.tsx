import { useState, useEffect, useMemo } from 'react';
import type { Transaction } from '../storage';
import { loadTagColors } from '../storage';
import EmptyState from './EmptyState';

interface Props {
  records: Transaction[];
  currentMonth: string;
  onMonthChange: (month: string) => void;
  onEdit?: (record: Transaction) => void;
}

type StatsMode = 'month' | 'day';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${parseInt(m)}月`;
}

function formatDate(date: string): string {
  const parts = date.split('-');
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

function sortChronological(records: Transaction[]): Transaction[] {
  return [...records].sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return parseInt(b.id) - parseInt(a.id);
  });
}

export default function TagStats({ records, currentMonth, onMonthChange, onEdit }: Props) {
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [mode, setMode] = useState<StatsMode>('month');
  const [selectedDate, setSelectedDate] = useState(todayStr());

  useEffect(() => {
    loadTagColors().then(setTagColors);
  }, []);

  // Month stats
  const monthExpenses = useMemo(
    () => records.filter((r) => r.month === currentMonth && r.type === 'expense'),
    [records, currentMonth]
  );

  const tagStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of monthExpenses) {
      const t = r.tag || '其他';
      map[t] = (map[t] || 0) + r.amount;
    }
    const entries = Object.entries(map) as [string, number][];
    const total = entries.reduce((s, [, v]) => s + v, 0);
    return entries
      .map(([tag, amount]) => ({ tag, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthExpenses]);

  const monthTotalExpense = tagStats.reduce((s, t) => s + t.amount, 0);

  // Day stats
  const dayExpenses = useMemo(
    () => records.filter((r) => r.date === selectedDate && r.type === 'expense'),
    [records, selectedDate]
  );

  const dayTagStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of dayExpenses) {
      const t = r.tag || '其他';
      map[t] = (map[t] || 0) + r.amount;
    }
    const entries = Object.entries(map) as [string, number][];
    const total = entries.reduce((s, [, v]) => s + v, 0);
    return entries
      .map(([tag, amount]) => ({ tag, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [dayExpenses]);

  const dayTotalExpense = dayTagStats.reduce((s, t) => s + t.amount, 0);

  // Drill-down records based on mode
  const tagRecords = useMemo(() => {
    if (!selectedTag) return [];
    const source = mode === 'month' ? monthExpenses : dayExpenses;
    return sortChronological(source.filter((r) => (r.tag || '其他') === selectedTag));
  }, [mode, monthExpenses, dayExpenses, selectedTag]);

  // Active stats based on mode
  const activeStats = mode === 'month' ? tagStats : dayTagStats;
  const activeTotal = mode === 'month' ? monthTotalExpense : dayTotalExpense;

  const prevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const nextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const changeDate = (dir: -1 | 1) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir);
    setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };

  return (
    <div className="accounting-page">
      {/* Mode toggle */}
      <div className="tag-mode-toggle">
        <button className={`tag-mode-btn ${mode === 'month' ? 'active' : ''}`} onClick={() => { setMode('month'); setSelectedTag(null); }}>📅 月统计</button>
        <button className={`tag-mode-btn ${mode === 'day' ? 'active' : ''}`} onClick={() => { setMode('day'); setSelectedTag(null); }}>📆 日统计</button>
      </div>

      {/* Header based on mode */}
      {mode === 'month' ? (
        <div className="tag-stats-header">
          <button className="ac-month-btn" onClick={prevMonth}>‹</button>
          <h3>🏷️ {formatMonth(currentMonth)} 标签统计</h3>
          <button className="ac-month-btn" onClick={nextMonth}>›</button>
        </div>
      ) : (
        <div className="tag-stats-header">
          <button className="ac-month-btn" onClick={() => changeDate(-1)}>‹</button>
          <h3>🏷️ {selectedDate} 标签统计</h3>
          <button className="ac-month-btn" onClick={() => changeDate(1)}>›</button>
        </div>
      )}

      {activeStats.length === 0 ? (
        <EmptyState emoji="🏷️" title={mode === 'month' ? '这个月还没有支出记录~' : '这天还没有支出记录~'} />
      ) : (
        <>
          <div className="tag-stats-total">
            {mode === 'month' ? '本月' : '当日'}总支出：<strong>¥{activeTotal.toFixed(2)}</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activeStats.map(({ tag, amount, pct }) => (
              <div
                key={tag}
                className="tag-bar-item"
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                style={{ cursor: 'pointer', background: selectedTag === tag ? '#fff0f4' : 'transparent', borderRadius: 10, padding: '8px 8px' }}
              >
                <span className="tag-bar-label" style={{ color: tagColors[tag] || '#666' }}>{tag}</span>
                <div className="tag-bar-track">
                  <div
                    className="tag-bar-fill"
                    style={{ width: `${Math.max(pct, 1)}%`, background: tagColors[tag] || '#FF9BB3' }}
                  />
                </div>
                <span className="tag-bar-amount">¥{amount.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tag detail modal */}
      {selectedTag && (
        <div className="tag-detail-modal" onClick={() => setSelectedTag(null)}>
          <div className="tag-detail-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3 style={{ marginBottom: 16, color: tagColors[selectedTag] || '#FF9BB3' }}>
              🏷️ {selectedTag} 记录
            </h3>
            {tagRecords.length === 0 ? (
              <EmptyState emoji="🏷️" title="暂无记录" />
            ) : (
              <div className="ac-records-list">
                {tagRecords.map((r) => (
                  <div key={r.id} className="ac-record-item" onClick={() => onEdit?.(r)}>
                    <div className="ac-record-icon expense">💸</div>
                    <div className="ac-record-info">
                      <div className="ac-record-note">{r.note || '支出'}</div>
                      <div className="ac-record-date">{formatDate(r.date)}</div>
                    </div>
                    <div className="ac-record-amount expense">−¥{r.amount.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
