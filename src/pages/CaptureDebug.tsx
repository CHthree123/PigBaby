import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AutoCapture,
  parseCapture,
  captureText,
  classifyCapture,
  extractTokens,
  syncCaptures,
  reconnectCapture,
  isNativeCapture,
  type RawCapture,
  type ParseResult,
  type AccessScreen,
  type CaptureClassify,
} from '../autoCapture';
import {
  loadData,
  saveData,
  loadTagRegistry,
  loadPendingCaptures,
  loadCaptureLog,
  loadCaptureRules,
  addCaptureRule,
  deleteCaptureRule,
  removePendingCapture,
  appendCaptureLog,
  deleteCaptureLogEntry,
  clearCaptureLog,
  type CaptureLogEntry,
  type CaptureRule,
} from '../storage';
import { MemoryEngine } from '../tagMemory';
import AddRecordModal from '../components/AddRecordModal';
import './CaptureDebug.css';

interface Row {
  capture: RawCapture;
  result: ParseResult;
  cls: CaptureClassify;
  draft: boolean;
  recorded: boolean;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dateOfMs(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 未解析成功的条目按文本猜一下收支方向，手动补记时预选
function guessIncome(capture: RawCapture): boolean {
  return /退款|到账|收款|收入|退回/.test(captureText(capture));
}

// 手动忽略/补记时写入历史的日志条目
function logOf(
  c: RawCapture,
  ok: boolean,
  reason: string,
  action: CaptureLogEntry['action']
): CaptureLogEntry {
  return {
    id: c.id,
    app: c.app,
    when: c.when,
    title: c.title,
    text: c.text,
    detail: ((c.extraText || '') + ' ' + (c.rawDump || '')).trim().slice(0, 300),
    loggedAt: Date.now(),
    ok,
    reason,
    action,
  };
}

const ACTION_LABEL: Record<CaptureLogEntry['action'], string> = {
  draft: '待确认',
  posted: '已入账',
  skipped: '未识别',
  duplicate: '重复',
  merged: '已合并',
  filtered: '已过滤',
  sensitive: '转账',
};

export default function CaptureDebug() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [log, setLog] = useState<CaptureLogEntry[]>([]);
  const [rules, setRules] = useState<CaptureRule[]>([]);
  const [listener, setListener] = useState<{ enabled: boolean; connected: boolean } | null>(null);
  const [accessEnabled, setAccessEnabled] = useState<boolean | null>(null);
  const [screens, setScreens] = useState<AccessScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [manual, setManual] = useState<Row | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectMsg, setReconnectMsg] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    if (!isNativeCapture) {
      setError('仅安卓端可用（当前为网页预览）');
      setLoading(false);
      return;
    }
    try {
      setListener(await AutoCapture.status().catch(() => null));
      // 先扫一遍通知栏，把还在栏里的通知补进队列
      await AutoCapture.scanActive().catch(() => undefined);
      const { captures } = await AutoCapture.pullCaptured();
      const data = await loadData();
      const reg = await loadTagRegistry();
      const tagNames = new Set([...reg.expense, ...reg.income].map((d) => d.name));
      const engine = new MemoryEngine(data.records);
      const pending = await loadPendingCaptures();
      const learned = await loadCaptureRules();
      setRules(learned);
      const draftIds = new Set(pending.map((p) => p.id));
      const recordIds = new Set(data.records.map((r) => r.id));
      const list: Row[] = (captures || [])
        .map((c) => ({
          capture: c,
          result: parseCapture(c, tagNames, engine),
          cls: classifyCapture(c, captureText(c), learned),
          draft: draftIds.has(c.id),
          recorded: recordIds.has(c.id),
        }))
        .sort((a, b) => b.capture.when - a.capture.when);
      setRows(list);
      setLog(await loadCaptureLog());
      setAccessEnabled((await AutoCapture.checkAccessibility().catch(() => null))?.enabled ?? null);
      setScreens((await AutoCapture.pullScreens().catch(() => ({ screens: [] }))).screens || []);
    } catch (e) {
      setError(`读取失败：${(e as { message?: string })?.message || String(e)}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 教学：记住这类消息以后该记账还是该忽略，并立即用新规则重跑一次同步
  const teach = async (row: Row, decision: 'record' | 'filter') => {
    const text = captureText(row.capture);
    const tokens = extractTokens(text);
    if (tokens.length === 0) return;
    await addCaptureRule({ tokens, decision, sample: text });
    await syncCaptures().catch(() => undefined);
    await load();
  };

  const ignoreSensitive = async (row: Row) => {
    await AutoCapture.clearCaptured({ ids: [row.capture.id] }).catch(() => undefined);
    await appendCaptureLog([logOf(row.capture, false, '已忽略转账提醒', 'sensitive')]);
    await load();
  };

  return (
    <div className="cd-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate('/profile/center')}>‹ 返回</button>
        <h3>🔍 最近捕获</h3>
        <span className="profile-header-spacer" />
      </div>

      <div className="cd-note">
        显示最近 7 天捕获的微信/支付宝/抖音/淘宝/京东/拼多多/美团/云闪付通知原文与处置结果（历史记录不会因清后台而丢失）。
        转账类消息不会自动记账，需手动补记；广告/物流类自动过滤；不确定的消息可以点「以后记账 / 以后忽略」教它，
        下次遇到同类消息自动处理。
      </div>

      <div className={`cd-status ${listener?.connected ? 'on' : ''}`}>
        {listener === null
          ? '监听状态：读取中…'
          : !listener.enabled
            ? '监听状态：未授权（去「权限设置」开启通知使用权）'
            : listener.connected
              ? '监听状态：已授权 · 监听中'
              : '监听状态：已授权 · 未连接（服务被系统清理，打开本页或稍候会自动重连）'}
      </div>

      {listener?.enabled && !listener.connected && (
        <>
          <button
            className="cd-refresh"
            disabled={reconnecting}
            onClick={async () => {
              setReconnecting(true);
              setReconnectMsg('');
              try {
                const s = await reconnectCapture();
                setListener(s);
                setReconnectMsg(
                  s.connected
                    ? '✅ 已重新连接'
                    : '未连接成功：可在「系统设置」里把通知使用权关闭再重新打开，或重启手机'
                );
              } catch {
                setReconnectMsg('重连失败：可在「系统设置」里把通知使用权关闭再重新打开');
              }
              setReconnecting(false);
            }}
          >
            {reconnecting ? '连接中…（最多等约 6 秒）' : '🔄 重连监听服务'}
          </button>
          <button
            className="cd-mini"
            onClick={() => { AutoCapture.openSettings().catch(() => undefined); }}
          >
            去系统设置
          </button>
        </>
      )}
      {reconnectMsg && <div className="cd-note">{reconnectMsg}</div>}

      <button className="cd-refresh" onClick={load} disabled={loading}>
        {loading ? '读取中…' : '刷新（并扫描通知栏）'}
      </button>

      {rows.length > 0 && (
        <button
          className="cd-refresh"
          onClick={async () => {
            await AutoCapture.clearCaptured({ ids: rows.map((r) => r.capture.id) });
            setRows([]);
          }}
        >
          清空未处理捕获（不影响历史与已入账记录）
        </button>
      )}

      {error && <div className="cd-error">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="cd-note">当前没有未处理的捕获。下面「历史记录」里可以看到每次捕获的处置结果。</div>
      )}

      {rows.map((row) => {
        const { capture, result, cls, draft, recorded } = row;
        const isSensitive = cls.cls === 'sensitive';
        const tokens = !result.ok ? extractTokens(captureText(capture)) : [];
        const needsAction = isSensitive || !result.ok;
        return (
          <div key={capture.id} className="cd-card">
            <div className="cd-card-head">
              <span className="cd-app">{capture.app}</span>
              <span className="cd-time">{formatTime(capture.when)}</span>
              {draft && <span className="cd-badge draft">待确认</span>}
              {recorded && <span className="cd-badge done">已入账</span>}
              {isSensitive && <span className="cd-badge danger">转账·需手动补记</span>}
              {!isSensitive && !result.ok && <span className="cd-badge warn">待判断</span>}
            </div>
            <div className="cd-raw">
              {([
                ['标题', capture.title],
                ['正文', capture.text],
                ['大文本', capture.bigText],
                ['副文本', capture.subText],
                ['摘要', capture.summaryText],
                ['信息', capture.infoText],
                ['大标题', capture.titleBig],
                ['会话', capture.conversationTitle],
                ['通知栏', capture.ticker],
                ['其他', capture.extraText],
              ] as [string, string | undefined][])
                .filter(([, v]) => !!v && !!v.trim())
                .map(([label, v]) => <div key={label}>{label}：{v}</div>)}
              {capture.rawDump && <div className="cd-rawdump">原始字段：{capture.rawDump}</div>}
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
            {isSensitive && <div className="cd-parse fail">🔒 {cls.reason}</div>}
            {needsAction && (
              <div className="cd-actions">
                {!isSensitive && (
                  <>
                    <button className="cd-mini" disabled={!tokens.length} onClick={() => teach(row, 'record')}>
                      ✅ 以后记账
                    </button>
                    <button className="cd-mini" disabled={!tokens.length} onClick={() => teach(row, 'filter')}>
                      🚫 以后忽略
                    </button>
                  </>
                )}
                <button className="cd-manual" onClick={() => setManual(row)}>手动补记这一笔</button>
                {isSensitive && (
                  <button className="cd-mini" onClick={() => ignoreSensitive(row)}>忽略</button>
                )}
              </div>
            )}
            {needsAction && !isSensitive && !tokens.length && (
              <div className="cd-log-reason">未提取到特征词，无法教学；可直接手动补记</div>
            )}
          </div>
        );
      })}

      {rules.length > 0 && (
        <>
          <div className="cd-section-title">学习规则（{rules.length} 条）</div>
          {rules.map((r) => (
            <div key={r.id} className="cd-log-row">
              <div className="cd-log-head">
                <span className={`cd-badge ${r.decision === 'record' ? 'act-posted' : 'act-filtered'}`}>
                  {r.decision === 'record' ? '以后记账' : '以后忽略'}
                </span>
                <span className="cd-rule-tokens">{r.tokens.join(' + ')}</span>
                <span className="cd-rule-hits">命中 {r.hits} 次</span>
                <button
                  className="cd-mini"
                  onClick={async () => {
                    await deleteCaptureRule(r.id);
                    setRules(await loadCaptureRules());
                  }}
                >
                  删除
                </button>
              </div>
              <div className="cd-log-text">{r.sample}</div>
            </div>
          ))}
        </>
      )}

      {log.length > 0 && (
        <>
          <div className="cd-section-title cd-section-row">
            <span>历史记录（最近 {log.length} 条）</span>
            <button
              className="cd-mini"
              onClick={async () => {
                if (!window.confirm('确定清空全部历史记录？')) return;
                await clearCaptureLog();
                setLog([]);
              }}
            >
              清空历史
            </button>
          </div>
          {log.map((e) => (
            <div key={e.id} className="cd-log-row">
              <div className="cd-log-head">
                <span className="cd-app">{e.app}</span>
                <span className="cd-time">{formatTime(e.when)}</span>
                <span className={`cd-badge act-${e.action}`}>{ACTION_LABEL[e.action]}</span>
                <button
                  className="cd-mini"
                  onClick={async () => {
                    await deleteCaptureLogEntry(e.id);
                    setLog(await loadCaptureLog());
                  }}
                >
                  删除
                </button>
              </div>
              <div className="cd-log-text">{e.text || e.title || '（无文本）'}</div>
              <div className="cd-log-reason">{e.reason}</div>
            </div>
          ))}
        </>
      )}

      <div className="cd-section-title">无障碍读取（实验）</div>
      <div className={`cd-status ${accessEnabled ? 'on' : ''}`}>
        {accessEnabled === null
          ? '无障碍状态：读取中…'
          : accessEnabled
            ? '无障碍已开启：打开微信/支付宝的账单、支付结果或「微信支付」聊天页时会记录页面文字'
            : '无障碍未开启：到「权限设置」打开「PigBaby 账单读取（实验）」'}
      </div>
      {screens.length > 0 && (
        <>
          <button
            className="cd-refresh"
            onClick={async () => {
              await AutoCapture.clearScreens({ ids: screens.map((s) => s.id) });
              setScreens([]);
            }}
          >
            清空抓屏记录（{screens.length} 条）
          </button>
          {screens.map((s) => (
            <div key={s.id} className="cd-card">
              <div className="cd-card-head">
                <span className="cd-app">{s.app}</span>
                <span className="cd-time">{formatTime(s.when)}</span>
              </div>
              <pre className="cd-screen-text">{s.text}</pre>
            </div>
          ))}
        </>
      )}

      {manual && (
        <AddRecordModal
          type={guessIncome(manual.capture) ? 'income' : 'expense'}
          draft
          prefill={{
            note: manual.capture.app,
            date: dateOfMs(manual.capture.when),
          }}
          onSave={async (record) => {
            const data = await loadData();
            await saveData({ ...data, records: [...data.records, record] });
            await AutoCapture.clearCaptured({ ids: [manual.capture.id] }).catch(() => undefined);
            await removePendingCapture(manual.capture.id);
            await appendCaptureLog([logOf(manual.capture, true, `手动补记 ¥${record.amount.toFixed(2)}`, 'posted')]);
            setManual(null);
            await load();
          }}
          onClose={() => setManual(null)}
        />
      )}
    </div>
  );
}
