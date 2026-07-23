import { useState, useEffect, useCallback } from 'react';
import type { Tip, TipsData } from '../storage';
import { loadTips, saveTips } from '../storage';
import EmptyState from './EmptyState';

export default function Tips() {
  const [tips, setTips] = useState<Tip[]>([]);
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const refresh = useCallback(async () => {
    const d = await loadTips();
    setTips(d.tips);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleAdd = async () => {
    if (!content.trim()) return;
    const tip: Tip = {
      id: Date.now().toString(),
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated: TipsData = { tips: [tip, ...tips] };
    await saveTips(updated);
    setContent('');
    await refresh();
  };

  const handleDelete = async (id: string) => {
    const updated: TipsData = { tips: tips.filter((t) => t.id !== id) };
    await saveTips(updated);
    await refresh();
  };

  const handleUpdate = async (id: string) => {
    if (!editContent.trim()) return;
    const updated: TipsData = {
      tips: tips.map((t) => (t.id === id ? { ...t, content: editContent.trim() } : t)),
    };
    await saveTips(updated);
    setEditingId(null);
    setEditContent('');
    await refresh();
  };

  const startEdit = (tip: Tip) => {
    setEditingId(tip.id);
    setEditContent(tip.content);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="tips-page">
      {/* Input area */}
      <div className="tips-input-card">
        <textarea
          className="tips-textarea"
          placeholder="💡 记录灵感、想法、感受..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
        />
        <button className="tips-add-btn" onClick={handleAdd} disabled={!content.trim()}>
          保存
        </button>
      </div>

      {/* Tips list */}
      {tips.length === 0 ? (
        <EmptyState emoji="💡" title="还没有随笔记录~" tips={['记录灵感瞬间', '随手记下想法', '每天一点感悟']} />
      ) : (
        <div className="tips-list">
          {tips.map((tip) => (
            <div key={tip.id} className="tips-card">
              <div className="tips-card-header">
                <span className="tips-time">{formatTime(tip.createdAt)}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="tips-action-btn" onClick={() => startEdit(tip)}>✏</button>
                  <button className="tips-action-btn" onClick={() => handleDelete(tip.id)}>🗑</button>
                </div>
              </div>
              {editingId === tip.id ? (
                <div>
                  <textarea
                    className="tips-textarea"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="tips-add-btn" onClick={() => handleUpdate(tip.id)}>保存</button>
                    <button className="tips-action-btn" onClick={() => setEditingId(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <div className="tips-content">{tip.content}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
