import { useNavigate } from 'react-router-dom';
import './Profile.css';

const APP_VERSION = '1.10.3';

export default function Profile() {
  const navigate = useNavigate();

  return (
    <div className="profile-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate(-1)}>‹ 返回</button>
        <h3>👤 个人</h3>
        <span className="profile-header-spacer" />
      </div>

      {/* 头像与昵称：v2.0 第三批接入账号后改为云端资料 */}
      <div className="profile-user-card">
        <div className="profile-avatar">🐷</div>
        <div className="profile-user-info">
          <div className="profile-user-name">PigBaby 用户</div>
          <div className="profile-user-sub">头像与昵称 敬请期待</div>
        </div>
      </div>

      <div className="profile-section">
        <button className="profile-entry-card" onClick={() => navigate('/profile/permissions')}>
          <span className="profile-entry-icon">🔐</span>
          <span className="profile-entry-body">
            <span className="profile-entry-title">权限设置</span>
            <span className="profile-entry-sub">通知 · 精确闹钟 · 自动记账 · 日历同步</span>
          </span>
          <span className="profile-entry-arrow">›</span>
        </button>

        <button className="profile-entry-card" onClick={() => navigate('/profile/center')}>
          <span className="profile-entry-icon">🙋</span>
          <span className="profile-entry-body">
            <span className="profile-entry-title">个人中心</span>
            <span className="profile-entry-sub">主题 · 功能模块 · 记账偏好</span>
          </span>
          <span className="profile-entry-arrow">›</span>
        </button>
      </div>

      <div className="profile-version">📱 版本 {APP_VERSION}</div>
    </div>
  );
}
