import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  loadTagRegistry,
  renameTag,
  deleteTag,
  addTag,
  setTagColor,
  loadData,
  TAG_COLOR_POOL,
  type TagDef,
} from '../storage';
import './TagManager.css';

type TagType = 'expense' | 'income';

export default function TagManager() {
  const navigate = useNavigate();
  const [type, setType] = useState<TagType>('expense');
  const [defs, setDefs] = useState<TagDef[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [renaming, setRenaming] = useState<TagDef | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState('');
  const [coloring, setColoring] = useState<string | null>(null);
  const [newTag, setNewTag] = useState('');
  const [newError, setNewError] = useState('');

  const reload = async (t: TagType) => {
    const reg = await loadTagRegistry();
    setDefs(reg[t]);
    const data = await loadData();
    const c: Record<string, number> = {};
    for (const r of data.records) {
      if (r.type !== t) continue;
      const name = r.tag || '其他';
      c[name] = (c[name] || 0) + 1;
    }
    setCounts(c);
  };

  useEffect(() => {
    reload(type);
    setRenaming(null);
    setColoring(null);
    setNewError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const startRename = (d: TagDef) => {
    setRenaming(d);
    setRenameInput(d.name);
    setRenameError('');
    setColoring(null);
  };

  const confirmRename = async () => {
    if (!renaming) return;
    const t = renameInput.trim();
    if (!t || t === renaming.name) {
      setRenaming(null);
      return;
    }
    const ok = await renameTag(type, renaming.name, t);
    if (!ok) {
      setRenameError('名称已存在，换一个吧');
      return;
    }
    setRenaming(null);
    await reload(type);
  };

  const pickColor = async (d: TagDef, color: string) => {
    await setTagColor(type, d.name, color);
    setColoring(null);
    await reload(type);
  };

  const handleDelete = async (d: TagDef) => {
    if (defs.length <= 1) {
      window.alert('至少保留一个标签');
      return;
    }
    const n = counts[d.name] || 0;
    const msg = n > 0
      ? `删除标签「${d.name}」？该标签下有 ${n} 笔历史记录，记录会保留原标签名，仅从可选列表中移除。`
      : `删除标签「${d.name}」？`;
    if (!window.confirm(msg)) return;
    await deleteTag(type, d.name);
    await reload(type);
  };

  const handleAdd = async () => {
    const t = newTag.trim();
    if (!t) return;
    const ok = await addTag(type, t);
    if (!ok) {
      setNewError('标签已存在');
      return;
    }
    setNewTag('');
    setNewError('');
    await reload(type);
  };

  return (
    <div className="tm-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate('/profile/center')}>‹ 返回</button>
        <h3>🏷️ 标签管理</h3>
        <span className="profile-header-spacer" />
      </div>

      <div className="tm-tabs">
        <button className={`tm-tab ${type === 'expense' ? 'active' : ''}`} onClick={() => setType('expense')}>支出标签</button>
        <button className={`tm-tab ${type === 'income' ? 'active' : ''}`} onClick={() => setType('income')}>收入标签</button>
      </div>

      <div className="tm-list">
        {defs.map((d) => (
          <div key={d.name} className="tm-item">
            <div className="tm-item-main">
              <span
                className="tm-dot"
                style={{ background: d.color }}
                onClick={() => setColoring(coloring === d.name ? null : d.name)}
              />
              <span className="tm-name">{d.name}</span>
              <span className="tm-count">{counts[d.name] || 0} 笔</span>
              <button className="tm-act" onClick={() => startRename(d)}>重命名</button>
              <button className="tm-act" onClick={() => setColoring(coloring === d.name ? null : d.name)}>换色</button>
              <button className="tm-act del" onClick={() => handleDelete(d)}>删除</button>
            </div>

            {coloring === d.name && (
              <div className="tm-palette">
                {TAG_COLOR_POOL.map((c) => (
                  <button
                    key={c}
                    className="tm-swatch"
                    style={{ background: c }}
                    onClick={() => pickColor(d, c)}
                  />
                ))}
              </div>
            )}

            {renaming?.name === d.name && (
              <div className="tm-rename">
                <input
                  className="tm-input"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
                  autoFocus
                />
                <button className="tm-btn primary" onClick={confirmRename}>确定</button>
                <button className="tm-btn" onClick={() => setRenaming(null)}>取消</button>
              </div>
            )}
            {renameError && renaming?.name === d.name && <div className="tm-err">{renameError}</div>}
          </div>
        ))}
      </div>

      <div className="tm-add">
        <input
          className="tm-input"
          placeholder={`新增${type === 'expense' ? '支出' : '收入'}标签`}
          value={newTag}
          onChange={(e) => { setNewTag(e.target.value); setNewError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="tm-btn primary" onClick={handleAdd}>添加</button>
      </div>
      {newError && <div className="tm-err">{newError}</div>}

      <div className="tm-note">重命名会同步更新全部历史记录；删除仅从可选列表移除，历史记录保留原标签名。</div>
    </div>
  );
}
