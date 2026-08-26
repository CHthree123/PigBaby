import { useEffect, useRef, useState } from 'react';
import { Preferences } from '@capacitor/preferences';
import type { Transaction } from '../storage';
import { SmsReader, buildTransactions, isNative } from '../smsAuto';

interface Props {
  records: Transaction[];
  onImported: (transactions: Transaction[], added: number) => Promise<void>;
}

const ENABLE_KEY = 'pigbaby_sms_auto';

export default function SmsAutoPanel({ records, onImported }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [statusText, setStatusText] = useState('');

  const recordsRef = useRef(records);
  useEffect(() => { recordsRef.current = records; }, [records]);

  const onImportedRef = useRef(onImported);
  useEffect(() => { onImportedRef.current = onImported; }, [onImported]);

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
      const { transactions, added } = buildTransactions(recent, recordsRef.current);
      if (added === 0) {
        setStatusText('最近短信中没有新的扣款记录');
        return;
      }
      await onImportedRef.current(transactions, added);
      setStatusText(`📥 已导入最近账单 +${added} 条`);
    } catch {
      setStatusText('导入失败（需要短信权限）');
    }
  };

  // While enabled, pull records captured by the native receiver (works app closed too)
  useEffect(() => {
    if (!enabled || !isNative) return;
    let stopped = false;
    const pull = async () => {
      if (stopped) return;
      try {
        const { records: pending } = await SmsReader.syncPending();
        if (pending.length > 0) {
          const { transactions, added } = buildTransactions(pending, recordsRef.current);
          if (added > 0) {
            await onImportedRef.current(transactions, added);
            setStatusText(`📥 自动记账 +${added} 条`);
          }
        }
      } catch {
        // transient native error: keep polling
      }
    };
    pull();
    const timer = setInterval(pull, 10000);
    return () => { stopped = true; clearInterval(timer); };
  }, [enabled]);

  if (!isNative) return null;

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
    </div>
  );
}
