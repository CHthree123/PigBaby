import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalNotifications } from '@capacitor/local-notifications';
import SmsAutoPanel from '../components/SmsAutoPanel';
import { saveTheme, type ThemeName } from '../storage';
import './Profile.css';

const APP_VERSION = '1.5.5';

interface Props {
  theme: ThemeName;
  onThemeChange: (t: ThemeName) => void;
}

export default function Profile({ theme, onThemeChange }: Props) {
  const navigate = useNavigate();
  const [notifStatus, setNotifStatus] = useState('检查中…');
  const [alarmStatus, setAlarmStatus] = useState('检查中…');

  const checkNotif = async () => {
    try {
      const s = await LocalNotifications.checkPermissions();
      setNotifStatus(s.display === 'granted' ? '已开启' : s.display === 'denied' ? '未开启' : '未授权');
    } catch {
      setNotifStatus('未知');
    }
  };

  const checkAlarm = async () => {
    try {
      const s = await LocalNotifications.checkExactNotificationSetting();
      setAlarmStatus(s.exact_alarm === 'granted' ? '已开启' : '未开启');
    } catch {
      setAlarmStatus('仅安卓 12+ 支持');
    }
  };

  useEffect(() => { checkNotif(); checkAlarm(); }, []);

  const requestNotif = async () => {
    try {
      const s = await LocalNotifications.requestPermissions();
      setNotifStatus(s.display === 'granted' ? '已开启' : '未开启');
    } catch {
      setNotifStatus('申请失败');
    }
  };

  const openAlarmSettings = async () => {
    try {
      await LocalNotifications.changeExactNotificationSetting();
    } catch {
      // user dismissed the settings screen
    }
    checkAlarm();
  };

  const switchTheme = async (t: ThemeName) => {
    onThemeChange(t);
    await saveTheme(t);
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate(-1)}>‹ 返回</button>
        <h3>👤 个人</h3>
        <span className="profile-header-spacer" />
      </div>

      <div className="profile-section">
        <div className="profile-section-title">🔐 权限设置</div>
        <div className="profile-card">
          <SmsAutoPanel />
        </div>
        <div className="profile-card">
          <div className="profile-row">
            <span className="profile-row-title">🔔 通知权限（任务提醒）</span>
            <span className={`profile-row-status ${notifStatus === '已开启' ? 'on' : ''}`}>{notifStatus}</span>
            <button className="sms-auto-btn" onClick={requestNotif}>申请</button>
          </div>
          <div className="profile-divider" />
          <div className="profile-row">
            <span className="profile-row-title">⏰ 精确闹钟（熄屏准点提醒）</span>
            <span className={`profile-row-status ${alarmStatus === '已开启' ? 'on' : ''}`}>{alarmStatus}</span>
            <button className="sms-auto-btn" onClick={openAlarmSettings}>去开启</button>
          </div>
        </div>
      </div>

      <div className="profile-section">
        <div className="profile-section-title">🙋 个人中心</div>
        <div className="profile-card">
          <div className="profile-placeholder-item">👤 头像与昵称<span className="soon">敬请期待</span></div>
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
          <div className="profile-placeholder-item">☁️ 数据同步与备份<span className="soon">敬请期待</span></div>
          <div className="profile-placeholder-item">📱 版本 {APP_VERSION}</div>
        </div>
      </div>
    </div>
  );
}
