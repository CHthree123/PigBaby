import { useState, useMemo, useEffect } from 'react';
import type { Transaction } from '../storage';
import { loadTagColors } from '../storage';
import EmptyState from './EmptyState';
import AnimatedNumber from './AnimatedNumber';

interface Props {
  records: Transaction[];
  onEdit?: (record: Transaction) => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(date: string): string {
  const parts = date.split('-');
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

export default function DailyRecords({ records, onEdit }: Props) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    loadTagColors().then(setTagColors);
  }, []);

  useEffect(() => {
    setSelectedTag(null);
  }, [selectedDate]);

  const dayRecords = useMemo(
    () => records.filter((r) => r.date === selectedDate).sort((a, b) => parseInt(b.id) - parseInt(a.id)),
    [records, selectedDate]
  );

  const dayIncome = dayRecords.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const dayExpense = dayRecords.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

  // Expenses grouped by tag for the bar chart, biggest first
  const expenseByTag = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of dayRecords) {
      if (r.type !== 'expense') continue;
      const t = r.tag || '其他';
      map[t] = (map[t] || 0) + r.amount;
    }
    const entries = Object.entries(map) as [string, number][];
    const total = entries.reduce((s, [, v]) => s + v, 0);
    return entries
      .map(([tag, amount]) => ({ tag, amount, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [dayRecords]);

  const dayTotalExpense = expenseByTag.reduce((s, t) => s + t.amount, 0);

  const visibleRecords = useMemo(
    () => (selectedTag ? dayRecords.filter((r) => r.type === 'expense' && (r.tag || '其他') === selectedTag) : dayRecords),
    [dayRecords, selectedTag]
  );

  return (
    <div className="accounting-page">
      <div className="daily-header">
        <h3>📅 按日查询</h3>
        <input
          className="arm-input"
          style={{ flex: 1, maxWidth: 200 }}
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <div className="daily-summary">
        <div className="daily-summary-item income">
          <div className="daily-summary-label">当日收入</div>
          <div className="daily-summary-amount income">+<AnimatedNumber value={dayIncome} prefix="¥" /></div>
        </div>
        <div className="daily-summary-item expense">
          <div className="daily-summary-label">当日支出</div>
          <div className="daily-summary-amount expense">−<AnimatedNumber value={dayExpense} prefix="¥" /></div>
        </div>
      </div>

      {expenseByTag.length > 0 && (
        <div className="daily-tag-chart">
          <div className="daily-tag-chart-title">
            📊 当日支出分类（合计 ¥{dayTotalExpense.toFixed(2)}，点标签看明细）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {expenseByTag.map(({ tag, amount, pct }) => (
              <div
                key={tag}
                className="tag-bar-item"
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                style={{ cursor: 'pointer', background: selectedTag === tag ? 'var(--tag-selected)' : 'transparent', borderRadius: 10, padding: '8px 8px' }}
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
        </div>
      )}

      {selectedTag && (
        <div className="daily-filter-bar">
          <span className="daily-filter-chip">🏷️ {selectedTag} 支出明细</span>
          <button className="daily-filter-clear" onClick={() => setSelectedTag(null)}>显示全部</button>
        </div>
      )}

      {visibleRecords.length === 0 ? (
        <EmptyState emoji="📅" title={selectedTag ? `这一天没有 ${selectedTag} 的记录` : '📅 这天没有记录哦~'} />
      ) : (
        <div className="ac-records-list">
          {visibleRecords.map((r) => (
            <div key={r.id} className="ac-record-item" onClick={() => onEdit?.(r)}>
              {r.type === 'income' && (
                <div className="ac-record-icon income" style={{ color: 'var(--success)' }}>💰</div>
              )}
              <div className="ac-record-info">
                <div className="ac-record-note">{r.note || (r.type === 'income' ? '收入' : '支出')}</div>
                <div className="ac-record-date">{formatDate(r.date)}</div>
                {r.tag && (
                  <span className="ac-record-tag" style={{ background: (tagColors[r.tag] || '#f0f0f0') + '30', color: tagColors[r.tag] || '#666' }}>
                    {r.tag}
                  </span>
                )}
              </div>
              <div className={`ac-record-amount ${r.type}`}>
                {r.type === 'income' ? '+' : '−'}¥{r.amount.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
