import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalNotifications } from '@capacitor/local-notifications';
import { AutoCapture, syncCaptures, reconnectCapture, isNativeCapture } from '../autoCapture';
import FeatureRow, { ToggleButton } from '../components/FeatureRow';
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
  const [notifConnected, setNotifConnected] = useState(false);
  const [accessEnabled, setAccessEnabled] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [reconnectMsg, setReconnectMsg] = useState('');

  const checkNotifAccess = async () => {
    if (!isNativeCapture) { setNotifAccess(null); return; }
    try {
      const r = await AutoCapture.status();
      setNotifAccess(r.enabled);
      setNotifConnected(r.connected);
    } catch {
      setNotifAccess(false);
    }
    try {
      const a = await AutoCapture.checkAccessibility();
      setAccessEnabled(a.enabled);
    } catch {
      setAccessEnabled(false);
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

  const openAccessibilitySettings = async () => {
    try {
      await AutoCapture.openAccessibilitySettings();
    } catch {
      // 用户在系统设置里取消
    }
  };

  const handleReconnect = async () => {
    setConnecting(true);
    setReconnectMsg('');
    try {
      const r = await reconnectCapture();
      setNotifAccess(r.enabled);
      setNotifConnected(r.connected);
      setReconnectMsg(
        r.connected
          ? '已重新连接'
          : '仍未连接：可点「系统设置」把通知使用权关闭再重新打开，或重启手机'
      );
    } catch {
      setReconnectMsg('连接失败：可点「系统设置」把通知使用权关闭再重新打开');
    }
    setConnecting(false);
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncStatus('');
    try {
      const r = await syncCaptures();
      const parts: string[] = [];
      if (r.drafts) parts.push(`待确认 ${r.drafts} 笔`);
      if (r.posted) parts.push(`直接入账 ${r.posted} 笔`);
      if (r.merged) parts.push(`合并 ${r.merged} 条`);
      if (r.filtered) parts.push(`过滤 ${r.filtered} 条`);
      if (r.duplicate) parts.push(`重复 ${r.duplicate} 条`);
      if (r.sensitive + r.uncertain) parts.push(`需手动处理 ${r.sensitive + r.uncertain} 条`);
      setSyncStatus(
        r.total === 0
          ? '暂时没有新的捕获'
          : `本次处理 ${r.total} 条：${parts.join('、') || '无新增'}`
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
        <h3>权限设置</h3>
        <span className="profile-header-spacer" />
      </div>

      <div className="profile-section">
        <div className="profile-section-title">系统授权</div>
        <div className="profile-card">
          <FeatureRow
            title="自动记账（通知监听）"
            desc={'授权「通知使用权」后，付款/收款时按微信、支付宝、抖音、淘宝、京东、拼多多、美团、云闪付的通知自动生成待确认草稿（只读取这 8 个应用的通知，其他应用不读取、不保存）。转账类消息不自动记账，会在「最近捕获」里提示手动补记；广告/物流类消息自动过滤。需在个人中心打开总开关后生效。小米/红米等国产系统建议把 PigBaby 的省电策略设为「无限制」并锁定后台，避免监听服务被系统清理导致漏抓。'}
          >
            <span className={`pf-status ${notifAccess && notifConnected ? 'on' : ''}`}>
              {isNativeCapture
                ? notifAccess
                  ? (notifConnected ? '已授权·监听中' : '已授权·未连接')
                  : '未授权'
                : '仅安卓端'}
            </span>
            {isNativeCapture && notifAccess && !notifConnected && (
              <>
                <button className="pf-toggle" onClick={handleReconnect} disabled={connecting}>
                  {connecting ? '连接中…' : '连接监听'}
                </button>
                <button className="pf-toggle" onClick={openNotifSettings} disabled={connecting}>
                  系统设置
                </button>
              </>
            )}
            <button
              className="pf-toggle"
              onClick={notifAccess ? runSync : openNotifSettings}
              disabled={!isNativeCapture || syncing}
            >
              {notifAccess ? (syncing ? '同步中…' : '立即同步') : '去授权'}
            </button>
          </FeatureRow>
          {syncStatus && <div className="pf-desc">{syncStatus}</div>}
          {reconnectMsg && <div className="pf-desc">{reconnectMsg}</div>}
        </div>
        <div className="profile-card">
          <FeatureRow title="通知权限（任务提醒）">
            <span className={`pf-status ${notifStatus === '已开启' ? 'on' : ''}`}>{notifStatus}</span>
            <button className="pf-toggle" onClick={requestNotif}>申请</button>
          </FeatureRow>
          <div className="profile-divider" />
          <FeatureRow title="精确闹钟（熄屏准点提醒）">
            <span className={`pf-status ${alarmStatus === '已开启' ? 'on' : ''}`}>{alarmStatus}</span>
            <button className="pf-toggle" onClick={openAlarmSettings}>去开启</button>
          </FeatureRow>
          <div className="profile-divider" />
          <FeatureRow
            title="节假日同步手机日历"
            desc="开启后，打卡与日历页的节假日以手机系统日历实时为准（需授权读取日历；手机需已订阅「节假日」日历）。未授权或手机没有订阅时，自动显示内置节假日表。"
          >
            <ToggleButton
              on={calSync === 'granted' || calSync === 'denied'}
              onToggle={handleCalSyncToggle}
              disabled={calSync === 'checking'}
            />
          </FeatureRow>
          {calSync === 'denied' && (
            <div className="pf-desc">未授权读取日历，当前显示内置节假日表；点上方按钮重新授权。</div>
          )}
        </div>
        <div className="profile-card">
          <FeatureRow
            title="无障碍读取账单（实验）"
            desc="开启后，你在微信/支付宝打开账单、支付结果或「微信支付」聊天页面时，App 会读取该页面文字，用来补记系统通知抓不到的收支（只处理这两个应用，其余应用完全不读取；文字只保存在本机，可在「最近捕获」页查看与清空）。"
          >
            <span className={`pf-status ${accessEnabled ? 'on' : ''}`}>
              {isNativeCapture ? (accessEnabled ? '已开启' : '未开启') : '仅安卓端'}
            </span>
            <button className="pf-toggle" onClick={openAccessibilitySettings} disabled={!isNativeCapture}>
              去开启
            </button>
          </FeatureRow>
        </div>
      </div>
    </div>
  );
}
