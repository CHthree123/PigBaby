import { useEffect, useState } from 'react';
import { Preferences } from '@capacitor/preferences';
import { loadData, saveData } from '../storage';
import { SmsReader, buildTransactions, isNative } from '../smsAuto';

const ENABLE_KEY = 'pigbaby_sms_auto';

// Settings UI for SMS auto-accounting, shown in the Profile page. Reads and
// writes shared Preferences directly (the polling engine lives separately in
// SmsAutoSync, which stays mounted on the accounting page).
export default function SmsAutoPanel() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    if (!isNative) return;
    Preferences.get({ key: ENABLE_KEY }).then((r) => setEnabled(r.value === '1'));
    SmsReader.checkPermission()
      .then((r) => setPermission(r.granted))
      .catch(() => setPermission(false));
  }, []);

  const grantPermission = async () => {
    try {
      const res = await SmsReader.requestPermission();
      setPermission(res.granted);
      setStatusText(res.granted ? '已获得短信权限' : '未获得短信权限，无法自动记账');
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e);
      setStatusText(`申请权限失败：${msg}`);
    }
  };

  const toggle = async () => {
    if (!enabled && permission !== true) {
      const res = await SmsReader.requestPermission().catch(() => null);
      if (!res?.granted) {
        setStatusText('未获得短信权限，无法自动记账');
        return;
      }
      setPermission(true);
    }
    const next = !enabled;
    setEnabled(next);
    await Preferences.set({ key: ENABLE_KEY, value: next ? '1' : '0' });
    setStatusText(next ? '已开启：扣款短信将自动记入账单' : '已关闭自动记账');
  };

  const importRecent = async () => {
    try {
      const { records: recent } = await SmsReader.queryRecent({ limit: 20 });
      const data = await loadData();
      const { transactions, added } = buildTransactions(recent, data.records);
      if (added === 0) {
        setStatusText('最近短信中没有新的扣款记录');
        return;
      }
      await saveData({ ...data, records: [...data.records, ...transactions] });
      setStatusText(`📥 已导入最近账单 +${added} 条`);
    } catch (e) {
      const msg = (e as { message?: string })?.message || String(e);
      setStatusText(`导入失败（需要短信权限）：${msg}`);
    }
  };

  if (!isNative) {
    return <div className="sms-auto-status">短信自动记账仅安卓端可用（当前为网页预览）。</div>;
  }

  return (
    <div className="sms-auto-panel">
      <div className="sms-auto-row">
        <span className="sms-auto-title">📱 短信自动记账</span>
        <button
          className={`sms-auto-btn ${enabled ? 'on' : ''}`}
          onClick={toggle}
        >
          {enabled ? '已开启' : '已关闭'}
        </button>
        {!permission && (
          <button className="sms-auto-btn" onClick={grantPermission}>授权短信</button>
        )}
        <button className="sms-auto-btn" onClick={importRecent} disabled={!permission}>
          导入最近账单
        </button>
      </div>
      {statusText && <div className="sms-auto-status">{statusText}</div>}
      <div className="sms-auto-status">开启后，微信/支付宝/银行的扣款短信会自动记入账单（需保持 App 未被强行停止）。</div>
    </div>
  );
}
