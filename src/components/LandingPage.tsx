'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import rawPrograms from '@/src/data/requirements-filtered.json';
import { useIsMobile } from '@/src/lib/useIsMobile';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

const EXCLUDE_IDS = new Set(['core-bmath', 'core-bmath-mathstudies']);
const SPEC_PARENT: Record<string, string> = {
  'MS':    'Mathematical Studies',
  'ACTSC': 'Actuarial Science',
  'AMATH': 'Applied Mathematics',
};

type ProgramEntry = {
  id: string;
  name: string;
  faculty: string;
  code?: string;
  isMinor?: boolean;
  isSpecialization?: boolean;
  isMathFaculty?: boolean;
  minCourses?: number;
  requirements: unknown[];
};

function shortTitle(name: string): string {
  const p = name.indexOf('(');
  return p === -1 ? name.trim() : name.slice(0, p).trim();
}

function displayTitle(entry: ProgramEntry): string {
  if (entry.isSpecialization) {
    const prefix = (entry.code ?? '').split('-')[0];
    const parent = SPEC_PARENT[prefix];
    return parent ? `${entry.name} (${parent})` : entry.name;
  }
  return shortTitle(entry.name);
}

function programType(entry: ProgramEntry): string {
  if (entry.isMinor) return 'Minor';
  if (entry.isSpecialization) return 'Specialization';
  if (entry.name.toLowerCase().includes('joint')) return 'Joint';
  return 'Major';
}

function countCourses(entry: ProgramEntry): number {
  return entry.minCourses ?? 0;
}

const allPrograms: ProgramEntry[] = (() => {
  const raw = rawPrograms as unknown as Record<string, ProgramEntry>;
  const rows: ProgramEntry[] = [];
  for (const [id, v] of Object.entries(raw)) {
    if (!v || EXCLUDE_IDS.has(id)) continue;
    if (v.isMathFaculty !== true && !v.isMinor) continue;
    rows.push({ ...v, id: v.id ?? id });
  }
  return rows.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
})();

function CatalogRow({ entry }: { entry: ProgramEntry }) {
  const type = programType(entry);
  const nCourses = countCourses(entry);
  const title = displayTitle(entry);
  return (
    <div style={{
      background: '#ececec',
      borderRadius: '15px',
      padding: '14px 18px',
      marginBottom: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
    }}>
      <div style={{ fontFamily: SANS, fontSize: '18px', color: '#000' }}>{title}</div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '3px 10px', fontFamily: MONO, fontSize: '12px', whiteSpace: 'nowrap' }}>
          {type}
        </div>
        <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', whiteSpace: 'nowrap' }}>
          {nCourses > 0 ? `${nCourses} courses · ` : ''}{entry.faculty}
        </span>
      </div>
    </div>
  );
}

function CatalogScrollPane() {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    const SPEED = 0.4;

    function tick() {
      posRef.current += SPEED;
      const half = inner!.scrollHeight / 2;
      if (posRef.current >= half) posRef.current -= half;
      if (posRef.current < 0) posRef.current += half;
      inner!.style.transform = `translateY(-${posRef.current}px)`;
      rafRef.current = requestAnimationFrame(tick);
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      posRef.current += e.deltaY;
    }

    let touchY = 0;
    function onTouchStart(e: TouchEvent) { touchY = e.touches[0].clientY; }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const dy = touchY - e.touches[0].clientY;
      posRef.current += dy;
      touchY = e.touches[0].clientY;
    }

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  const doubled = [...allPrograms, ...allPrograms];

  return (
    <div ref={containerRef} style={{ overflow: 'hidden', height: '100%', padding: '24px 20px', boxSizing: 'border-box' }}>
      <div ref={innerRef} style={{ willChange: 'transform' }}>
        {doubled.map((entry, i) => (
          <CatalogRow key={`${entry.id}-${i}`} entry={entry} />
        ))}
      </div>
    </div>
  );
}

export default function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div style={{ height: '100dvh', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', boxSizing: 'border-box', gap: '24px' }}>
        <Logo size={36} tieSize={44} tieSideMargin="-8px" />
        <Tagline fontSize="15px" />
        <CtaButton onClick={onGetStarted} />
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}>
      {/* Left: scrolling catalog preview */}
      <div style={{ width: '45%', background: '#f5f5f5', overflow: 'hidden', position: 'relative' }}>
        {/* fade out top and bottom */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '80px', background: 'linear-gradient(to bottom, #f5f5f5, transparent)', zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '80px', background: 'linear-gradient(to top, #f5f5f5, transparent)', zIndex: 2, pointerEvents: 'none' }} />
        <CatalogScrollPane />
      </div>

      {/* Right: branding */}
      <div style={{ flex: 1, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '24px', padding: '48px' }}>
        <Logo size={64} tieSize={80} tieSideMargin="-14px" />
        <Tagline fontSize="18px" />
        <CtaButton onClick={onGetStarted} />
      </div>
    </div>
  );
}

function Logo({ size, tieSize, tieSideMargin }: { size: number; tieSize: number; tieSideMargin: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
      <span style={{ fontFamily: SANS, fontSize: `${size}px`, color: '#c60078', lineHeight: 1 }}>pink</span>
      <div style={{ margin: `0 ${tieSideMargin}`, flexShrink: 0 }}>
        <Image src="/logo-tie.png" alt="pink tie" width={tieSize} height={tieSize} style={{ objectFit: 'contain', display: 'block' }} />
      </div>
      <span style={{ fontFamily: SANS, fontSize: `${size}px`, color: '#c60078', lineHeight: 1 }}>tie</span>
      <span style={{ fontFamily: SANS, fontSize: `${size}px`, color: '#000', lineHeight: 1, marginLeft: size < 50 ? '8px' : '16px' }}>planner</span>
    </div>
  );
}

function Tagline({ fontSize }: { fontSize: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <p style={{ fontFamily: SANS, fontSize, color: '#858080', textAlign: 'center', margin: 0, fontWeight: 400 }}>
        designed for uw math students navigating 16 majors.
      </p>
      <p style={{ fontFamily: SANS, fontSize, color: '#858080', textAlign: 'center', margin: 0, fontWeight: 400 }}>
        what will you choose?
      </p>
    </div>
  );
}

function CtaButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ background: '#ececec', color: '#000', border: 'none', borderRadius: '40px', height: '52px', padding: '0 32px', fontFamily: SANS, fontSize: '18px', cursor: 'pointer', marginTop: '8px' }}
    >
      get started →
    </button>
  );
}
