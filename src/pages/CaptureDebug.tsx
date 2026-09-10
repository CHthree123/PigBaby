import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AutoCapture, parseCapture, isNativeCapture, type RawCapture, type ParseResult } from '../autoCapture';
import { loadData, loadTagRegistry, loadPendingCaptures } from '../storage';
import { MemoryEngine } from '../tagMemory';
import './CaptureDebug.css';

interface Row {
  capture: RawCapture;
  result: ParseResult;
  draft: boolean;
  recorded: boolean;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function CaptureDebug() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    if (!isNativeCapture) {
      setError('仅安卓端可用（当前为网页预览）');
      setLoading(false);
      return;
    }
    try {
      const { captures } = await AutoCapture.pullCaptured();
      const data = await loadData();
      const reg = await loadTagRegistry();
      const tagNames = new Set([...reg.expense, ...reg.income].map((d) => d.name));
      const engine = new MemoryEngine(data.records);
      const pending = await loadPendingCaptures();
      const draftIds = new Set(pending.map((p) => p.id));
      const recordIds = new Set(data.records.map((r) => r.id));
      const list: Row[] = (captures || [])
        .map((c) => ({
          capture: c,
          result: parseCapture(c, tagNames, engine),
          draft: draftIds.has(c.id),
          recorded: recordIds.has(c.id),
        }))
        .sort((a, b) => b.capture.when - a.capture.when);
      setRows(list);
    } catch (e) {
      setError(`读取失败：${(e as { message?: string })?.message || String(e)}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="cd-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate('/profile/center')}>‹ 返回</button>
        <h3>🔍 最近捕获</h3>
        <span className="profile-header-spacer" />
      </div>

      <div className="cd-note">
        显示最近 7 天捕获的微信/支付宝通知原文与解析结果，用于校准解析规则。
        {rows.length > 0 && ` 共 ${rows.length} 条。`}
      </div>

      <button className="cd-refresh" onClick={load} disabled={loading}>
        {loading ? '读取中…' : '刷新'}
      </button>

      {error && <div className="cd-error">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="cd-note">还没有捕获到通知。开启自动记账并完成一笔小额支付后，这里会出现通知原文。</div>
      )}

      {rows.map(({ capture, result, draft, recorded }) => (
        <div key={capture.id} className="cd-card">
          <div className="cd-card-head">
            <span className="cd-app">{capture.app}</span>
            <span className="cd-time">{formatTime(capture.when)}</span>
            {draft && <span className="cd-badge draft">待确认</span>}
            {recorded && <span className="cd-badge done">已入账</span>}
          </div>
          <div className="cd-raw">
            {capture.title && <div>标题：{capture.title}</div>}
            {capture.text && <div>正文：{capture.text}</div>}
            {capture.bigText && capture.bigText !== capture.text && <div>大文本：{capture.bigText}</div>}
            {capture.subText && <div>副文本：{capture.subText}</div>}
          </div>
          {result.ok && result.parsed ? (
            <div className="cd-parse ok">
              ✅ 解析成功：{result.parsed.type === 'income' ? '收入' : '支出'} ¥{result.parsed.amount.toFixed(2)}
              {result.parsed.merchant && ` · 对方：${result.parsed.merchant}`}
              {` · 标签：${result.parsed.tag}`}
            </div>
          ) : (
            <div className="cd-parse fail">⚠️ 未生成草稿：{result.reason}</div>
          )}
        </div>
      ))}
    </div>
  );
}
