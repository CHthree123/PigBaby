import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import type { PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import Accounting from './pages/Accounting';
import Tasks from './pages/Tasks';
import Profile from './pages/Profile';
import './App.css';

function App() {
  const navigate = useNavigate();
  const location = useLocation();

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

  const handlePigClick = useCallback(() => {
    if (pigBounce) return;
    setPigBounce(true);
    setTimeout(() => setPigBounce(false), 600);
    // Navigate to accounting and trigger expense modal
    if (location.pathname !== '/') {
      navigate('/?open=expense');
    } else {
      navigate('/?open=expense', { replace: true });
    }
  }, [pigBounce, location.pathname, navigate]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="app-shell">
      <button className="top-right-btn" onClick={() => navigate('/profile')}>👤 个人</button>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Accounting />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>
      <nav className="bottom-nav">
        {/* Left tab: 记账 */}
        <button
          className={`nav-item ${isActive('/') ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          <span className="nav-icon">💰</span>
          <span className="nav-label">记账</span>
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
        <button
          className={`nav-item ${isActive('/tasks') ? 'active' : ''}`}
          onClick={() => navigate('/tasks')}
        >
          <span className="nav-icon">📋</span>
          <span className="nav-label">任务</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
