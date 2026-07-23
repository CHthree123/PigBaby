import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppData, SavingsGoal, SavingsData, Transaction } from '../storage';
import { loadSavingsGoals, saveSavingsGoals } from '../storage';
import Celebration from './Celebration';
import EmptyState from './EmptyState';

interface Props {
  remaining: number;
  data: AppData;
  onDataChange: (data: AppData) => Promise<void>;
  onRefresh: () => Promise<void>;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PiggyBank({ remaining, data, onDataChange, onRefresh }: Props) {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const modalOpenTime = useRef(Date.now());

  const closeNewGoal = () => {
    if (Date.now() - modalOpenTime.current > 400) setShowNewGoal(false);
  };
  const closeDeposit = () => {
    if (Date.now() - modalOpenTime.current > 400) setShowDeposit(false);
  };
  const [depositGoalId, setDepositGoalId] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);
  const [coinAnim, setCoinAnim] = useState<{active: boolean; x: number; y: number}>({active: false, x: 0, y: 0});

  // New goal form
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');

  // Deposit form
  const [depositAmount, setDepositAmount] = useState('');

  const refreshGoals = useCallback(async () => {
    const s = await loadSavingsGoals();
    setGoals(s.goals);
  }, []);

  useEffect(() => {
    refreshGoals();
  }, [refreshGoals]);

  const handleDeleteGoal = async (goalId: string) => {
    const updated: SavingsData = { goals: goals.filter((g) => g.id !== goalId) };
    await saveSavingsGoals(updated);
    await refreshGoals();
  };

  const handleCreateGoal = async () => {
    const amt = parseFloat(goalAmount);
    if (!goalName.trim() || isNaN(amt) || amt <= 0) return;
    const goal: SavingsGoal = {
      id: Date.now().toString(),
      name: goalName.trim(),
      targetAmount: amt,
      savedAmount: 0,
      deadline: goalDeadline,
      createdAt: new Date().toISOString(),
    };
    const updated: SavingsData = { goals: [...goals, goal] };
    await saveSavingsGoals(updated);
    setGoalName('');
    setGoalAmount('');
    setGoalDeadline('');
    setShowNewGoal(false);
    await refreshGoals();
  };

