import { useEffect, useState } from 'react';

const CONFETTI = ['🎉', '✨', '💖', '🌟', '🎀', '💕', '🩷', '🎊', '🐷', '💝', '🪙', '💰'];
const COINS = ['🪙', '💰', '💎', '✨'];

interface Particle {
  id: number;
  emoji: string;
  left: number;
  delay: number;
  duration: number;
  isCoin: boolean;
}

export default function Celebration() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const items: Particle[] = [];
    // Confetti
    for (let i = 0; i < 20; i++) {
      items.push({
        id: i,
        emoji: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.5 + Math.random() * 2,
        isCoin: false,
      });
    }
    // Coins from center
    for (let i = 20; i < 32; i++) {
      items.push({
        id: i,
        emoji: COINS[Math.floor(Math.random() * COINS.length)],
        left: 35 + Math.random() * 30,
        delay: 0.2 + Math.random() * 0.4,
        duration: 1 + Math.random() * 1.5,
        isCoin: true,
      });
    }
    setParticles(items);
  }, []);

  return (
    <div className="celebration-overlay">
      <div className="celebration-pig-wrap">
        <div className="celebration-pig">🐷</div>
        <div className="celebration-coins">🪙💰</div>
      </div>
      {particles.map((p) => (
        <div
          key={p.id}
          className={`celebration-confetti ${p.isCoin ? 'coin' : ''}`}
          style={{
            left: `${p.left}%`,
            top: p.isCoin ? '40%' : '-30px',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          {p.emoji}
        </div>
      ))}
    </div>
  );
}
