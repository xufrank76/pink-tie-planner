'use client';

import type { PageId } from './Sidebar';
import { useApp } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';
import { satisfies, type ReqNode } from '@/src/lib/requirementEvaluator';

const programs = rawPrograms as Record<string, { name: string; requirements: ReqNode[] }>;

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

const CURRENT_TERM = 'W26';

const CORE_BMATH_CODES = new Set([
  'CS115','CS135','CS145','CS116','CS136','CS136L','CS146','CS246',
  'MATH106','MATH135','MATH136','MATH146',
  'MATH127','MATH137','MATH147',
  'MATH128','MATH138','MATH148',
  'MATH235','MATH245','MATH237','MATH247','MATH239','MATH249',
  'STAT230','STAT240','CO250','CO255',
  'COMMST100','COMMST223','ENGL109',
]);


const MINOR_CODES = new Set([
  'CS115','CS135','CS145','CS116','CS136','CS136L','CS146',
  'CS246','CS341','CS370',
]);

const ELECTIVE_CODES = new Set([
  'ECON101','ECON102','CLAS104',
  'COMMST223','ENGL109','PHIL145',
]);

function ProgressRow({ name, current, max }: { name: string; current: number; max: number }) {
  const pct = Math.min(100, Math.round((current / max) * 100));
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontFamily: SANS, fontSize: '20px', color: '#000' }}>{name}</span>
        <span style={{ fontFamily: MONO, fontSize: '15px', color: '#858080' }}>{current}/{max}</span>
      </div>
      <div style={{ background: '#d9d9d9', height: '8px', width: '100%' }}>
        <div style={{ background: '#000', height: '8px', width: `${pct}%` }} />
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
  const { semesterPlans, completedCourses, program } = useApp();
  const thisTermCourses = semesterPlans[CURRENT_TERM] ?? [];
  const totalDone = completedCourses.length;
  const completedSet = new Set(completedCourses);

  const count = (set: Set<string>) => completedCourses.filter(c => set.has(c)).length;

  const progEntry = program.id ? programs[program.id] : null;
  const roots     = progEntry?.requirements ?? [];
  const topNodes: ReqNode[] = roots.length === 1 && roots[0].children ? roots[0].children : roots;
  const evaluatable = topNodes.filter(n => n.type !== 'ADDITIONAL');
  const majorDone  = evaluatable.filter(n => satisfies(n, completedSet)).length;
  const majorTotal = evaluatable.length || 1;

  const PROGRESS_ROWS = [
    { name: 'Core BMath', current: Math.min(count(CORE_BMATH_CODES), 16), max: 16 },
    { name: 'Major',      current: majorDone,                              max: majorTotal },
    { name: 'Minor',      current: Math.min(count(MINOR_CODES),        8), max: 8  },
    { name: 'Electives',  current: Math.min(count(ELECTIVE_CODES),    10), max: 10 },
  ];

  return (
    <div style={{ flex: 1, padding: '32px 48px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* Row 1: heading + grouped 29% / DEGREE DONE */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '48px', marginBottom: '16px' }}>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', lineHeight: 1, margin: 0, fontWeight: 400, animation: 'headingReveal 0.5s ease forwards' }}>
            your progress...
          </h1>
          <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            DEGREE REQUIREMENTS
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: SANS, fontSize: '200px', color: '#000', lineHeight: 0.9, letterSpacing: '-4px', fontWeight: 400 }}>
            {totalDone > 0 ? `${Math.round((totalDone / 40) * 100)}%` : '0%'}
          </div>
          <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '6px' }}>
            DEGREE DONE
          </div>
        </div>
      </div>

      {/* Progress bars */}
      {PROGRESS_ROWS.map((r) => (
        <ProgressRow key={r.name} {...r} />
      ))}

      {/* This semester */}
      <div style={{ marginTop: '24px' }}>
        <div style={{ marginBottom: '10px' }}>
          <span style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            THIS SEMESTER - W26
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
