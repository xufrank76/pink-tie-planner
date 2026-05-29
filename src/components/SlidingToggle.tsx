'use client';

import { useRef, useEffect, useState } from 'react';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';

interface SlidingToggleProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  height?: number;
  fontSize?: number;
  paddingX?: number;
}

export default function SlidingToggle<T extends string>({
  options,
  value,
  onChange,
  height = 58,
  fontSize = 20,
  paddingX = 24,
}: SlidingToggleProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = itemRefs.current.get(value);
    const container = containerRef.current;
    if (!el || !container) return;
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setPill({ left: elRect.left - containerRect.left, width: elRect.width });
    setReady(true);
  }, [value]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      style={{ position: 'relative', display: 'flex', background: '#d9d9d9', borderRadius: '40px', padding: '10px', flexShrink: 0 }}
    >
      {/* Sliding pill */}
      {pill && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            bottom: '10px',
            left: pill.left,
            width: pill.width,
            background: '#fff',
            borderRadius: '40px',
            transition: ready ? 'left 0.28s cubic-bezier(0.4, 0, 0.2, 1), width 0.28s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {options.map((opt) => (
        <button
          key={opt.value}
          ref={el => { if (el) itemRefs.current.set(opt.value, el); }}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            position: 'relative',
            zIndex: 1,
            border: 'none',
            background: 'transparent',
            borderRadius: '40px',
            padding: `0 ${paddingX}px`,
            height: `${height}px`,
            display: 'flex',
            alignItems: 'center',
            fontFamily: SANS,
            fontSize: `${fontSize}px`,
            cursor: 'pointer',
            color: value === opt.value ? '#000' : '#858080',
            transition: 'color 0.15s, opacity 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
