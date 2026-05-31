import { useState } from 'react';
import type { Record } from '../storage';
import './AddRecordModal.css';

interface Props {
  type: 'income' | 'expense';
  onSave: (record: Record) => void;
  onClose: () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddRecordModal({ type, onSave, onClose }: Props) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayStr());

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;

    const record: Record = {
      id: Date.now().toString(),
      amount: amt,
      type,
      note: note.trim(),
      date,
      month: date.slice(0, 7),
    };
    onSave(record);
  };

  const isValid = amount && parseFloat(amount) > 0;

  return (
    <div className="arm-overlay" onClick={onClose}>
      <div className="arm-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="arm-title">
          {type === 'income' ? '💰 记收入' : '💸 记支出'}
        </h3>

        <div className="arm-field">
          <label className="arm-label">金额</label>
          <div className="arm-amount-wrap">
            <span className="arm-amount-prefix">¥</span>
            <input
              className="arm-amount-input"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              autoFocus
            />
          </div>
        </div>

        <div className="arm-field">
          <label className="arm-label">备注</label>
          <input
            className="arm-input"
            type="text"
            placeholder={type === 'income' ? '例如：工资' : '例如：午餐'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="arm-field">
          <label className="arm-label">日期</label>
          <input
            className="arm-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="arm-btns">
          <button className="arm-btn arm-btn-cancel" onClick={onClose}>取消</button>
          <button
            className={`arm-btn arm-btn-save ${type}`}
            onClick={handleSave}
            disabled={!isValid}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
