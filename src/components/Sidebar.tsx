'use client';

import Image from 'next/image';
import { useRef, useEffect, useState } from 'react';

export type PageId = 'dashboard' | 'degree-plan' | 'my-plans' | 'course-catalog' | 'semester-planner' | 'settings' | 'coming-soon';

const NAV_GROUPS = [
  {
    label: 'OVERVIEW',
    items: [
      { id: 'dashboard' as PageId, label: 'dashboard' },
    ],
  },
  {
    label: 'PLANNING',
    items: [
      { id: 'degree-plan' as PageId, label: 'my degree' },
      { id: 'semester-planner' as PageId, label: 'my semester' },
      { id: 'my-plans' as PageId, label: 'my plans' },
      { id: 'course-catalog' as PageId, label: 'master catalog' },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [{ id: 'settings' as PageId, label: 'settings' }],
  },
];

export default function Sidebar({
  active,
  onNavigate,
}: {
  active: PageId;
  onNavigate: (id: PageId) => void;
}) {
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<PageId, HTMLDivElement>>(new Map());
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = itemRefs.current.get(active);
    const container = navRef.current;
    if (!el || !container) return;
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setPill({ top: elRect.top - containerRect.top, height: elRect.height });
    setReady(true);
  }, [active]);

  return (
    <div
      style={{
        background: '#ececec',
        width: '307px',
        minWidth: '307px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 26px',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '44px' }}>
        <span style={{ fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)', fontSize: '25px', color: '#c60078', lineHeight: 1 }}>
          pink
        </span>
        <Image
          src="/logo-tie.png"
          alt="pink tie"
          width={32}
          height={32}
          style={{ objectFit: 'contain', flexShrink: 0, margin: '0 -6px' }}
        />
        <span style={{ fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)', fontSize: '25px', color: '#c60078', lineHeight: 1 }}>
          tie
        </span>
        <span style={{ fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)', fontSize: '25px', color: '#000', lineHeight: 1, marginLeft: '6px' }}>
          planner
        </span>
      </div>

      {/* Nav groups — position:relative container for the sliding pill */}
      <div ref={navRef} style={{ position: 'relative', flex: 1 }}>
        {/* Sliding pill */}
        {pill && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: pill.top,
              height: pill.height,
              background: '#fff',
              borderRadius: '20px',
              transition: ready ? 'top 0.28s cubic-bezier(0.4, 0, 0.2, 1), height 0.28s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}

        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div
              style={{
                fontFamily: 'var(--font-dm-mono, "DM Mono", monospace)',
                fontSize: '15px',
                color: '#858080',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '8px',
                marginTop: '16px',
              }}
            >
              {group.label}
            </div>
            {group.items.map((item) => {
              const isActive = active === item.id;
              return (
                <div
                  key={item.id}
                  ref={el => { if (el) itemRefs.current.set(item.id, el); }}
                  onClick={() => onNavigate(item.id)}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = '#000';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = '#858080';
                  }}
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                    fontSize: '20px',
                    color: isActive ? '#000' : '#858080',
                    padding: '13px 17px',
                    cursor: 'pointer',
                    marginBottom: '2px',
                    transition: 'color 0.15s, opacity 0.15s',
                    userSelect: 'none',
                  }}
                >
                  {item.label}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
