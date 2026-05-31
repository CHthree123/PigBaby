import { useState, useEffect, useCallback } from 'react';
import { type Record, type AppData, loadData, saveData, exportData } from '../storage';
import AddRecordModal from '../components/AddRecordModal';
import './Accounting.css';

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${parseInt(m)}月`;
}

function formatDate(date: string): string {
  const parts = date.split('-');
  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
}

export default function Accounting() {
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth);
  const [data, setData] = useState<AppData>({ monthlyBudget: 3000, records: [] });
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('expense');
  const [showSettings, setShowSettings] = useState(false);
  const [budgetInput, setBudgetInput] = useState('3000');

  const refresh = useCallback(async () => {
    const d = await loadData();
    setData(d);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const monthRecords = data.records.filter((r) => r.month === currentMonth);

  const monthIncome = monthRecords
    .filter((r) => r.type === 'income')
    .reduce((sum, r) => sum + r.amount, 0);

  const monthExpense = monthRecords
    .filter((r) => r.type === 'expense')
    .reduce((sum, r) => sum + r.amount, 0);

  const remaining = data.monthlyBudget + monthIncome - monthExpense;

  const sortedRecords = [...monthRecords].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const prevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const nextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const openModal = (type: 'income' | 'expense') => {
    setModalType(type);
    setShowModal(true);
  };

  const handleSave = async (record: Record) => {
    const updated: AppData = {
      ...data,
      records: [...data.records, record],
    };
    await saveData(updated);
    setShowModal(false);
    await refresh();
  };

  const handleSaveBudget = async () => {
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val < 0) return;
    const updated: AppData = { ...data, monthlyBudget: val };
    await saveData(updated);
    setShowSettings(false);
    await refresh();
  };

  return (
    <div className="accounting-page">
      {/* Header */}
      <div className="ac-header">
        <button className="ac-month-btn" onClick={prevMonth}>‹</button>
        <h2 className="ac-month-title">{formatMonth(currentMonth)}</h2>
        <button className="ac-month-btn" onClick={nextMonth}>›</button>
      </div>

      {/* Balance Card */}
      <div className={`ac-balance-card ${remaining >= 0 ? 'positive' : 'negative'}`}>
        <div className="ac-balance-label">本月剩余</div>
        <div className="ac-balance-amount">
          <span className="ac-balance-symbol">¥</span>
          {remaining.toFixed(2)}
        </div>
        <div className="ac-balance-details">
          <div className="ac-balance-detail-item">
            <span className="ac-detail-label">月预算</span>
            <span className="ac-detail-value">¥{data.monthlyBudget.toFixed(2)}</span>
          </div>
          <div className="ac-balance-divider" />
          <div className="ac-balance-detail-item">
            <span className="ac-detail-label">已支出</span>
            <span className="ac-detail-value expense">¥{monthExpense.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="ac-actions">
        <button className="ac-btn ac-btn-income" onClick={() => openModal('income')}>
          <span className="ac-btn-icon">+</span>
          记收入
        </button>
        <button className="ac-btn ac-btn-expense" onClick={() => openModal('expense')}>
          <span className="ac-btn-icon">−</span>
          记支出
        </button>
      </div>

      {/* Records List */}
      <div className="ac-records-section">
        <div className="ac-records-header">
          <h3>最近记录</h3>
          <div className="ac-records-header-actions">
            <button className="ac-settings-btn" onClick={() => {
              setBudgetInput(String(data.monthlyBudget));
              setShowSettings(true);
            }}>⚙</button>
            <button className="ac-export-btn" onClick={exportData}>导出</button>
          </div>
        </div>

        {sortedRecords.length === 0 ? (
          <div className="ac-empty">暂无记录，开始记账吧</div>
        ) : (
          <div className="ac-records-list">
            {sortedRecords.map((r) => (
              <div key={r.id} className="ac-record-item">
                <div className={`ac-record-icon ${r.type}`}>
                  {r.type === 'income' ? '💰' : '💸'}
                </div>
                <div className="ac-record-info">
                  <div className="ac-record-note">{r.note || (r.type === 'income' ? '收入' : '支出')}</div>
                  <div className="ac-record-date">{formatDate(r.date)}</div>
                </div>
                <div className={`ac-record-amount ${r.type}`}>
                  {r.type === 'income' ? '+' : '−'}¥{r.amount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Record Modal */}
      {showModal && (
        <AddRecordModal
          type={modalType}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="ac-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <h3>设置月预算</h3>
            <div className="ac-settings-body">
              <label className="ac-settings-label">每月预算金额</label>
              <div className="ac-settings-input-wrap">
                <span className="ac-settings-prefix">¥</span>
                <input
                  className="ac-settings-input"
                  type="number"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  inputMode="decimal"
                  autoFocus
                />
              </div>
            </div>
            <div className="ac-modal-btns">
              <button className="ac-modal-btn cancel" onClick={() => setShowSettings(false)}>取消</button>
              <button className="ac-modal-btn confirm" onClick={handleSaveBudget}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