  const depositBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) return;
    const goal = goals.find((g) => g.id === depositGoalId);
    if (!goal) return;

    // Get button position for coin animation origin
    const btn = depositBtnRefs.current[depositGoalId];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setCoinAnim({ active: true, x: rect.left + rect.width / 2, y: rect.top });
    } else {
      setCoinAnim({ active: true, x: window.innerWidth / 2, y: window.innerHeight - 120 });
    }

    // Play coin drop animation then process
    await new Promise(resolve => setTimeout(resolve, 550));
    setCoinAnim({ active: false, x: 0, y: 0 });

    // Update goal
    const newSaved = goal.savedAmount + amt;
    const updatedGoals = goals.map((g) =>
      g.id === depositGoalId ? { ...g, savedAmount: newSaved } : g
    );
    await saveSavingsGoals({ goals: updatedGoals });

    // Create expense record
    const record: Transaction = {
      id: Date.now().toString() + '_savings',
      amount: amt,
      type: 'expense',
      note: `存入[${goal.name}]`,
      date: todayStr(),
      month: todayStr().slice(0, 7),
      tag: '存钱',
    };
    const updated: AppData = {
      ...data,
      records: [...data.records, record],
    };
    await onDataChange(updated);

    if (newSaved >= goal.targetAmount) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3000);
    }

    setDepositAmount('');
    setShowDeposit(false);
    await refreshGoals();
    await onRefresh();
  };

  return (
    <div className="piggy-page">
      <div className="piggy-header">
        <span className="piggy-header-icon">🐷</span>
        <span className="piggy-title">存钱罐</span>
      </div>

      {goals.length === 0 ? (
        <EmptyState emoji="🐷" title="还没有存钱目标哦~" tips={['设定一个存钱目标吧！', '攒钱买大件！', '存进去的每一分都是未来~', '🐷 小目标大梦想']} />
      ) : (
        goals.map((goal) => {
          const pct = goal.targetAmount > 0
            ? Math.min((goal.savedAmount / goal.targetAmount) * 100, 100)
            : 0;
          const isDone = goal.savedAmount >= goal.targetAmount;

          return (
            <div key={goal.id} className="piggy-goal-card">
              <div className="piggy-goal-header">
                <div className="piggy-goal-left">
                  <span className="piggy-goal-name">
                    {isDone ? '🎉 ' : ''}{goal.name}
                  </span>
                  <button className="piggy-goal-del" onClick={(e) => { e.stopPropagation(); handleDeleteGoal(goal.id); }}>✕</button>
                </div>
                {goal.deadline && (
                  <span className="piggy-goal-deadline">截止：{goal.deadline}</span>
                )}
              </div>
              <div className="piggy-goal-amounts">
                <span>已存 ¥{goal.savedAmount.toFixed(2)}</span>
                <span>目标 ¥{goal.targetAmount.toFixed(2)}</span>
              </div>
              <div className="piggy-progress-wrap">
                <div className="piggy-progress-fill" style={{ width: `${pct}%` }}>
                  {/* Mini marching pigs — 4 pigs evenly spaced */}
                  {pct > 0 && Array.from({ length: 4 }, (_, i) => {
                    const leftPct = ((i + 1) / 5) * 100;
                    return (
                      <span key={i} className="piggy-progress-mini" style={{ left: `${leftPct}%` }}>🐷</span>
                    );
                  })}
                  {/* Lead pig at end */}
                  <span className="piggy-progress-pig">{isDone ? '🎉' : '🐷'}</span>
                </div>
              </div>
              <div className="piggy-progress-pct">{pct.toFixed(0)}%</div>
              <button
                className={`piggy-deposit-btn ${isDone ? 'done' : ''}`}
                ref={(el) => { depositBtnRefs.current[goal.id] = el; }}
                onClick={() => { modalOpenTime.current = Date.now(); setDepositGoalId(goal.id); setShowDeposit(true); }}
              >
                {isDone ? '✅ 已达成!' : '💰 今日存入'}
              </button>
            </div>
          );
        })
      )}

      <button className="piggy-new-btn" onClick={() => { modalOpenTime.current = Date.now(); setShowNewGoal(true); }}>
        + 新建目标
      </button>

      {/* New Goal Modal */}
      {showNewGoal && (
        <div className="ac-modal-overlay" onClick={closeNewGoal}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3>🐷 新建存钱目标</h3>
            <div className="arm-field">
              <label className="arm-label">目标名称</label>
              <input className="arm-input" type="text" placeholder="例如：买Switch" value={goalName} onChange={(e) => setGoalName(e.target.value)} autoFocus />
            </div>
            <div className="arm-field">
              <label className="arm-label">目标金额</label>
              <div className="arm-amount-wrap">
                <span className="arm-amount-prefix">¥</span>
                <input className="arm-amount-input" type="number" placeholder="0.00" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} />
              </div>
            </div>
            <div className="arm-field">
              <label className="arm-label">截止日期（可选）</label>
              <input className="arm-input" type="date" value={goalDeadline} onChange={(e) => setGoalDeadline(e.target.value)} />
            </div>
            <div className="ac-modal-btns">
              <button className="ac-modal-btn cancel" onClick={() => setShowNewGoal(false)}>取消</button>
              <button className="ac-modal-btn confirm" onClick={handleCreateGoal}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="ac-modal-overlay" onClick={closeDeposit}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3>💰 存入</h3>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
              当前本月剩余：¥{remaining.toFixed(2)}
            </p>
            <div className="arm-field">
              <label className="arm-label">存入金额</label>
              <div className="arm-amount-wrap">
                <span className="arm-amount-prefix">¥</span>
                <input className="arm-amount-input" type="number" placeholder="0.00" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} autoFocus />
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              存入后将从本月剩余中扣除
            </p>
            <div className="ac-modal-btns">
              <button className="ac-modal-btn cancel" onClick={() => setShowDeposit(false)}>取消</button>
              <button className="ac-modal-btn confirm" onClick={handleDeposit}>确认存入</button>
            </div>
          </div>
        </div>
      )}

      {showCelebration && <Celebration />}

      {/* Coin drop animation */}
      {coinAnim.active && (
        <div className="coin-drop-overlay">
          <span
            className="coin-drop"
            style={{ left: coinAnim.x - 24, top: coinAnim.y - 24 }}
          >
            🪙
          </span>
        </div>
      )}
    </div>
  );
}
