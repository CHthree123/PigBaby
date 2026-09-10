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

interface TagSlice {
  tag: string;
  amount: number;
}

function groupByTag(records: Transaction[], type: 'expense' | 'income'): TagSlice[] {
  const map: Record<string, number> = {};
  for (const r of records) {
    if (r.type !== type) continue;
    const t = r.tag || '其他';
    map[t] = (map[t] || 0) + r.amount;
  }
  return (Object.entries(map) as [string, number][])
    .map(([tag, amount]) => ({ tag, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function TagColumnChart({
  title,
  slices,
  tagColors,
  selectedTag,
  onSelect,
}: {
  title: string;
  slices: TagSlice[];
  tagColors: Record<string, string>;
  selectedTag: string | null;
  onSelect: (tag: string) => void;
}) {
  const max = Math.max(...slices.map((s) => s.amount), 1);
  return (
    <div className="daily-tag-chart">
      <div className="daily-tag-chart-title">{title}</div>
      <div className="v-bar-chart">
        {slices.map(({ tag, amount }) => (
          <div
            key={tag}
            className={`v-bar-col ${selectedTag === tag ? 'selected' : ''}`}
            onClick={() => onSelect(tag)}
          >
            <span className="v-bar-value">¥{amount.toFixed(0)}</span>
            <div className="v-bar-track">
              <div
                className="v-bar-fill"
                style={{
                  height: `${Math.max((amount / max) * 100, 4)}%`,
                  background: tagColors[tag] || '#FF9BB3',
                }}
              />
            </div>
            <span className="v-bar-label" style={{ color: tagColors[tag] || '#666' }}>{tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DailyRecords({ records, onEdit }: Props) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<{ tag: string; type: 'expense' | 'income' } | null>(null);

  useEffect(() => {
    loadTagColors().then(setTagColors);
  }, []);

  useEffect(() => {
    setSelected(null);
  }, [selectedDate]);

  const dayRecords = useMemo(
    () => records.filter((r) => r.date === selectedDate).sort((a, b) => parseInt(b.id) - parseInt(a.id)),
    [records, selectedDate]
  );

  const dayIncome = dayRecords.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const dayExpense = dayRecords.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

  const expenseByTag = useMemo(() => groupByTag(dayRecords, 'expense'), [dayRecords]);
  const incomeByTag = useMemo(() => groupByTag(dayRecords, 'income'), [dayRecords]);

  const dayTotalExpense = expenseByTag.reduce((s, t) => s + t.amount, 0);
  const dayTotalIncome = incomeByTag.reduce((s, t) => s + t.amount, 0);

  const visibleRecords = useMemo(
    () => (selected
      ? dayRecords.filter((r) => r.type === selected.type && (r.tag || '其他') === selected.tag)
      : dayRecords),
    [dayRecords, selected]
  );

  const toggle = (type: 'expense' | 'income', tag: string) => {
    setSelected(selected && selected.type === type && selected.tag === tag ? null : { type, tag });
  };

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
        <TagColumnChart
          title={`📊 当日支出分类（合计 ¥${dayTotalExpense.toFixed(2)}，点柱子看明细）`}
          slices={expenseByTag}
          tagColors={tagColors}
          selectedTag={selected?.type === 'expense' ? selected.tag : null}
          onSelect={(tag) => toggle('expense', tag)}
        />
      )}

      {incomeByTag.length > 0 && (
        <TagColumnChart
          title={`📊 当日收入分类（合计 ¥${dayTotalIncome.toFixed(2)}，点柱子看明细）`}
          slices={incomeByTag}
          tagColors={tagColors}
          selectedTag={selected?.type === 'income' ? selected.tag : null}
          onSelect={(tag) => toggle('income', tag)}
        />
      )}

      {selected && (
        <div className="daily-filter-bar">
          <span className="daily-filter-chip">
            🏷️ {selected.tag} {selected.type === 'expense' ? '支出' : '收入'}明细
          </span>
          <button className="daily-filter-clear" onClick={() => setSelected(null)}>显示全部</button>
        </div>
      )}

      {visibleRecords.length === 0 ? (
        <EmptyState
          emoji="📅"
          title={selected ? `这一天没有 ${selected.tag} 的记录` : '📅 这天没有记录哦~'}
        />
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
