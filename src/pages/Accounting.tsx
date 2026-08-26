import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type Transaction, type AppData, loadData, saveData, exportAllData, importAllData, loadTagColors, TAG_COLORS, loadSavingsGoals, saveSavingsGoals } from '../storage';
import AddRecordModal from '../components/AddRecordModal';
import DailyRecords from '../components/DailyRecords';
import TagStats from '../components/TagStats';
import PiggyBank from '../components/PiggyBank';
import EmptyState from '../components/EmptyState';
import AnimatedNumber from '../components/AnimatedNumber';
import SmsAutoSync from '../components/SmsAutoSync';
import './Accounting.css';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

type ViewMode = 'overview' | 'daily' | 'tags' | 'piggybank';

export default function Accounting() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<ViewMode>('overview');
  const viewKeyRef = useRef(0);
  const [viewKey, setViewKey] = useState(0);
  const switchView = (v: ViewMode) => {
    if (v === view) return;
    viewKeyRef.current += 1;
    setViewKey(viewKeyRef.current);
    setView(v);
  };
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth);
  const [data, setData] = useState<AppData>({ monthlyBudget: 3000, records: [] });
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'income' | 'expense'>('expense');
  const [showSettings, setShowSettings] = useState(false);
  const [budgetInput, setBudgetInput] = useState('3000');
  const [tagColors, setTagColors] = useState<Record<string,string>>({...TAG_COLORS});
  const [undoRecord, setUndoRecord] = useState<Transaction | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingRecord, setEditingRecord] = useState<Transaction | null>(null);
  const [loadedDays, setLoadedDays] = useState(1);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset loadedDays on view switch
  useEffect(() => {
    setLoadedDays(1);
  }, [viewKey]);

  // Handle pig button trigger — watch for URL param changes
  useEffect(() => {
    const action = searchParams.get('open');
    if (action === 'expense') {
      setView('overview');
      setModalType('expense');
      setShowModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams]);

  const refresh = useCallback(async () => {
    const d = await loadData();
    setData(d);
  }, []);

  useEffect(() => {
    refresh();
    loadTagColors().then(setTagColors);
  }, [refresh]);

  const monthRecords = data.records.filter((r) => r.month === currentMonth);

  const monthIncome = monthRecords
    .filter((r) => r.type === 'income')
    .reduce((sum, r) => sum + r.amount, 0);

  const monthExpense = monthRecords
    .filter((r) => r.type === 'expense')
    .reduce((sum, r) => sum + r.amount, 0);

  const remaining = data.monthlyBudget + monthIncome - monthExpense;

  const today = todayStr();

  const visibleDates = useMemo(() => {
    const dates: string[] = [];
    const d = new Date();
    for (let i = 0; i < loadedDays; i++) {
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      d.setDate(d.getDate() - 1);
    }
    return dates;
  }, [loadedDays]);

  const recordGroups = useMemo(() => {
    const dateSet = new Set(visibleDates);
    const filtered = monthRecords.filter((r) => dateSet.has(r.date)).sort((a, b) => parseInt(b.id) - parseInt(a.id));
    // Group by date preserving date order (newest first from visibleDates)
    const groups: { date: string; records: Transaction[] }[] = [];
    for (const d of visibleDates) {
      const recs = filtered.filter((r) => r.date === d);
      if (recs.length > 0) groups.push({ date: d, records: recs });
    }
    return groups;
  }, [monthRecords, visibleDates]);

  // IntersectionObserver for load-more
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setLoadedDays((prev) => Math.min(prev + 1, 31));
      }
    }, { rootMargin: '80px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [recordGroups]);

  // Auto-expand to yesterday if today has no records
  const todayHasRecords = useMemo(() =>
    data.records.some((r) => r.date === today),
    [data.records, today]
  );

  useEffect(() => {
    if (!todayHasRecords) {
      setLoadedDays((prev) => (prev <= 1 ? 2 : prev));
    }
  }, [todayHasRecords]);

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

  const handleSave = async (record: Transaction) => {
    const updated: AppData = {
      ...data,
      records: [...data.records, record],
    };
    await saveData(updated);
    setShowModal(false);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    const deleted = data.records.find((r) => r.id === id);
    const updated: AppData = {
      ...data,
      records: data.records.filter((r) => r.id !== id),
    };
    await saveData(updated);

    // If deleting a savings deposit, reverse the goal amount
    if (deleted) {
      const match = deleted.note.match(/存入\[(.+?)\]$/);
      if (match) {
        const goalName = match[1];
        const savings = await loadSavingsGoals();
        const updatedGoals = savings.goals.map((g) =>
          g.name === goalName ? { ...g, savedAmount: Math.max(0, g.savedAmount - deleted.amount) } : g
        );
        await saveSavingsGoals({ goals: updatedGoals });
      }
    }

    await refresh();

    if (deleted) {
      setUndoRecord(deleted);
      setUndoVisible(true);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        setUndoVisible(false);
        setUndoRecord(null);
      }, 4000);
    }
  };

  const handleUndo = async () => {
    if (!undoRecord) return;
    const updated: AppData = {
      ...data,
      records: [...data.records, undoRecord],
    };
    await saveData(updated);

    // If undoing a savings deposit deletion, restore the goal amount
    const match = undoRecord.note.match(/存入\[(.+?)\]$/);
    if (match) {
      const goalName = match[1];
      const savings = await loadSavingsGoals();
      const updatedGoals = savings.goals.map((g) =>
        g.name === goalName ? { ...g, savedAmount: g.savedAmount + undoRecord.amount } : g
      );
      await saveSavingsGoals({ goals: updatedGoals });
    }

    setUndoVisible(false);
    setUndoRecord(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    await refresh();
  };

  const handleSaveEdit = async (record: Transaction) => {
    const updated: AppData = {
      ...data,
      records: data.records.map((r) => r.id === record.id ? record : r),
    };
    await saveData(updated);
    setEditingRecord(null);
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

  const handleSmsImported = async (transactions: Transaction[], added: number) => {
    if (added === 0) return;
    const updated: AppData = {
      ...data,
      records: [...data.records, ...transactions],
    };
    await saveData(updated);
    await refresh();
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        await importAllData(json);
        await refresh();
        alert('导入成功！');
      } catch {
        alert('导入失败，请检查文件格式');
      }
    };
    input.click();
  };

  // Common wrapper with sub-nav always visible
  return (
    <div className="accounting-page">
      {/* Sub-nav — always visible */}
      <div className="ac-subnav">
        <button className={`ac-subnav-btn ${view === 'overview' ? 'active' : ''}`} onClick={() => switchView('overview')}>📊 月概览</button>
        <button className={`ac-subnav-btn ${view === 'daily' ? 'active' : ''}`} onClick={() => switchView('daily')}>📅 按日查询</button>
        <button className={`ac-subnav-btn ${view === 'tags' ? 'active' : ''}`} onClick={() => switchView('tags')}>🏷️ 标签统计</button>
        <button className={`ac-subnav-btn ${view === 'piggybank' ? 'active' : ''}`} onClick={() => switchView('piggybank')}>🐷 存钱罐</button>
      </div>

      <SmsAutoSync
        records={data.records}
        onImported={handleSmsImported}
      />

      {view === 'daily' && (
        <div key={`daily-${viewKey}`} className="view-slide-in">
          <DailyRecords
            records={data.records}
            onEdit={(r) => setEditingRecord(r)}
          />
        </div>
      )}

      {view === 'tags' && (
        <div key={`tags-${viewKey}`} className="view-slide-in">
          <TagStats
            records={data.records}
            currentMonth={currentMonth}
            onMonthChange={(m) => setCurrentMonth(m)}
            onEdit={(r) => setEditingRecord(r)}
          />
        </div>
      )}

      {view === 'piggybank' && (
        <div key={`piggy-${viewKey}`} className="view-slide-in">
          <PiggyBank
            remaining={remaining}
            data={data}
            onDataChange={async (d) => { await saveData(d); await refresh(); }}
            onRefresh={refresh}
          />
        </div>
      )}

      {view === 'overview' && (
        <div key={`overview-${viewKey}`} className="view-slide-in">
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
              <AnimatedNumber value={remaining} prefix="¥" />
            </div>
        <div className="ac-balance-details">
          <div className="ac-balance-detail-item">
            <span className="ac-detail-label">月预算</span>
            <span className="ac-detail-value"><AnimatedNumber value={data.monthlyBudget} prefix="¥" /></span>
          </div>
          <div className="ac-balance-divider" />
          <div className="ac-balance-detail-item">
            <span className="ac-detail-label">已支出</span>
            <span className="ac-detail-value expense"><AnimatedNumber value={monthExpense} prefix="¥" /></span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="ac-actions">
        <button className="ac-btn ac-btn-income" onClick={() => openModal('income')}>
          <span className="ac-btn-icon">+</span>
          收入
        </button>
        <button className="ac-btn ac-btn-expense" onClick={() => openModal('expense')}>
          <span className="ac-btn-icon">−</span>
          支出
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
            <button className="ac-export-btn" onClick={() => { exportAllData(); alert('备份文件已保存到下载目录'); }}>导出</button>
            <button className="ac-export-btn" onClick={handleImport}>导入</button>
          </div>
        </div>

        {recordGroups.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="ac-records-list">
            {recordGroups.map((group) => (
              <div key={group.date}>
                <div className="records-date-header">
                  {group.date === today ? '今天' : group.date}
                </div>
                {group.records.map((r) => {
                  const iconBg = r.type === 'income'
                    ? 'var(--success-light)'
                    : (tagColors[r.tag] || '#E0E0E0');
                  const iconEmoji = r.type === 'income' ? '💰' : '💸';
                  return (
                  <div key={r.id} className="ac-record-item" onClick={() => setEditingRecord(r)}>
                    <div
                      className={`ac-record-icon ${r.type}`}
                      style={{ background: iconBg, color: r.type === 'income' ? 'var(--success)' : '#fff' }}
                    >
                      {iconEmoji}
                    </div>
                    <div className="ac-record-info">
                      <div className="ac-record-note">{r.note || (r.type === 'income' ? '收入' : '支出')}</div>
                      <div className="ac-record-date">{formatDate(r.date)}</div>
                      {r.tag && (
                        <span className="ac-record-tag" style={{ background: (tagColors[r.tag] || '#E0E0E0') + '33', color: tagColors[r.tag] || '#666' }}>{r.tag}</span>
                      )}
                    </div>
                    <div className={`ac-record-amount ${r.type}`}>
                      {r.type === 'income' ? '+' : '−'}¥{r.amount.toFixed(2)}
                    </div>
                  </div>
                  );
                })}
              </div>
            ))}
            <div ref={sentinelRef} style={{ height: 1 }} />
          </div>
        )}
      </div>
        </div>
      )}

      {/* Add Record Modal */}
      {showModal && (
        <AddRecordModal
          type={modalType}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <AddRecordModal
          type={editingRecord.type}
          editRecord={editingRecord}
          onSave={handleSaveEdit}
          onDelete={handleDelete}
          onClose={() => setEditingRecord(null)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="ac-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
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

      {/* Undo Toast */}
      {undoVisible && (
        <div className={`undo-toast ${undoVisible ? 'show' : ''}`}>
          <span>已删除 1 条记录</span>
          <button className="undo-btn" onClick={handleUndo}>撤回</button>
        </div>
      )}
    </div>
  );
}
