'use client';

import { useMemo, useRef, useState } from 'react';
import type { PageId } from './Sidebar';
import { useApp } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';
import { computeDegreeHeadlineMetrics } from '@/src/lib/degreeHeadlineProgress';
import type { ReqNode } from '@/src/lib/requirementEvaluator';
import { getCurrentTerm } from '@/src/lib/termUtils';
import { getStudyLabel } from '@/src/data/coopSequences';

const programs = rawPrograms as Record<string, { name: string; requirements: ReqNode[] }>;

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

const CURRENT_TERM = getCurrentTerm();

function ProgressRow({ name, current, max }: {
  name: string; current: number; max: number;
}) {
  const pct = Math.min(100, Math.round((current / max) * 100));
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontFamily: SANS, fontSize: '20px', color: '#000' }}>{name}</span>
        <span style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', cursor: 'default' }}>{current}/{max}</span>
      </div>
      <div style={{ background: '#d9d9d9', height: '8px', width: '100%' }}>
        <div style={{ background: '#000', height: '8px', width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TooltipButton({ planned, total }: { planned: number; total: number }) {
  const [pos, setPos] = useState<{ left: number; right: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        onMouseEnter={() => {
          if (!ref.current) return;
          const r = ref.current.getBoundingClientRect();
          setPos({ left: r.left, right: r.right, y: r.bottom });
        }}
        onMouseLeave={() => setPos(null)}
        style={{
          width: '18px', height: '18px', borderRadius: '50%',
          background: '#d9d9d9', border: 'none', cursor: 'pointer',
          fontFamily: MONO, fontSize: '11px', color: '#858080',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, lineHeight: 1, padding: 0,
        }}
      >?</button>
      {pos && (
        <div style={{
          position: 'fixed',
          ...(pos.right > window.innerWidth / 2
            ? { right: window.innerWidth - pos.right }
            : { left: pos.left }),
          top: pos.y + 6,
          background: '#000', color: '#fff', borderRadius: '10px',
          padding: '10px 14px', zIndex: 9999, whiteSpace: 'nowrap',
          fontFamily: SANS, fontSize: '12px', lineHeight: 1.8,
          pointerEvents: 'none', textTransform: 'none',
        }}>
          <div><span style={{ color: '#858080' }}>numerator: </span>{planned} — unique requirement slots filled, counting shared courses once, not including pd or labs</div>
          <div><span style={{ color: '#858080' }}>denominator: </span>{total} — core bmath + major + non-math electives, counting shared courses once, not including pd or labs</div>
        </div>
      )}
    </>
  );
}

function DegreePctBlock({ pct, planned, total }: { pct: number; planned: number; total: number }) {
  return (
    <div style={{ flexShrink: 0 }}>
      <div style={{ fontFamily: SANS, fontSize: '200px', color: '#000', lineHeight: 0.9, letterSpacing: '-4px', fontWeight: 400 }}>
        {pct}%
      </div>
      <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        DEGREE PLANNED: {planned}/{total}
        <TooltipButton planned={planned} total={total} />
      </div>
    </div>
  );
}

function CourseChip({ code }: { code: string }) {
  return (
    <div
      style={{
        background: '#000',
        color: '#fff',
        borderRadius: '40px',
        padding: '0 22px',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        fontFamily: MONO,
        fontSize: '18px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {code}
    </div>
  );
}

export default function Dashboard({ onNavigate }: { onNavigate: (id: PageId) => void }) {
  const { semesterPlans, completedCourses, effectiveProgram: program } = useApp();
  const thisTermCourses = semesterPlans[CURRENT_TERM] ?? [];

  const { progressRows, degreePlannedSum, degreeTotalSlots, degreePct, hasDegreeMetric } = useMemo(
    () => computeDegreeHeadlineMetrics(programs, program, completedCourses, semesterPlans),
    [completedCourses, semesterPlans, program],
  );

  return (
    <div style={{ flex: 1, padding: '32px 48px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* Row 1: heading + grouped % / DEGREE PLANNED */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '48px', marginBottom: '16px' }}>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', lineHeight: 1, margin: 0, fontWeight: 400, animation: 'headingReveal 0.5s ease forwards' }}>
            your progress...
          </h1>
          <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            DEGREE REQUIREMENTS
          </div>
        </div>
        <DegreePctBlock pct={hasDegreeMetric ? degreePct : 0} planned={degreePlannedSum} total={degreeTotalSlots} />
      </div>

      {/* Progress bars */}
      {progressRows.map((r, i) => (
        <ProgressRow key={`${r.name}-${i}`} {...r} />
      ))}

      {/* This semester */}
      <div style={{ marginTop: '24px' }}>
        <div style={{ marginBottom: '10px' }}>
          <span style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            THIS SEMESTER - {CURRENT_TERM}{(() => { const sl = program.coopStream && program.startTerm ? getStudyLabel(CURRENT_TERM, program.startTerm, program.coopStream) : null; return sl ? ` (${sl})` : ''; })()}
          </span>
        </div>
        <div style={{ background: '#d9d9d9', borderRadius: '20px', padding: '20px 16px', position: 'relative', minHeight: '90px', display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {thisTermCourses.length > 0
              ? thisTermCourses.map((c: string) => <CourseChip key={c} code={c} />)
              : <span style={{ fontFamily: MONO, fontSize: '15px', color: '#858080' }}>no courses planned yet</span>
            }
          </div>
          <span style={{ position: 'absolute', bottom: '12px', right: '16px', fontFamily: MONO, fontSize: '15px', color: '#858080' }}>{thisTermCourses.length}/5 courses</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '28px', flexWrap: 'wrap' }}>
        <button
          onClick={() => onNavigate('semester-planner')}
          style={{
            background: '#d9d9d9',
            color: '#000',
            border: 'none',
            borderRadius: '40px',
            height: '58px',
            padding: '0 35px',
            fontFamily: SANS,
            fontSize: '20px',
            cursor: 'pointer',
          }}
        >
          plan semester
        </button>
        <button
          onClick={() => onNavigate('degree-plan')}
          style={{
            background: '#d9d9d9',
            color: '#000',
            border: 'none',
            borderRadius: '40px',
            height: '58px',
            padding: '0 35px',
            fontFamily: SANS,
            fontSize: '20px',
            cursor: 'pointer',
          }}
        >
          view full degree
        </button>
      </div>

    </div>
  );
}
