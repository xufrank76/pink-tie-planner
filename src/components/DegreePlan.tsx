'use client';

import { useState } from 'react';
import { useApp } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';
import { satisfies, type ReqNode } from '@/src/lib/requirementEvaluator';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

const TERMS = [
  { label: 'F24 WT1', courses: ['CS135', 'MATH135', 'COMMST223', 'ECON101'], done: true },
  { label: 'W25 WT2', courses: ['MATH136', 'MATH137', 'CS136', 'STAT230'], done: true },
  { label: 'S25', courses: ['MATH235', 'CO250', 'PMATH336'], done: true },
  { label: '> W26', courses: ['MATH237', 'MATH239', 'STAT231', 'CLAS104', 'CO330'], active: true },
  { label: 'S26 WT2', courses: ['CO342', 'PMATH331', 'COMMST100 (OL)', '+'], planned: true },
  { label: 'F26', courses: ['CO442', 'CO351', 'PD11', '+'], planned: true, hasPD: true },
  { label: 'W27', courses: ['+', '+', '+', '+'], planned: true },
];

const programs = rawPrograms as Record<string, { name: string; requirements: ReqNode[] }>;

function nodeLabel(node: ReqNode): string {
  if (node.type === 'COURSE' && node.code) return node.code;
  const codes = (node.children ?? []).filter(c => c.type === 'COURSE' && c.code).map(c => c.code!);
  if (node.type === 'OR' && codes.length) return codes.join('/');
  if (node.type === 'N_OF' && codes.length) return `${node.n} of: ${codes.slice(0, 4).join(', ')}${codes.length > 4 ? '...' : ''}`;
  return node.text.replace(/ \(0\.50\)/g, '').slice(0, 55);
}

type Term = typeof TERMS[number];
type ReqItem = { text: string; done?: boolean; dim?: boolean; planned?: boolean; meta?: boolean };
type ReqGroup = { title: string; progress: string; items: ReqItem[]; col2: ReqItem[] };

function CourseChip({ code, active, done }: { code: string; active?: boolean; done?: boolean }) {
  if (code === '+') {
    return (
      <div
        style={{
          height: '52px',
          minWidth: '100px',
          borderRadius: '40px',
          border: '1px dashed #858080',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: MONO,
          fontSize: '18px',
          color: '#858080',
          padding: '0 16px',
        }}
      >
        +
      </div>
    );
  }
  const isPD = code.startsWith('PD');
  const filled = active || done || isPD;
  return (
    <div
      style={{
        height: '52px',
        borderRadius: '40px',
        background: filled ? '#000' : '#d9d9d9',
        color: filled ? '#fff' : '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: MONO,
        fontSize: '16px',
        padding: '0 18px',
        whiteSpace: 'nowrap',
      }}
    >
      {code}
    </div>
  );
}

function TermColumn({ term }: { term: Term }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '140px' }}>
      <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', marginBottom: '4px', whiteSpace: 'nowrap' }}>
        {term.label}
      </div>
      {term.courses.map((c, i) => (
        <CourseChip key={i} code={c} active={term.active} done={term.done} />
      ))}
    </div>
  );
}

