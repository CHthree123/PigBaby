import { useState, useEffect, useRef, useMemo } from 'react';
import type { Transaction } from '../storage';
import {
  loadTagRegistry,
  addTag,
  deleteTag,
  loadData,
  loadSmartRec,
  loadIgnoredNotes,
  addIgnoredNote,
  type TagDef,
} from '../storage';
import { MemoryEngine, canAutoFillNote, type AmountSuggestion } from '../tagMemory';
import './AddRecordModal.css';

// 自动填入备注所需的最低推荐分（防止弱匹配乱填）
const AUTO_FILL_MIN_SCORE = 3;

interface Props {
  type: 'income' | 'expense';
  editRecord?: Transaction | null;
  draft?: boolean;              // 自动记账待确认草稿：标题改为确认语气
  prefill?: { amount?: number; note?: string; date?: string; tag?: string };
  onSave: (record: Transaction) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddRecordModal({ type, editRecord, draft, prefill, onSave, onDelete, onClose }: Props) {
  const isEdit = !!editRecord;
  const [amount, setAmount] = useState(editRecord ? String(editRecord.amount) : prefill?.amount ? String(prefill.amount) : '');
  const [note, setNote] = useState(editRecord?.note ?? prefill?.note ?? '');
  const [date, setDate] = useState(editRecord?.date ?? prefill?.date ?? todayStr());
  const [tag, setTag] = useState(editRecord?.tag || prefill?.tag || '其他');
  const [tagDefs, setTagDefs] = useState<TagDef[]>([]);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [showDelConfirm, setShowDelConfirm] = useState(false);
  const [allRecords, setAllRecords] = useState<Transaction[]>([]);
  const [smartRec, setSmartRec] = useState(true);
  const [ignored, setIgnored] = useState<Record<string, string[]>>({});
  const [amountSuggestions, setAmountSuggestions] = useState<AmountSuggestion[]>([]);
  const lastAutoNote = useRef<string | null>(null);
  const noteRef = useRef(note);
  const openTime = useRef(Date.now());

  const handleOverlayClick = () => {
    if (Date.now() - openTime.current > 400) {
      onClose();
    }
  };

  useEffect(() => {
    const load = async () => {
      const reg = await loadTagRegistry();
      const defs = type === 'income' ? reg.income : reg.expense;
      const data = await loadData();
      setTagDefs(defs);
      setAllRecords(data.records);
      setSmartRec(await loadSmartRec());
      setIgnored(await loadIgnoredNotes());
      setTag((prev) => {
        if (isEdit || defs.some((d) => d.name === prev)) return prev;
        return defs.find((d) => d.name === '其他')?.name ?? defs[0]?.name ?? prev;
      });
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const engine = useMemo(() => new MemoryEngine(allRecords), [allRecords]);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  // 输入金额后：按历史「时间 + 金额 + 标签词条」自动生成备注（草稿同样生效；
  // 编辑已保存的记录不改写）。依赖不含 note，避免自动填入反向触发循环。
  useEffect(() => {
    const amt = parseFloat(amount);
    if (!smartRec || isNaN(amt) || amt <= 0) {
      setAmountSuggestions([]);
      return;
    }
    if (isEdit && !draft) return;
    const timer = setTimeout(() => {
      const sugg = engine.suggestForAmount(type, amt, undefined, 4, ignored);
      setAmountSuggestions(sugg);
      const top = sugg[0];
      if (!top || top.score < AUTO_FILL_MIN_SCORE) return;
      if (!canAutoFillNote(noteRef.current, lastAutoNote.current)) return;
      setNote(top.note);
      lastAutoNote.current = top.note;
      setTag((prev) => (prev === '其他' || !prev ? top.tag || prev : prev));
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, smartRec, engine, ignored, type]);

  // Notes remembered under the currently selected tag (from history, time-of-day first)
  const rememberedNotes = useMemo(() => {
    if (!smartRec || !tag) return [];
    return engine.suggestNotes(tag, undefined, 6, ignored[tag] || []);
  }, [engine, tag, smartRec, ignored]);

  // 输入备注时按历史推荐标签
  const tagSuggestions = useMemo(() => {
    if (!smartRec || !note.trim()) return [];
    const names = new Set(tagDefs.map((d) => d.name));
    return engine.suggestTags(note, undefined, 5)
      .filter((s) => names.has(s.tag) && s.tag !== tag);
  }, [engine, note, smartRec, tagDefs, tag]);

  useEffect(() => {
    if (editRecord) {
      setAmount(String(editRecord.amount));
      setNote(editRecord.note);
      setDate(editRecord.date);
      setTag(editRecord.tag || '其他');
      lastAutoNote.current = null;
    }
  }, [editRecord]);

  const handleAddCustomTag = async () => {
    const t = customTag.trim();
    if (!t) {
      setShowCustomInput(false);
      return;
    }
    const created = await addTag(type, t);
    const reg = await loadTagRegistry();
    const defs = type === 'income' ? reg.income : reg.expense;
    setTagDefs(defs);
    if (created || defs.some((d) => d.name === t)) setTag(t);
    setShowCustomInput(false);
    setCustomTag('');
  };

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;

    const record: Transaction = {
      id: editRecord?.id ?? Date.now().toString(),
      amount: amt,
      type,
      note: note.trim(),
      date,
      month: date.slice(0, 7),
      tag,
    };
    onSave(record);
  };

  const handleIgnoreNote = async (note: string) => {
    await addIgnoredNote(tag, note);
    setIgnored(await loadIgnoredNotes());
  };

  const handleDeleteTag = async (t: string) => {
    if (!window.confirm(`删除标签「${t}」？已记的账不受影响，可随时重新添加。`)) return;
    await deleteTag(type, t);
    const reg = await loadTagRegistry();
    const defs = type === 'income' ? reg.income : reg.expense;
    setTagDefs(defs);
    if (tag === t) {
      setTag(defs.find((d) => d.name === '其他')?.name ?? defs[0]?.name ?? '其他');
    }
  };

  const handleDelete = () => {
    if (!editRecord || !onDelete) return;
    onDelete(editRecord.id);
    onClose();
  };

  const isValid = amount && parseFloat(amount) > 0;

  return (
    <div className="arm-overlay" onClick={handleOverlayClick}>
      <div className="arm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 className="arm-title">
          {draft
            ? (type === 'income' ? '🔔 确认收入（可修改）' : '🔔 确认支出（可修改）')
            : isEdit
              ? (type === 'income' ? '💰 编辑收入' : '💸 编辑支出')
              : (type === 'income' ? '💰 记收入' : '💸 记支出')}
        </h3>

        <div className="arm-field">
          <label className="arm-label">金额</label>
          <div className="arm-amount-wrap">
            <span className="arm-amount-prefix">¥</span>
            <input
              className="arm-amount-input"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              autoFocus={!isEdit}
            />
          </div>
        </div>

        <div className="arm-field">
          <label className="arm-label">备注</label>
          <input
            className="arm-input"
            type="text"
            placeholder={type === 'income' ? '例如：工资' : '例如：午餐'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {amountSuggestions.length > 0 && (
            <div className="arm-tag-suggest" style={{ marginTop: 6 }}>
              <span className="arm-tag-suggest-label">✨ 按金额时间推荐</span>
              {amountSuggestions.map((s) => (
                <button
                  key={`${s.note}|${s.tag}`}
                  className="arm-tag-suggest-chip"
                  onClick={() => {
                    setNote(s.note);
                    lastAutoNote.current = s.note;
                    if (s.tag) setTag(s.tag);
                  }}
                >
                  {s.note} · {s.tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="arm-field">
          <label className="arm-label">标签</label>
            {tagSuggestions.length > 0 && (
              <div className="arm-tag-suggest">
                <span className="arm-tag-suggest-label">💡 推荐</span>
                {tagSuggestions.map((s) => (
                  <button key={s.tag} className="arm-tag-suggest-chip" onClick={() => setTag(s.tag)}>
                    {s.tag}
                  </button>
                ))}
              </div>
            )}
            <div className="tag-selector">
              {tagDefs.map((d) => (
                <span key={d.name} className="tag-chip-wrap">
                  <button
                    className={`tag-chip ${tag === d.name ? 'selected' : ''}`}
                    style={tag === d.name ? { background: d.color || '#FF9BB3' } : {}}
                    onClick={() => setTag(d.name)}
                  >
                    {d.name}
                  </button>
                  {tagDefs.length > 1 && (
                    <b className="tag-chip-del" onClick={() => handleDeleteTag(d.name)}>✕</b>
                  )}
                </span>
              ))}
              <button
                className="tag-chip"
                style={{ background: showCustomInput ? 'var(--bg)' : 'transparent' }}
                onClick={() => setShowCustomInput(!showCustomInput)}
              >
                + 自定义
              </button>
            </div>
            {showCustomInput && (
              <input
                className="tag-custom-input"
                type="text"
                placeholder="输入新标签名"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomTag()}
                onBlur={handleAddCustomTag}
                autoFocus
              />
            )}
            {rememberedNotes.length > 0 && (
              <div className="arm-note-memory">
                <div className="arm-note-memory-title">💭 常用备注（点击填入）</div>
                <div className="arm-note-memory-list">
                  {rememberedNotes.map(({ note: n, count }) => (
                    <span key={n} className="arm-note-memory-chip" onClick={() => setNote(n)}>
                      {n}
                      <i className="arm-note-memory-count">{count}次</i>
                      <b
                        className="arm-note-memory-del"
                        onClick={(e) => { e.stopPropagation(); handleIgnoreNote(n); }}
                      >✕</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
        </div>

        <div className="arm-field">
          <label className="arm-label">日期</label>
          <input
            className="arm-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="arm-btns">
          {isEdit && onDelete ? (
            <>
              {showDelConfirm ? (
                <>
                  <button className="arm-btn arm-btn-del-confirm" onClick={handleDelete}>确认删除</button>
                  <button className="arm-btn arm-btn-cancel" onClick={() => setShowDelConfirm(false)}>取消</button>
                </>
              ) : (
                <>
                  <button className="arm-btn arm-btn-delete" onClick={() => setShowDelConfirm(true)}>删除</button>
                  <button
                    className={`arm-btn arm-btn-save ${type}`}
                    onClick={handleSave}
                    disabled={!isValid}
                  >
                    保存
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <button className="arm-btn arm-btn-cancel" onClick={onClose}>取消</button>
              <button
                className={`arm-btn arm-btn-save ${type}`}
                onClick={handleSave}
                disabled={!isValid}
              >
                确认
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
