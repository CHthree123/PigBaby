import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Accounting from './pages/Accounting';
import Tasks from './pages/Tasks';
import './App.css';

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { path: '/', label: '记账', icon: '💰' },
    { path: '/tasks', label: '任务', icon: '📋' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Accounting />} />
          <Route path="/tasks" element={<Tasks />} />
        </Routes>
      </main>
      <nav className="bottom-nav">
        {tabs.map((tab) => (
          <button
            key={tab.path}
            className={`nav-item ${isActive(tab.path) ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
