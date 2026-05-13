'use client';

import type { PageId } from './Sidebar';
import { useApp } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';
import { nodeProgress, type ReqNode } from '@/src/lib/requirementEvaluator';
import { getCurrentTerm } from '@/src/lib/termUtils';
import { getStudyLabel } from '@/src/data/coopSequences';

const programs = rawPrograms as Record<string, { name: string; requirements: ReqNode[] }>;

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

const CURRENT_TERM = getCurrentTerm();

const MATH_FACULTY_SUBJECTS = new Set([
  'ACTSC','AMATH','CO','CS','MATBUS','MATH','PMATH','STAT',
]);

// 0-credit administrative courses that shouldn't count as electives
const ZERO_CREDIT_COURSES = new Set(['MTHEL99']);

function isNonMathElective(code: string): boolean {
  if (code.startsWith('PD')) return false;
  if (ZERO_CREDIT_COURSES.has(code)) return false;
  const subject = code.match(/^([A-Z]+)/)?.[1] ?? '';
  return !MATH_FACULTY_SUBJECTS.has(subject);
}

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

  function sumProgress(nodes: ReqNode[]) {
    let done = 0, total = 0;
    for (const n of nodes) {
      if (n.type === 'ADDITIONAL') { total += n.n ?? 1; }
      else { const p = nodeProgress(n, completedSet); done += p.done; total += p.total; }
    }
    return { done, total: total || 1 };
  }

  const progEntry = program.id ? programs[program.id] : null;
  const isMathStudies = progEntry?.name.includes('Mathematical Studies') ?? false;
  const coreEntry = programs[isMathStudies ? 'core-bmath-mathstudies' : 'core-bmath'];
  const coreNodes: ReqNode[] = coreEntry?.requirements[0]?.children ?? [];
  const { done: coreDone, total: coreTotal } = sumProgress(coreNodes);
  function entryProgress(id: string) {
    const entry = programs[id];
    if (!entry) return null;
    const roots = entry.requirements;
    const nodes: ReqNode[] = roots.length === 1 && roots[0].children ? roots[0].children : roots;
    return sumProgress(nodes);
  }

  const majorCandidates = [
    ...(program.id ? [{ id: program.id, name: program.major }] : []),
    ...(program.doubleMajorId ? [{ id: program.doubleMajorId, name: program.doubleMajor! }] : []),
    ...program.extras.filter(e => e.type === 'major' || e.type === 'joint').map(e => ({ id: e.id, name: e.name })),
  ];
  const multiMajor = majorCandidates.length > 1;
  const majorRows = majorCandidates
    .map(({ id, name }) => {
      const p = entryProgress(id);
      if (!p) return null;
      return { name: multiMajor ? name : 'Major', current: p.done, max: p.total };
    })
    .filter((r): r is { name: string; current: number; max: number } => r !== null);

  const minorEntry = program.minorId ? programs[program.minorId] : null;
  const minorProgress = minorEntry ? entryProgress(program.minorId!) : null;

  const specRows = program.extras
    .filter(e => e.type === 'specialization')
    .map(e => {
      const p = entryProgress(e.id);
      if (!p) return null;
      return { name: e.name, current: p.done, max: p.total };
    })
    .filter((r): r is { name: string; current: number; max: number } => r !== null);

  const pdDone = completedCourses.filter(c => c.startsWith('PD')).length;
  const isCoop = program.coopStream !== null && program.coopStream !== 'none';

  const PROGRESS_ROWS = [
    ...(progEntry ? [{ name: 'Core BMath', current: coreDone, max: coreTotal }] : []),
    ...majorRows,
    ...(minorProgress ? [{ name: 'Minor', current: minorProgress.done, max: minorProgress.total }] : []),
    ...specRows,
    { name: 'Electives', current: Math.min(completedCourses.filter(isNonMathElective).length, 10), max: 10 },
    ...(isCoop ? [{ name: 'PD courses', current: Math.min(pdDone, 5), max: 5 }] : []),
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
            DEGREE DONE: {totalDone}/40
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
