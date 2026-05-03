'use client';

import Image from 'next/image';

export type PageId = 'dashboard' | 'degree-plan' | 'course-catalog' | 'semester-planner' | 'settings' | 'coming-soon';

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
      { id: 'degree-plan' as PageId, label: 'degree plan' },
      { id: 'course-catalog' as PageId, label: 'course catalog' },
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
                onClick={() => onNavigate(item.id)}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = '#000';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.color = '#858080';
                }}
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: '20px',
                  color: isActive ? '#000' : '#858080',
                  padding: '13px 17px',
                  cursor: 'pointer',
                  borderRadius: isActive ? '20px' : '0',
                  background: isActive ? '#fff' : 'transparent',
                  marginBottom: '2px',
                  transition: 'background 0.15s, color 0.15s',
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
  );
}
