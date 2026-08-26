import { useState, useEffect, useRef, useMemo } from 'react';
import type { Transaction } from '../storage';
import { DEFAULT_TAGS, loadCustomTags, saveCustomTags, loadTagColors, saveTagColors, getRandomTagColor, loadTagNotes, incrementTagNote, deleteTagNote, type TagNotes } from '../storage';
import './AddRecordModal.css';

interface Props {
  type: 'income' | 'expense';
  editRecord?: Transaction | null;
  onSave: (record: Transaction) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AddRecordModal({ type, editRecord, onSave, onDelete, onClose }: Props) {
  const isEdit = !!editRecord;
  const [amount, setAmount] = useState(editRecord ? String(editRecord.amount) : '');
  const [note, setNote] = useState(editRecord?.note ?? '');
  const [date, setDate] = useState(editRecord?.date ?? todayStr());
  const [tag, setTag] = useState(editRecord?.tag || '其他');
  const [allTags, setAllTags] = useState<string[]>(DEFAULT_TAGS);
  const [tagColors, setTagColors] = useState<Record<string, string>>({});
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [showDelConfirm, setShowDelConfirm] = useState(false);
  const [tagNotes, setTagNotes] = useState<TagNotes>({});
  const openTime = useRef(Date.now());

  const handleOverlayClick = () => {
    if (Date.now() - openTime.current > 400) {
      onClose();
    }
  };

  useEffect(() => {
    const load = async () => {
      const custom = await loadCustomTags();
      const colors = await loadTagColors();
      const notes = await loadTagNotes();
      setAllTags([...DEFAULT_TAGS, ...custom]);
      setTagColors(colors);
      setTagNotes(notes);
    };
    load();
  }, []);

  // Notes remembered under the currently selected tag, most used first
  const rememberedNotes = useMemo(() => {
    if (type !== 'expense' || !tag) return [];
    const notes = tagNotes[tag];
    if (!notes) return [];
    return Object.entries(notes)
      .map(([note, count]) => ({ note, count }))
      .sort((a, b) => b.count - a.count);
  }, [type, tag, tagNotes]);

  useEffect(() => {
    if (editRecord) {
      setAmount(String(editRecord.amount));
      setNote(editRecord.note);
      setDate(editRecord.date);
      setTag(editRecord.tag || '其他');
    }
  }, [editRecord]);

  const handleAddCustomTag = async () => {
    const t = customTag.trim();
    if (!t || allTags.includes(t)) {
      setShowCustomInput(false);
      setCustomTag('');
      return;
    }
    const updated = [...allTags, t];
    setAllTags(updated);
    setTag(t);
    const custom = await loadCustomTags();
    await saveCustomTags([...custom, t]);
    const colors = await loadTagColors();
    if (!colors[t]) {
      colors[t] = getRandomTagColor();
      await saveTagColors(colors);
      setTagColors({ ...colors });
    }
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
      tag: type === 'expense' ? tag : '',
    };
    if (type === 'expense' && tag && note.trim()) {
      await incrementTagNote(tag, note.trim());
    }
    onSave(record);
  };

  const handleDeleteNote = async (note: string) => {
    await deleteTagNote(tag, note);
    setTagNotes(await loadTagNotes());
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
          {isEdit ? (type === 'income' ? '💰 编辑收入' : '💸 编辑支出') : (type === 'income' ? '💰 记收入' : '💸 记支出')}
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
        </div>

        {type === 'expense' && (
          <div className="arm-field">
            <label className="arm-label">标签</label>
            <div className="tag-selector">
              {allTags.map((t) => (
                <button
                  key={t}
                  className={`tag-chip ${tag === t ? 'selected' : ''}`}
                  style={tag === t ? { background: tagColors[t] || '#FF9BB3' } : {}}
                  onClick={() => setTag(t)}
                >
                  {t}
                </button>
              ))}
              <button
                className="tag-chip"
                style={{ background: showCustomInput ? '#f0f0f0' : 'transparent' }}
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
                        onClick={(e) => { e.stopPropagation(); handleDeleteNote(n); }}
                      >✕</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
