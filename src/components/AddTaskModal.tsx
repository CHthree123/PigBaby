import { useState, useRef, useEffect } from 'react';
import type { Task } from '../storage';

interface Props {
  defaultDate: string;
  editTask?: Task | null;
  onSave: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  onClose: () => void;
}

// 提醒只存 HH:mm（日期永远跟随任务日期），兼容旧的完整 datetime 字符串
function timeOfReminder(reminder: string | null | undefined): string {
  const m = /T(\d{2}:\d{2})/.exec(reminder ?? '');
  return m ? m[1] : '';
}

function nowLocalStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AddTaskModal({ defaultDate, editTask, onSave, onDelete, onClose }: Props) {
  const [content, setContent] = useState(editTask?.content ?? '');
  const [date, setDate] = useState(editTask?.date ?? defaultDate);
  const [reminder, setReminder] = useState(timeOfReminder(editTask?.reminder));
  const openTime = useRef(Date.now());
  const isEdit = !!editTask;

  useEffect(() => {
    if (editTask) {
      setContent(editTask.content);
      setDate(editTask.date);
      setReminder(timeOfReminder(editTask.reminder));
    }
  }, [editTask]);

  const handleOverlayClick = () => {
    if (Date.now() - openTime.current > 400) {
      onClose();
    }
  };

  const handleSave = () => {
    if (!content.trim()) return;
    const task: Task = {
      id: editTask?.id ?? Date.now().toString(),
      content: content.trim(),
      date,
      reminder: reminder ? `${date}T${reminder}` : null,
      completed: editTask?.completed ?? false,
      completedAt: editTask?.completedAt ?? null,
      createdAt: editTask?.createdAt ?? new Date().toISOString(),
      order: editTask?.order ?? 0,
    };
    onSave(task);
  };

  return (
    <div className="ac-modal-overlay" onClick={handleOverlayClick}>
      <div className="ac-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3>{isEdit ? '✏️ 编辑任务' : '📝 新建任务'}</h3>

        <div className="arm-field">
          <label className="arm-label">任务内容</label>
          <input
            className="arm-input"
            type="text"
            placeholder="输入任务内容..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus
          />
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

        <div className="arm-field">
          <label className="arm-label">⏰ 提醒时间（可选，任务日期当天）</label>
          <input
            className="arm-input"
            type="time"
            step={60}
            value={reminder}
            onChange={(e) => setReminder(e.target.value.slice(0, 5))}
          />
          {reminder && /^\d{4}-\d{2}-\d{2}$/.test(date) && (
            <div className="arm-label" style={{ marginTop: 6 }}>
              {`将在 ${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日 ${reminder} 提醒`}
            </div>
          )}
          {reminder && `${date}T${reminder}` <= nowLocalStr() && (
            <div className="arm-label" style={{ color: '#E8930C', marginTop: 6 }}>
              该时间已过去，不会收到提醒
            </div>
          )}
        </div>

        {isEdit && onDelete && (
          <div className="arm-field" style={{ textAlign: 'center', marginTop: 8 }}>
            <button
              className="ac-modal-btn cancel"
              style={{ color: '#FF6B6B', borderColor: '#FF6B6B' }}
              onClick={() => {
                if (window.confirm('确定要删除这个任务吗？')) {
                  onDelete(editTask!.id);
                }
              }}
            >
              🗑 删除任务
            </button>
          </div>
        )}
        <div className="ac-modal-btns">
          <button className="ac-modal-btn cancel" onClick={onClose}>取消</button>
          <button className="ac-modal-btn confirm" onClick={handleSave}>
            {isEdit ? '保存' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}