function CheckBox({ done }: { done?: boolean }) {
  return (
    <div
      style={{
        width: '24px',
        height: '24px',
        borderRadius: '5px',
        background: done ? '#000' : '#d9d9d9',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {done && <span style={{ color: '#fff', fontSize: '14px' }}>✓</span>}
    </div>
  );
}

function ReqItem({ item }: { item: ReqItem }) {
  const color = item.dim ? 'rgba(133,128,128,0.5)' : item.planned ? '#858080' : '#000';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {!item.meta && <CheckBox done={item.done} />}
      <span style={{ fontFamily: SANS, fontSize: '18px', color }}>{item.text}</span>
    </div>
  );
}

function RequirementGroup({ group }: { group: ReqGroup }) {
  return (
    <div style={{ background: '#ececec', borderRadius: '15px', padding: '16px 20px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontFamily: SANS, fontSize: '20px', color: '#000' }}>{group.title}</div>
        <div
          style={{
            background: '#000',
            color: '#fff',
            borderRadius: '15px',
            padding: '6px 16px',
            fontFamily: SANS,
            fontSize: '18px',
            flexShrink: 0,
            marginLeft: '12px',
          }}
        >
          {group.progress}
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(133,128,128,0.4)', paddingTop: '12px', display: 'flex', gap: '40px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          {group.items.map((item, i) => (
            <ReqItem key={i} item={item} />
          ))}
        </div>
        {group.col2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
            {group.col2.map((item, i) => (
              <ReqItem key={i} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DegreePlan({ onNavigate }: { onNavigate: (id: import('./Sidebar').PageId) => void }) {
  const [view, setView] = useState<'timeline' | 'requirements'>('timeline');
  const { completedCourses, semesterPlans, program } = useApp();
  const completedSet = new Set(completedCourses);
  const planSet      = new Set([...completedCourses, ...Object.values(semesterPlans).flat()]);

  const progEntry = program.id ? programs[program.id] : null;
  const roots     = progEntry?.requirements ?? [];
  const topNodes: ReqNode[] = roots.length === 1 && roots[0].children ? roots[0].children : roots;

  const evaluatable = topNodes.filter(n => n.type !== 'ADDITIONAL');
  const additional  = topNodes.filter(n => n.type === 'ADDITIONAL');
  const doneCt      = evaluatable.filter(n => satisfies(n, completedSet)).length;

  const toItem = (n: ReqNode, dim = false): ReqItem => ({
    text:    nodeLabel(n),
    done:    satisfies(n, completedSet),
    planned: !satisfies(n, completedSet) && satisfies(n, planSet),
    dim,
  });

  const REQUIREMENT_GROUPS: ReqGroup[] = progEntry ? [{
    title:    `required for major: (${progEntry.name.replace(' (Bachelor of Mathematics - Honours)', '').replace(' (Bachelor of Mathematics)', '')})`,
    progress: `${doneCt}/${evaluatable.length}`,
    items:    evaluatable.map(n => toItem(n)),
    col2:     additional.map(n => toItem(n, true)),
  }] : [];

  const coursesDone = completedCourses.length;
  const coursesLeft = Math.max(0, 40 - coursesDone);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 48px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', lineHeight: 1, margin: 0, fontWeight: 400, animation: 'headingReveal 0.5s ease forwards' }}>
          your full<br />degree plan...
        </h1>
        <div style={{ background: '#d9d9d9', borderRadius: '40px', padding: '10px', display: 'inline-flex', flexShrink: 0 }}>
          {(['timeline', 'requirements'] as const).map((v) => (
            <div
              key={v}
              onClick={() => setView(v)}
              style={{
                borderRadius: '40px',
                padding: '0 24px',
                height: '58px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                background: view === v ? '#fff' : 'transparent',
                color: view === v ? '#000' : '#858080',
                fontFamily: SANS,
                fontSize: '20px',
                transition: 'background 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {v}
            </div>
          ))}
        </div>
      </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          {[{ v: String(coursesDone), l: 'COURSES DONE' }, { v: String(coursesLeft), l: 'COURSES LEFT' }, { v: 'F29', l: 'GRAD TARGET' }].map((s) => (
            <div
              key={s.l}
              style={{
                flex: 1,
                background: '#d9d9d9',
                borderRadius: '15px',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <div style={{ fontFamily: SANS, fontSize: '40px', color: '#000', lineHeight: 1, fontWeight: 400 }}>{s.v}</div>
              <div style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.l}</div>
            </div>
          ))}
        </div>
        {view === 'timeline' ? (
          <>
            <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
              TERM-BY-TERM
            </div>
            <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px' }}>
              {TERMS.map((t) => (
                <TermColumn key={t.label} term={t} />
              ))}
            </div>
            {/* Conflict warning */}
            <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  background: '#c60078',
                  borderRadius: '3px',
                  width: '24px',
                  height: '22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ color: '#fff', fontFamily: MONO, fontSize: '12px', fontWeight: 700 }}>!</span>
              </div>
              <span style={{ fontFamily: SANS, fontSize: '15px', color: '#858080' }}>
                CO342 prerequisite not yet complete when planned in S26
              </span>
            </div>
          </>
        ) : (
          <>
            {REQUIREMENT_GROUPS.map((g, i) => (
              <RequirementGroup key={i} group={g} />
            ))}
          </>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button
            onClick={() => onNavigate('coming-soon')}
            style={{
              background: '#d9d9d9',
              border: 'none',
              borderRadius: '40px',
              height: '58px',
              padding: '0 35px',
              fontFamily: SANS,
              fontSize: '20px',
              cursor: 'pointer',
              color: '#000',
            }}
          >
            view all plans
          </button>
        </div>
    </div>
  );
}
