import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalNotifications } from '@capacitor/local-notifications';
import SmsAutoPanel from '../components/SmsAutoPanel';
import { AutoCapture, syncCaptures, isNativeCapture } from '../autoCapture';
import {
  sysCalendarAvailable,
  loadSysCalEnabled,
  setSysCalEnabled,
  sysCalPermissionGranted,
  requestSysCalPermission,
} from '../sysCalendar';
import './Profile.css';

export default function ProfilePermissions() {
  const navigate = useNavigate();
  const [notifStatus, setNotifStatus] = useState('检查中…');
  const [alarmStatus, setAlarmStatus] = useState('检查中…');

  const [calSync, setCalSync] = useState<'checking' | 'off' | 'granted' | 'denied'>('checking');

  const [notifAccess, setNotifAccess] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const checkNotifAccess = async () => {
    if (!isNativeCapture) { setNotifAccess(null); return; }
    try {
      const r = await AutoCapture.checkEnabled();
      setNotifAccess(r.enabled);
    } catch {
      setNotifAccess(false);
    }
  };

  useEffect(() => {
    checkNotifAccess();
    const onVis = () => {
      if (document.visibilityState === 'visible') checkNotifAccess();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const openNotifSettings = async () => {
    try {
      await AutoCapture.openSettings();
    } catch {
      // 用户在系统设置里取消
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncStatus('');
    try {
      const r = await syncCaptures();
      setSyncStatus(
        r.total === 0
          ? '暂时没有新的捕获'
          : `本次处理 ${r.total} 条：待确认 ${r.drafts} 笔、直接入账 ${r.posted} 笔、忽略 ${r.skipped} 条`
      );
    } catch (e) {
      setSyncStatus(`同步失败：${(e as { message?: string })?.message || String(e)}`);
    }
    setSyncing(false);
  };

  const initCalSync = async () => {
    if (!sysCalendarAvailable()) { setCalSync('off'); return; }
    const enabled = await loadSysCalEnabled();
    if (!enabled) { setCalSync('off'); return; }
    const granted = await sysCalPermissionGranted();
    setCalSync(granted ? 'granted' : 'denied');
  };

  useEffect(() => { initCalSync(); }, []);

  const handleCalSyncToggle = async () => {
    if (calSync === 'checking') return;
    if (calSync !== 'off') {
      await setSysCalEnabled(false);
      setCalSync('off');
      return;
    }
    const granted = await requestSysCalPermission();
    if (granted) await setSysCalEnabled(true);
    setCalSync(granted ? 'granted' : 'off');
  };

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

  return (
    <div className="profile-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate('/profile')}>‹ 返回</button>
        <h3>🔐 权限设置</h3>
        <span className="profile-header-spacer" />
      </div>

      <div className="profile-section">
        <div className="profile-section-title">🔐 系统授权</div>
        <div className="profile-card">
          <div className="profile-row">
            <span className="profile-row-title">🔔 自动记账（通知监听）</span>
            <span className={`profile-row-status ${notifAccess ? 'on' : ''}`}>
              {isNativeCapture ? (notifAccess ? '已授权' : '未授权') : '仅安卓端'}
            </span>
            <button className="sms-auto-btn" onClick={openNotifSettings} disabled={!isNativeCapture}>去开启</button>
            <button className="sms-auto-btn" onClick={runSync} disabled={!isNativeCapture || syncing}>
              {syncing ? '同步中…' : '立即同步'}
            </button>
          </div>
          <div className="profile-row-note">
            授权"通知使用权"后，付款/收款时按微信、支付宝的通知自动生成待确认草稿（只解析这两个应用的通知，其他应用不读取、不保存）。
            需在个人中心打开总开关后生效。
          </div>
          {syncStatus && <div className="sms-auto-status">{syncStatus}</div>}
        </div>
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
          <div className="profile-divider" />
          <div className="profile-row">
            <span className="profile-row-title">📅 节假日同步手机日历</span>
            <span className={`profile-row-status ${calSync === 'granted' ? 'on' : ''}`}>
              {calSync === 'checking' ? '检查中…' : calSync === 'granted' ? '已开启·实时' : calSync === 'denied' ? '未授权' : '未开启'}
            </span>
            <button className="sms-auto-btn" onClick={handleCalSyncToggle} disabled={calSync === 'checking'}>
              {calSync === 'checking' ? '…' : calSync !== 'off' ? '关闭' : '开启并授权'}
            </button>
          </div>
          <div className="profile-row-note">
            开启后，打卡与日历页的节假日以手机系统日历实时为准（需授权读取日历；手机需已订阅「节假日」日历）。
            未授权或手机没有订阅时，自动显示内置节假日表。
          </div>
        </div>
      </div>
    </div>
  );
}
