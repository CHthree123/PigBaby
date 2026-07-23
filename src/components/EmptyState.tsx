import { useState, useEffect, useCallback } from 'react';
import './EmptyState.css';

interface Props {
  emoji?: string;
  title?: string;
  tips?: string[];
}

const DEFAULT_TIPS = [
  '今天开始记账吧！',
  '钱都花哪去啦？',
  '每一笔都是小确幸~',
  '存钱使我快乐 🐷',
  '记账是变富的第一步',
  '小猪在等你哦~',
  '记录生活，从今天开始',
  '让每一分钱都有意义',
  '加油攒钱买大件！',
  '日积月累，财富自由',
];

const SPARKLES = ['✨', '⭐', '💫', '🌟', '💖', '🌸', '🩷'];

export default function EmptyState({ emoji = '🐷', title, tips = DEFAULT_TIPS }: Props) {
  const [tipIndex, setTipIndex] = useState(0);
  const [sparkles] = useState(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      char: SPARKLES[i % SPARKLES.length],
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 3 + Math.random() * 4,
      size: 10 + Math.random() * 14,
    }));
  });

  const nextTip = useCallback(() => {
    setTipIndex(prev => (prev + 1) % tips.length);
  }, [tips.length]);

  useEffect(() => {
    const timer = setInterval(nextTip, 4000);
    return () => clearInterval(timer);
  }, [nextTip]);

  return (
    <div className="empty-state">
      <div className="empty-dashed-box">
        {/* Floating sparkles */}
        {sparkles.map((s) => (
          <span
            key={s.id}
            className="empty-sparkle"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              fontSize: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          >
            {s.char}
          </span>
        ))}

        {/* Main emoji illustration */}
        <div className="empty-art">
          <span className="empty-main-emoji">{emoji}</span>
          <span className="empty-side-emoji">🧺</span>
        </div>

        {/* Title */}
        <div className="empty-title">{title || `${emoji} 这里还空空的哦~`}</div>

        {/* Rotating tip */}
        <div className="empty-tip" key={tipIndex}>
          {tips[tipIndex]}
        </div>
      </div>
    </div>
  );
}
