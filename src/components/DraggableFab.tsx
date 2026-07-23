import { useState, useRef, useEffect, useCallback } from 'react';

interface Props {
  onClick: () => void;
}

interface Position {
  x: number;
  y: number;
}

const STORAGE_KEY = 'fab_position';
const LONG_PRESS_MS = 200;
const EDGE_SNAP = 16;
const FAB_SIZE = 56;

function loadPosition(): Position | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Position;
  } catch {}
  return null;
}

function savePosition(pos: Position) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {}
}

function getDefaultPos(): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: vw - FAB_SIZE - 20,
    y: vh - FAB_SIZE - 100,
  };
}

export default function DraggableFab({ onClick }: Props) {
  const saved = loadPosition();
  const [pos, setPos] = useState<Position>(saved || getDefaultPos());
  const [dragging, setDragging] = useState(false);
  const [pressed, setPressed] = useState(false);

  const fabRef = useRef<HTMLButtonElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const startTouch = useRef({ x: 0, y: 0 });
  const startFabPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const clampAndSnap = useCallback((x: number, y: number): Position => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxX = vw - FAB_SIZE - EDGE_SNAP;
    const minX = EDGE_SNAP;
    const minY = 60;
    const maxY = vh - FAB_SIZE - 90;

    const clampedX = Math.max(minX, Math.min(maxX, x));
    const clampedY = Math.max(minY, Math.min(maxY, y));

    // Snap to nearest edge
    const distToLeft = clampedX - EDGE_SNAP;
    const distToRight = maxX - clampedX;
    const snappedX = distToLeft < distToRight ? EDGE_SNAP : maxX;

    return { x: snappedX, y: clampedY };
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => clampAndSnap(prev.x, prev.y));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampAndSnap]);

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const fab = fabRef.current;
    if (!fab) return;

    const rect = fab.getBoundingClientRect();
    startTouch.current = { x: touch.clientX, y: touch.clientY };
    startFabPos.current = { x: rect.left, y: rect.top };
    hasMoved.current = false;
    setPressed(true);

    longPressTimer.current = setTimeout(() => {
      isDragging.current = true;
      setDragging(true);
      setPressed(false);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startTouch.current.x);
    const dy = Math.abs(touch.clientY - startTouch.current.y);

    // Cancel long press if moved more than 5px
    if (!isDragging.current && (dx > 5 || dy > 5)) {
      hasMoved.current = true;
      clearTimer();
      setPressed(false);
      return;
    }

    if (isDragging.current) {
      e.preventDefault();
      const newX = startFabPos.current.x + (touch.clientX - startTouch.current.x);
      const newY = startFabPos.current.y + (touch.clientY - startTouch.current.y);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxX = vw - FAB_SIZE - EDGE_SNAP;
      const maxY = vh - FAB_SIZE - 90;

      setPos({
        x: Math.max(EDGE_SNAP, Math.min(maxX, newX)),
        y: Math.max(60, Math.min(maxY, newY)),
      });
    }
  };

  const handleTouchEnd = () => {
    clearTimer();
    setPressed(false);

    if (isDragging.current) {
      const snapped = clampAndSnap(pos.x, pos.y);
      setPos(snapped);
      savePosition(snapped);
      setDragging(false);
      isDragging.current = false;
      return;
    }

    setDragging(false);
    isDragging.current = false;

    // Short tap: fire immediately
    if (!hasMoved.current) {
      onClick();
    }
  };

  // Mouse support for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    const fab = fabRef.current;
    if (!fab) return;
    const rect = fab.getBoundingClientRect();
    startTouch.current = { x: e.clientX, y: e.clientY };
    startFabPos.current = { x: rect.left, y: rect.top };
    hasMoved.current = false;
    setPressed(true);

    longPressTimer.current = setTimeout(() => {
      isDragging.current = true;
      setDragging(true);
      setPressed(false);
    }, LONG_PRESS_MS);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const newX = startFabPos.current.x + (e.clientX - startTouch.current.x);
    const newY = startFabPos.current.y + (e.clientY - startTouch.current.y);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxX = vw - FAB_SIZE - EDGE_SNAP;
    const maxY = vh - FAB_SIZE - 90;

    setPos({
      x: Math.max(EDGE_SNAP, Math.min(maxX, newX)),
      y: Math.max(60, Math.min(maxY, newY)),
    });
  };

  const handleMouseUp = () => {
    clearTimer();
    setPressed(false);

    if (isDragging.current) {
      const snapped = clampAndSnap(pos.x, pos.y);
      setPos(snapped);
      savePosition(snapped);
      setDragging(false);
      isDragging.current = false;
      return;
    }

    setDragging(false);
    isDragging.current = false;

    if (!hasMoved.current) {
      onClick();
    }
  };

  const isDefault = saved === null;

  return (
    <button
      ref={fabRef}
      className={`fab ${dragging ? 'dragging' : ''} ${pressed ? 'pressed' : ''} ${isDefault ? '' : 'custom-pos'}`}
      style={{
        position: 'fixed',
        left: isDefault ? pos.x : pos.x,
        top: pos.y,
        bottom: 'auto',
        right: 'auto',
        transform: dragging ? 'scale(1.2)' : pressed ? 'scale(0.92)' : 'scale(1)',
        zIndex: 50,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <span style={{ pointerEvents: 'none' }}>+</span>
    </button>
  );
}
