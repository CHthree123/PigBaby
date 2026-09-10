import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  saveTheme,
  loadFeatures,
  saveFeatures,
  loadPigAction,
  savePigAction,
  loadMoneyMode,
  saveMoneyMode,
  loadInitialBalance,
  saveInitialBalance,
  loadSmartRec,
  saveSmartRec,
  type ThemeName,
  type AppFeatures,
  type PigAction,
  type MoneyMode,
} from '../storage';
import './Profile.css';

interface Props {
  theme: ThemeName;
  onThemeChange: (t: ThemeName) => void;
}

type ModuleMode = 'both' | 'accounting' | 'tasks';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ProfileCenter({ theme, onThemeChange }: Props) {
  const navigate = useNavigate();
  const [features, setFeatures] = useState<AppFeatures>({ accounting: true, tasks: true });
  const [pigAction, setPigAction] = useState<PigAction>('expense');
  const [moneyMode, setMoneyMode] = useState<MoneyMode>('budget');
  const [balanceAmount, setBalanceAmount] = useState<number | null>(null);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceInput, setBalanceInput] = useState('');
  const [smartRec, setSmartRec] = useState(true);

  useEffect(() => {
    loadFeatures().then(setFeatures);
    loadPigAction().then(setPigAction);
    loadMoneyMode().then(setMoneyMode);
    loadInitialBalance().then((b) => setBalanceAmount(b ? b.amount : null));
    loadSmartRec().then(setSmartRec);
  }, []);

  const moduleMode: ModuleMode =
    features.accounting && features.tasks ? 'both' : features.accounting ? 'accounting' : 'tasks';

  const setModules = async (mode: ModuleMode) => {
    const f: AppFeatures =
      mode === 'both' ? { accounting: true, tasks: true }
      : mode === 'accounting' ? { accounting: true, tasks: false }
      : { accounting: false, tasks: true };
    setFeatures(f);
    await saveFeatures(f);
  };

  const setPig = async (a: PigAction) => {
    setPigAction(a);
    await savePigAction(a);
  };

  const switchTheme = async (t: ThemeName) => {
    onThemeChange(t);
    await saveTheme(t);
  };

  const switchMoneyMode = async (m: MoneyMode) => {
    if (m === moneyMode) return;
    if (m === 'balance') {
      const init = await loadInitialBalance();
      if (!init) {
        // 首次切换：先录入当前余额
        setBalanceInput('');
        setShowBalanceModal(true);
        return;
      }
    }
    setMoneyMode(m);
    await saveMoneyMode(m);
  };

  const openBalanceModal = async () => {
    const init = await loadInitialBalance();
    setBalanceInput(init ? String(init.amount) : '');
    setShowBalanceModal(true);
  };

  const confirmBalance = async () => {
    const val = parseFloat(balanceInput);
    if (isNaN(val)) return;
    await saveInitialBalance({ amount: val, fromDate: todayStr() });
    await saveMoneyMode('balance');
    setBalanceAmount(val);
    setMoneyMode('balance');
    setShowBalanceModal(false);
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate('/profile')}>‹ 返回</button>
        <h3>🙋 个人中心</h3>
        <span className="profile-header-spacer" />
      </div>

      <div className="profile-section">
        <div className="profile-section-title">🎨 外观</div>
        <div className="profile-card">
          <div className="profile-theme-row">
            <span>🎨 界面主题</span>
            <div className="profile-theme-options">
              <button
                className={`profile-theme-opt ${theme === 'light' ? 'active' : ''}`}
                onClick={() => switchTheme('light')}
              >🌸 粉嫩</button>
              <button
                className={`profile-theme-opt dark ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => switchTheme('dark')}
              >🖤 酷黑</button>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-title">🧩 功能与偏好</div>
        <div className="profile-card">
          <div className="profile-theme-row">
            <span>📦 功能模块</span>
            <div className="profile-theme-options">
              <button className={`profile-theme-opt ${moduleMode === 'both' ? 'active' : ''}`} onClick={() => setModules('both')}>都要</button>
              <button className={`profile-theme-opt ${moduleMode === 'accounting' ? 'active' : ''}`} onClick={() => setModules('accounting')}>仅记账</button>
              <button className={`profile-theme-opt ${moduleMode === 'tasks' ? 'active' : ''}`} onClick={() => setModules('tasks')}>仅任务</button>
            </div>
          </div>
          <div className="profile-row-note">关闭的模块会从底部导航隐藏（日历与个人始终保留）。</div>
          <div className="profile-divider" />
          <div className="profile-theme-row">
            <span>🐷 小猪按钮动作</span>
            <div className="profile-theme-options">
              <button
                className={`profile-theme-opt ${pigAction === 'expense' ? 'active' : ''}`}
                disabled={!features.accounting}
                onClick={() => setPig('expense')}
              >记支出</button>
              <button
                className={`profile-theme-opt ${pigAction === 'task' ? 'active' : ''}`}
                disabled={!features.tasks}
                onClick={() => setPig('task')}
              >创建任务</button>
            </div>
          </div>
          <div className="profile-row-note">点击底部中间的粉色小猪时触发的动作；对应模块关闭时自动使用另一个动作。</div>
          <div className="profile-divider" />
          <div className="profile-theme-row">
            <span>💼 记账模式</span>
            <div className="profile-theme-options">
              <button
                className={`profile-theme-opt ${moneyMode === 'budget' ? 'active' : ''}`}
                disabled={!features.accounting}
                onClick={() => switchMoneyMode('budget')}
              >预算制</button>
              <button
                className={`profile-theme-opt ${moneyMode === 'balance' ? 'active' : ''}`}
                disabled={!features.accounting}
                onClick={() => switchMoneyMode('balance')}
              >余额制</button>
            </div>
          </div>
          <div className="profile-row-note">
            预算制：主页显示「本月剩余 = 月预算 + 收入 − 支出」。
            余额制：录入当前余额后，主页显示「余额」与「本月支出」，月预算变为进度条。
          </div>
          {moneyMode === 'balance' && (
            <>
              <div className="profile-divider" />
              <div className="profile-theme-row">
                <span>💰 当前余额（{balanceAmount !== null ? `¥${balanceAmount}` : '未设置'}）</span>
                <div className="profile-theme-options">
                  <button className="profile-theme-opt" onClick={openBalanceModal}>修改</button>
                </div>
              </div>
              <div className="profile-row-note">修改余额后，会以今天的日期重新起算（此前的记录不再计入余额）。</div>
            </>
          )}
          <div className="profile-divider" />
          <div className="profile-theme-row">
            <span>💡 智能推荐（记账记忆）</span>
            <div className="profile-theme-options">
              <button
                className={`profile-theme-opt ${smartRec ? 'active' : ''}`}
                onClick={() => { setSmartRec(true); saveSmartRec(true); }}
              >开</button>
              <button
                className={`profile-theme-opt ${!smartRec ? 'active' : ''}`}
                onClick={() => { setSmartRec(false); saveSmartRec(false); }}
              >关</button>
            </div>
          </div>
          <div className="profile-row-note">开启后记账时会根据历史记录推荐标签和常用备注（全部在本机统计）。</div>
          <div className="profile-divider" />
          <button className="profile-link-row" onClick={() => navigate('/profile/tags')}>
            <span>🏷️ 标签管理</span>
            <span className="profile-link-arrow">›</span>
          </button>
          <div className="profile-placeholder-item">☁️ 数据同步与备份<span className="soon">敬请期待</span></div>
        </div>
      </div>

      {/* 初始余额输入弹窗 */}
      {showBalanceModal && (
        <div className="ac-modal-overlay" onClick={() => setShowBalanceModal(false)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3>💰 设置当前余额</h3>
            <div className="ac-settings-body">
              <label className="ac-settings-label">填写你现在的余额（之后记账在此基础上增减）</label>
              <div className="ac-settings-input-wrap">
                <span className="ac-settings-prefix">¥</span>
                <input
                  className="ac-settings-input"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={balanceInput}
                  onChange={(e) => setBalanceInput(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="ac-modal-btns">
              <button className="ac-modal-btn cancel" onClick={() => setShowBalanceModal(false)}>取消</button>
              <button className="ac-modal-btn confirm" onClick={confirmBalance}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
