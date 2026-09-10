import { useEffect, useRef, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import type { Transaction, PendingCapture } from '../storage';
import {
  loadData,
  saveData,
  loadAutoCapture,
  loadPendingCaptures,
  savePendingCaptures,
} from '../storage';
import { AutoCapture, syncCaptures, isNativeCapture } from '../autoCapture';
import AddRecordModal from './AddRecordModal';

interface Props {
  onRefresh: () => Promise<void>;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateOfMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function draftToTransaction(p: PendingCapture, overrides?: Partial<Transaction>): Transaction {
  const date = overrides?.date ?? dateOfMs(p.when);
  return {
    id: p.id,
    amount: p.amount,
    type: p.type,
    note: p.note,
    date,
    month: date.slice(0, 7),
    tag: p.tag,
    ...overrides,
  };
}

// 自动记账引擎 + 待确认列表：开启后轮询原生捕获队列（App 关闭期间的通知
// 也会在下次打开时补上），每笔生成待确认草稿；确认/修改后才入账。
export default function AutoCaptureSync({ onRefresh }: Props) {
  const [pending, setPending] = useState<PendingCapture[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<PendingCapture | null>(null);

  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const reloadPending = async () => {
    setPending(await loadPendingCaptures());
  };

  useEffect(() => {
    reloadPending();
  }, []);

  useEffect(() => {
    if (!isNativeCapture) return;
    let stopped = false;
    let handle: PluginListenerHandle | undefined;

    const pull = async () => {
      if (stopped) return;
      try {
        if (!(await loadAutoCapture())) return;
        const r = await syncCaptures();
        if (r.drafts > 0 || r.posted > 0) {
          await reloadPending();
          if (r.posted > 0) await onRefreshRef.current();
        }
      } catch {
        // transient native error: keep polling
      }
    };

    pull();
    const timer = setInterval(pull, 10000);
    AutoCapture.addListener('capture', () => { pull(); }).then((h) => { handle = h; });

    return () => {
      stopped = true;
      clearInterval(timer);
      handle?.remove();
    };
  }, []);

  const removeDraft = async (id: string) => {
    const list = await loadPendingCaptures();
    const next = list.filter((p) => p.id !== id);
    await savePendingCaptures(next);
    setPending(next);
  };

  const confirmDraft = async (p: PendingCapture) => {
    const data = await loadData();
    await saveData({ ...data, records: [...data.records, draftToTransaction(p)] });
    await removeDraft(p.id);
    await onRefresh();
  };

  const confirmAll = async () => {
    if (pending.length === 0) return;
    const data = await loadData();
    await saveData({ ...data, records: [...data.records, ...pending.map((p) => draftToTransaction(p))] });
    await savePendingCaptures([]);
    setPending([]);
    await onRefresh();
  };

  const saveEdited = async (record: Transaction) => {
    const data = await loadData();
    await saveData({ ...data, records: [...data.records, record] });
    await removeDraft(record.id);
    setEditing(null);
    await onRefresh();
  };

  if (pending.length === 0) return null;

  return (
    <div className="ac-pending-card">
      <div className="ac-pending-head" onClick={() => setExpanded(!expanded)}>
        <span className="ac-pending-title">🔔 自动记账待确认 {pending.length} 笔</span>
        <span className="ac-pending-toggle">{expanded ? '收起' : '展开'}</span>
      </div>

      {expanded && (
        <>
          <div className="ac-pending-list">
            {pending.map((p) => (
              <div key={p.id} className="ac-pending-item">
                <div className="ac-pending-item-main" onClick={() => setEditing(p)}>
                  <div className="ac-pending-note">{p.note}</div>
                  <div className="ac-pending-meta">
                    {p.app} · {dateOfMs(p.when)}
                    <span className="ac-pending-tag">{p.tag}</span>
                  </div>
                </div>
                <div className={`ac-pending-amount ${p.type}`}>
                  {p.type === 'income' ? '+' : '−'}¥{p.amount.toFixed(2)}
                </div>
                <button className="ac-pending-btn ok" onClick={() => confirmDraft(p)}>确认</button>
                <button className="ac-pending-btn" onClick={() => removeDraft(p.id)}>忽略</button>
              </div>
            ))}
          </div>
          {pending.length > 1 && (
            <button className="ac-pending-all" onClick={confirmAll}>全部确认入账</button>
          )}
          <div className="ac-pending-hint">点击每条可修改后入账；确认后才会写入账单。</div>
        </>
      )}

      {editing && (
        <AddRecordModal
          type={editing.type}
          draft
          editRecord={draftToTransaction(editing)}
          onSave={saveEdited}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
