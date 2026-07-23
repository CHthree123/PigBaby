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

  useEffect(() => {
    loadTagColors().then(setTagColors);
  }, []);

  const dayRecords = useMemo(
    () => records.filter((r) => r.date === selectedDate).sort((a, b) => parseInt(b.id) - parseInt(a.id)),
    [records, selectedDate]
  );

  const dayIncome = dayRecords.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const dayExpense = dayRecords.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

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

      {dayRecords.length === 0 ? (
        <EmptyState emoji="📅" title="📅 这天没有记录哦~" />
      ) : (
        <div className="ac-records-list">
          {dayRecords.map((r) => (
            <div key={r.id} className="ac-record-item" onClick={() => onEdit?.(r)}>
              <div className={`ac-record-icon ${r.type}`}>
                {r.type === 'income' ? '💰' : '💸'}
              </div>
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
