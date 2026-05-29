'use client';

import Image from 'next/image';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';

export default function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div style={{ height: '100vh', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', boxSizing: 'border-box', gap: '24px' }}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        <span style={{ fontFamily: SANS, fontSize: '64px', color: '#c60078', lineHeight: 1 }}>pink</span>
        <div style={{ margin: '0 -14px', flexShrink: 0 }}>
          <Image src="/logo-tie.png" alt="pink tie" width={80} height={80} style={{ objectFit: 'contain', display: 'block' }} />
        </div>
        <span style={{ fontFamily: SANS, fontSize: '64px', color: '#c60078', lineHeight: 1 }}>tie</span>
        <span style={{ fontFamily: SANS, fontSize: '64px', color: '#000', lineHeight: 1, marginLeft: '16px' }}>planner</span>
      </div>

      {/* Tagline */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <p style={{ fontFamily: SANS, fontSize: '18px', color: '#858080', textAlign: 'center', margin: 0, fontWeight: 400, whiteSpace: 'nowrap' }}>
          designed for uw math students navigating 16 majors.
        </p>
        <p style={{ fontFamily: SANS, fontSize: '18px', color: '#858080', textAlign: 'center', margin: 0, fontWeight: 400 }}>
          what will you choose?
        </p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onGetStarted}
        style={{ background: '#000', color: '#fff', border: 'none', borderRadius: '40px', height: '52px', padding: '0 32px', fontFamily: SANS, fontSize: '18px', cursor: 'pointer', marginTop: '8px' }}
      >
        get started →
      </button>
    </div>
  );
}
