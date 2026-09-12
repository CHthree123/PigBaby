import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  loadLocalProfile,
  saveLocalProfile,
  DEFAULT_LOCAL_PROFILE,
  type LocalProfile,
} from '../storage';
import './Profile.css';

const APP_VERSION = '1.11.0';

const AVATAR_PRESETS = ['🐷', '🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐸', '🐥', '🦄', '🌸', '⭐'];

const AVATAR_MAX_SIDE = 256;
const AVATAR_QUALITY = 0.82;

function isImageAvatar(avatar: string): boolean {
  return avatar.startsWith('data:');
}

/** 压缩为最长边 maxSide 的 JPEG data URL，控制本机存储体积（一张约 20~40KB） */
function downscaleImage(file: File, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas unavailable'));
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

function AvatarBubble({ avatar, className = '' }: { avatar: string; className?: string }) {
  if (isImageAvatar(avatar)) {
    return (
      <div className={`profile-avatar profile-avatar-img ${className}`.trim()}>
        <img src={avatar} alt="" />
      </div>
    );
  }
  return <div className={`profile-avatar ${className}`.trim()}>{avatar}</div>;
}

export default function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<LocalProfile>(DEFAULT_LOCAL_PROFILE);
  const [showEdit, setShowEdit] = useState(false);
  const [nickInput, setNickInput] = useState('');
  const [avatarDraft, setAvatarDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editErr, setEditErr] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadLocalProfile().then(setProfile);
  }, []);

  const openEdit = () => {
    setNickInput(profile.nickname);
    setAvatarDraft(profile.avatar);
    setEditErr('');
    setShowEdit(true);
  };

  const pickAvatar = () => fileRef.current?.click();

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEditErr('');
    try {
      setAvatarDraft(await downscaleImage(file, AVATAR_MAX_SIDE, AVATAR_QUALITY));
    } catch {
      setEditErr('图片读取失败，换一张试试');
    }
  };

  const saveProfile = async () => {
    const name = nickInput.trim();
    if (!name) {
      setEditErr('昵称不能为空');
      return;
    }
    setBusy(true);
    const next: LocalProfile = { nickname: name, avatar: avatarDraft || DEFAULT_LOCAL_PROFILE.avatar };
    try {
      await saveLocalProfile(next);
      setProfile(next);
      setShowEdit(false);
    } catch {
      setEditErr('保存失败，请重试');
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

      <button className="profile-user-card" onClick={openEdit}>
        <AvatarBubble avatar={profile.avatar} />
        <div className="profile-user-info">
          <div className="profile-user-name">{profile.nickname}</div>
          <div className="profile-user-sub">点击设置昵称和头像</div>
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

      {showEdit && (
        <div className="ac-modal-overlay" onClick={() => !busy && setShowEdit(false)}>
          <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h3>编辑资料</h3>
            <div className="ac-settings-body">
              <div className="avatar-edit-row">
                <AvatarBubble avatar={avatarDraft || DEFAULT_LOCAL_PROFILE.avatar} className="avatar-edit-preview" />
                <div className="avatar-edit-actions">
                  <button className="pf-toggle" disabled={busy} onClick={pickAvatar}>从相册选择</button>
                  <button
                    className="pf-toggle"
                    disabled={busy}
                    onClick={() => setAvatarDraft(DEFAULT_LOCAL_PROFILE.avatar)}
                  >
                    恢复默认
                  </button>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onFileChange}
              />
              <div className="avatar-preset-grid">
                {AVATAR_PRESETS.map((a) => (
                  <button
                    key={a}
                    className={`avatar-preset ${avatarDraft === a ? 'active' : ''}`}
                    disabled={busy}
                    onClick={() => setAvatarDraft(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <label className="ac-settings-label">昵称</label>
              <input
                className="profile-text-input"
                maxLength={16}
                value={nickInput}
                onChange={(e) => setNickInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) saveProfile();
                }}
              />
              {editErr && <div className="profile-error-text">{editErr}</div>}
            </div>
            <div className="ac-modal-btns">
              <button className="ac-modal-btn cancel" disabled={busy} onClick={() => setShowEdit(false)}>
                取消
              </button>
              <button className="ac-modal-btn confirm" disabled={busy} onClick={saveProfile}>
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
