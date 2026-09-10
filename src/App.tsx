import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';
import Accounting from './pages/Accounting';
import Tasks from './pages/Tasks';
import Profile from './pages/Profile';
import ProfilePermissions from './pages/ProfilePermissions';
import ProfileCenter from './pages/ProfileCenter';
import TagManager from './pages/TagManager';
import CalendarPage from './pages/CalendarPage';
import { loadTheme, loadFeatures, loadPigAction, type ThemeName, type AppFeatures, type PigAction } from './storage';
import './App.css';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<ThemeName>('light');
  const [features, setFeatures] = useState<AppFeatures>({ accounting: true, tasks: true });
  const [pigAction, setPigAction] = useState<PigAction>('expense');

  useEffect(() => {
    loadTheme().then(setTheme);
  }, []);

  // 每次进入新页面时重读功能开关与小猪设置，个人中心里改完立刻生效
  useEffect(() => {
    loadFeatures().then(setFeatures);
    loadPigAction().then(setPigAction);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
  }, [theme]);

  // Status bar follows the in-app theme so the top of the screen stays unified
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const dark = theme === 'dark';
    StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark });
    StatusBar.setBackgroundColor({ color: dark ? '#12121A' : '#FFF5F5' });
  }, [theme]);

  useEffect(() => {
    const splash = document.getElementById('splash');
    if (splash) {
      const timer = setTimeout(() => {
        splash.classList.add('hide');
        setTimeout(() => splash.remove(), 500);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // 关闭的模块不允许停留：记账关闭时首页跳任务页，任务关闭时任务页跳独立日历
  useEffect(() => {
    if (!features.accounting && location.pathname === '/') {
      navigate(features.tasks ? '/tasks' : '/calendar', { replace: true });
    } else if (!features.tasks && location.pathname.startsWith('/tasks')) {
      navigate('/calendar', { replace: true });
    }
  }, [features, location.pathname, navigate]);

  const [pigBounce, setPigBounce] = useState(false);

  // Tap on a task reminder notification -> jump to tasks page
  useEffect(() => {
    let removed = false;
    let handle: PluginListenerHandle | undefined;
    LocalNotifications.addListener('localNotificationActionPerformed', () => {
      navigate('/tasks');
    }).then((h) => {
      if (removed) h.remove();
      else handle = h;
    });
    return () => {
      removed = true;
      handle?.remove();
    };
  }, [navigate]);

  // 小猪动作：优先用设置的动作；对应模块关闭时自动落到另一个可用动作
  const effectivePig: PigAction | null =
    pigAction === 'expense'
      ? (features.accounting ? 'expense' : (features.tasks ? 'task' : null))
      : (features.tasks ? 'task' : (features.accounting ? 'expense' : null));

  const handlePigClick = useCallback(() => {
    if (pigBounce || !effectivePig) return;
    setPigBounce(true);
    setTimeout(() => setPigBounce(false), 600);
    if (effectivePig === 'task') {
      navigate('/tasks?open=add', location.pathname === '/tasks' ? { replace: true } : undefined);
    } else {
      navigate('/?open=expense', location.pathname === '/' ? { replace: true } : undefined);
    }
  }, [pigBounce, effectivePig, location.pathname, navigate]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const isTasksView = location.pathname.startsWith('/tasks');
  const isCalendarView = location.pathname === '/calendar' || (isTasksView && location.search.includes('view=calendar'));

  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Accounting />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/permissions" element={<ProfilePermissions />} />
          <Route path="/profile/center" element={<ProfileCenter theme={theme} onThemeChange={setTheme} />} />
          <Route path="/profile/tags" element={<TagManager />} />
        </Routes>
      </main>
      <nav className="bottom-nav">
        {/* Left tab: 记账 */}
        {features.accounting && (
          <button
            className={`nav-item ${isActive('/') ? 'active' : ''}`}
            onClick={() => navigate('/')}
          >
            <span className="nav-icon">💰</span>
            <span className="nav-label">记账</span>
          </button>
        )}

        {/* 日历：任务模块开启时进任务页日历视图，关闭时为独立日历页 */}
        <button
          className={`nav-item ${isCalendarView ? 'active' : ''}`}
          onClick={() => navigate(features.tasks ? '/tasks?view=calendar' : '/calendar')}
        >
          <span className="nav-icon">📅</span>
          <span className="nav-label">日历</span>
        </button>

        {/* Center protruding pig */}
        <div className="nav-center-wrap">
          <button
            className={`nav-pig-btn ${pigBounce ? 'bouncing' : ''}`}
            onClick={handlePigClick}
          >
            🐷
          </button>
        </div>

        {/* Right tab: 任务 */}
        {features.tasks && (
          <button
            className={`nav-item ${isTasksView && !isCalendarView ? 'active' : ''}`}
            onClick={() => navigate('/tasks')}
          >
            <span className="nav-icon">📋</span>
            <span className="nav-label">任务</span>
          </button>
        )}

        {/* 个人 */}
        <button
          className={`nav-item ${isActive('/profile') ? 'active' : ''}`}
          onClick={() => navigate('/profile')}
        >
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">个人</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
