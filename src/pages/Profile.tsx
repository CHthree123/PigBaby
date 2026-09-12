import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  isCloudConfigured,
  loadCloudUser,
  cachedCloudUser,
  updateNickname,
  signOutCloud,
  errorText,
  type CloudUser,
} from '../cloudbase';
import './Profile.css';

const APP_VERSION = '1.11.0';

const AVATAR_COLORS = ['#F9A8C0', '#F5C27D', '#9BD9A8', '#93C5FD', '#C4B5FD', '#7DD3D8', '#F6A5A5'];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function avatarChar(nickname: string): string {
  const chars = Array.from(nickname.trim());
  return chars.length > 0 ? chars[0].toUpperCase() : 'P';
}

export default function Profile() {
  const navigate = useNavigate();
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(() => cachedCloudUser());
  const [authLoading, setAuthLoading] = useState(() => isCloudConfigured && !cachedCloudUser());
  const [showAccount, setShowAccount] = useState(false);
  const [nickInput, setNickInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [accountMsg, setAccountMsg] = useState('');
  const [accountErr, setAccountErr] = useState('');

  useEffect(() => {
    if (!isCloudConfigured) return;
    loadCloudUser().then((u) => {
      setCloudUser(u);
      setAuthLoading(false);
    });
  }, []);

  const openAccount = () => {
    if (authLoading) return;
    if (!cloudUser) {
      navigate('/login');
      return;
    }
    setNickInput(cloudUser.nickname);
    setAccountMsg('');
    setAccountErr('');
    setShowAccount(true);
  };

  const saveNickname = async () => {
    const name = nickInput.trim();
    if (!name) {
      setAccountErr('昵称不能为空');
      return;
    }
    if (name === cloudUser?.nickname) {
      setShowAccount(false);
      return;
    }
    setBusy(true);
    setAccountErr('');
    setAccountMsg('');
    try {
      await updateNickname(name);
      setCloudUser((u) => (u ? { ...u, nickname: name } : u));
      setAccountMsg('昵称已保存');
    } catch (e) {
      setAccountErr(errorText(e, '保存失败，请重试'));
    }
    setBusy(false);
  };

  const logout = async () => {
    if (!window.confirm('退出登录后本机记账数据不受影响，再次登录即可回来。确定退出？')) return;
    setBusy(true);
    setAccountErr('');
    try {
      await signOutCloud();
      setCloudUser(null);
      setShowAccount(false);
    } catch (e) {
      setAccountErr(errorText(e, '退出失败，请重试'));
    }
    setBusy(false);
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate(-1)}>‹ 返回</button>
        <h3>个人</h3>
        <span className="profile-header-spacer" />
      </div>

      <button className="profile-user-card" onClick={openAccount}>
        {cloudUser ? (
          <div
            className="profile-avatar profile-avatar-mono"
            style={{ background: avatarColor(cloudUser.uid || cloudUser.nickname) }}
          >
            {avatarChar(cloudUser.nickname)}
          </div>
        ) : (
          <div className="profile-avatar">🐷</div>
        )}
        <div className="profile-user-info">
          <div className="profile-user-name">
            {cloudUser ? cloudUser.nickname : authLoading ? '加载中…' : '登录 / 注册'}
          </div>
          <div className="profile-user-sub">
            {cloudUser
              ? cloudUser.email
              : authLoading
                ? ''
                : isCloudConfigured
                  ? '邮箱验证码登录，昵称头像云端保存'
                  : '云端未配置，登录暂不可用'}
          </div>
        </div>
        <span className="profile-entry-arrow">›</span>
      </button>

      <div className="profile-section">
        <button className="profile-entry-card" onClick={() => navigate('/profile/permissions')}>
          <span className="profile-entry-body">
            <span className="profile-entry-title">权限设置</span>
            <span className="profile-entry-sub">通知 · 精确闹钟 · 自动记账 · 日历同步</span>
          </span>
          <span className="profile-entry-arrow">›</span>
        </button>

        <button className="profile-entry-card" onClick={() => navigate('/profile/center')}>
          <span className="profile-entry-body">
            <span className="profile-entry-title">个人中心</span>
            <span className="profile-entry-sub">主题 · 功能模块 · 记账偏好</span>
          </span>
          <span className="profile-entry-arrow">›</span>
        </button>
      </div>

      <div className="profile-version">版本 {APP_VERSION}</div>

      {showAccount && cloudUser && (
        <div className="ac-modal-overlay" onClick={() => !busy && setShowAccount(false)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3>账号</h3>
            <div className="ac-settings-body">
              <div className="account-email">{cloudUser.email}</div>
              <label className="ac-settings-label">昵称</label>
              <input
                className="account-input"
                maxLength={16}
                value={nickInput}
                onChange={(e) => setNickInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) saveNickname();
                }}
              />
              {accountMsg && <div className="login-notice">{accountMsg}</div>}
              {accountErr && <div className="login-error">{accountErr}</div>}
            </div>
            <div className="ac-modal-btns">
              <button className="ac-modal-btn cancel account-logout" disabled={busy} onClick={logout}>
                退出登录
              </button>
              <button className="ac-modal-btn confirm" disabled={busy} onClick={saveNickname}>
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
