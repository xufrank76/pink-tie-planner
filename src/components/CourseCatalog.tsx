'use client';

import { useState } from 'react';
import { useApp } from '@/src/context/AppContext';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

type CourseStatus = 'done' | 'planned' | 'add';

interface Course {
  code: string;
  name: string;
  req: string;
  prereqs: string;
  offered: string;
  desc: string;
}

const COURSES: Course[] = [
  {
    code: 'CO442', name: 'Graph Theory', req: 'Major requirements',
    prereqs: 'MATH235 ✓  CO342 ✕', offered: 'F · W',
    desc: "Connectivity (Menger's theorem, ear decomposition, and Tutte's wheels theorem) and matchings (Hall's and Tutte's theorem). Flows: integer and group-valued flows, the flow polynomial. Ramsey theory. Probabilistic methods.",
  },
  {
    code: 'MATH135', name: 'Algebra for Honours Math', req: 'Core BMath',
    prereqs: '', offered: 'F · W · S',
    desc: 'An introduction to the language of mathematics and proof techniques through a study of the basic algebraic systems of mathematics: the integers, the integers modulo n, the rational numbers, the real numbers, the complex numbers and polynomials.',
  },
  {
    code: 'AMATH353', name: 'Partial Differential Equations 1', req: '2 add. 300/400 MATH',
    prereqs: 'AMATH250 ✕  AMATH231 ✕', offered: 'W · S',
    desc: 'Second order linear PDEs — the diffusion equation, wave equation, and Laplace equation. Solution techniques: separation of variables, Fourier series and integrals, method of characteristics.',
  },
  {
    code: 'PMATH331', name: 'Applied Real Analysis', req: 'Major requirements',
    prereqs: 'MATH235 ✓', offered: 'F',
    desc: 'Metric spaces: open and closed sets, compactness, completeness. Continuity and uniform continuity. Sequences and series of functions, uniform convergence.',
  },
  {
    code: 'CO250', name: 'Introduction to Optimization', req: 'Major requirements',
    prereqs: 'MATH136 ✓', offered: 'F · W · S',
    desc: 'Introduction to linear programming including duality and complementary slackness. Network flow problems, algorithms, and applications. Integer programming: branch and bound, cutting planes.',
  },
  {
    code: 'CS246', name: 'Object-Oriented Software Dev.', req: 'Core BMath',
    prereqs: 'CS136 ✓', offered: 'F · W · S',
    desc: 'Introduction to object-oriented programming and to tools and techniques for software development. Designing, coding, debugging, testing, and documenting medium-sized programs.',
  },
  {
    code: 'STAT231', name: 'Statistics', req: 'Core BMath',
    prereqs: 'STAT230 ✓', offered: 'W · S',
    desc: 'Empirical problem solving, sampling distributions, likelihood function, maximum likelihood estimation, confidence intervals, hypothesis testing, Bayesian inference.',
  },
];

const DEGREE_PLANS = [
  { name: 'Combinatorics and Optimization', desc: 'BMath (Honours)', reqs: '40 courses · 3 streams' },
  { name: 'Pure Mathematics', desc: 'BMath (Honours)', reqs: '38 courses' },
  { name: 'Applied Mathematics', desc: 'BMath (Honours)', reqs: '38 courses' },
  { name: 'Statistics', desc: 'BMath (Honours)', reqs: '36 courses' },
  { name: 'Computer Science', desc: 'BMath (Honours) Double Degree', reqs: '58 courses' },
];

const STATUS_PILL: Record<CourseStatus, { bg: string; color: string; label: string }> = {
  done:    { bg: '#858080',                color: '#fff',    label: 'done ✓' },
  planned: { bg: 'rgba(133,128,128,0.24)', color: '#858080', label: 'planned' },
  add:     { bg: '#000',                   color: '#fff',    label: '+ add' },
};

function CourseRow({ course, status, isFavorited, isSelected, onToggleFavorite, onClick }: {
  course: Course;
  status: CourseStatus;
  isFavorited: boolean;
  isSelected: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
}) {
  const pill = STATUS_PILL[status];
  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? '#d9d9d9' : '#ececec',
        borderRadius: '15px',
        padding: '14px 18px',
        cursor: 'pointer',
        marginBottom: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', flex: 1 }}>
        <div style={{ fontFamily: SANS, fontSize: '18px', color: '#000' }}>
          <span style={{ fontFamily: MONO }}>{course.code}</span>
          {' '}{course.name}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
          <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '3px 10px', fontFamily: MONO, fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {course.req}
          </div>
          {course.prereqs && (
            <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {course.prereqs}
            </span>
          )}
          <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {course.offered}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill={isFavorited ? '#e0002b' : 'none'}
          stroke={isFavorited ? '#e0002b' : '#858080'}
          strokeWidth={1.8}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          style={{ cursor: 'pointer', flexShrink: 0, transition: 'fill 0.15s, stroke 0.15s' }}
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        <div style={{ background: pill.bg, color: pill.color, borderRadius: '15px', padding: '6px 14px', fontFamily: SANS, fontSize: '14px' }}>
          {pill.label}
        </div>
      </div>
    </div>
  );
}

function CourseDetail({ course }: { course: Course }) {
  const { addCourseToTerm, removeCourseFromTerm, semesterPlans } = useApp();
  const [selectedTerm, setSelectedTerm] = useState('W26');
  const sections = [
    { section: 'LEC 001', cls: '6204', enrolled: '8/10',  time: '2:30–3:50 PM',   days: 'M W F' },
    { section: 'LEC 002', cls: '6205', enrolled: '10/10', time: '11:30–12:50 PM', days: 'T Th' },
  ];

  const isInTerm = (term: string) => (semesterPlans[term] ?? []).includes(course.code);

  return (
    <div style={{ width: '420px', minWidth: '420px', borderLeft: '1px solid #858080', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
        <div style={{ fontFamily: MONO, fontSize: '20px', color: '#000' }}>{course.code}</div>
        <div style={{ fontFamily: SANS, fontSize: '28px', color: '#000', lineHeight: 1.1, fontWeight: 400 }}>{course.name}</div>

        <div>
          <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', marginBottom: '6px' }}>DESCRIPTION</div>
          <div style={{ fontFamily: SANS, fontSize: '15px', color: '#858080', lineHeight: 1.5 }}>{course.desc}</div>
        </div>

        <div>
          <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', marginBottom: '6px' }}>PREREQUISITES</div>
          <div style={{ fontFamily: MONO, fontSize: '15px', color: '#000' }}>{course.prereqs || 'none'}</div>
        </div>

        <div>
          <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', marginBottom: '6px' }}>OFFERED</div>
          <div style={{ fontFamily: MONO, fontSize: '15px', color: '#000' }}>{course.offered}</div>
        </div>

        <div style={{ borderTop: '1px solid #858080', paddingTop: '14px' }}>
          <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', marginBottom: '10px' }}>COURSE SCHEDULE</div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {['W26', 'S26', 'F26'].map((t) => (
              <div key={t} onClick={() => setSelectedTerm(t)} style={{ background: selectedTerm === t ? '#000' : '#ececec', color: selectedTerm === t ? '#fff' : '#858080', borderRadius: '15px', padding: '5px 14px', fontFamily: MONO, fontSize: '15px', cursor: 'pointer' }}>
                {t}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', marginBottom: '6px' }}>
            <span style={{ flex: '0 0 70px' }}>SECTION</span>
            <span style={{ flex: '0 0 52px' }}>CLASS</span>
            <span style={{ flex: '0 0 52px' }}>ENROLLED</span>
            <span style={{ flex: 1 }}>TIME</span>
          </div>
          <div style={{ borderTop: '1px solid #858080', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sections.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', fontFamily: MONO, fontSize: '15px', color: '#000', alignItems: 'center' }}>
                <span style={{ flex: '0 0 70px' }}>{s.section}</span>
                <span style={{ flex: '0 0 52px' }}>{s.cls}</span>
                <span style={{ flex: '0 0 52px' }}>{s.enrolled}</span>
                <span style={{ flex: 1 }}>{s.time}</span>
                <span style={{ fontFamily: SANS, fontSize: '15px', color: '#858080' }}>{s.days}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #858080', paddingTop: '14px' }}>
          <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', marginBottom: '10px' }}>ADD TO PLAN</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['W26', 'S26', 'F26'].map((t) => (
              <div
                key={t}
                onClick={() => isInTerm(t) ? removeCourseFromTerm(t, course.code) : addCourseToTerm(t, course.code)}
                style={{
                  background: isInTerm(t) ? '#858080' : t === 'W26' ? '#000' : '#ececec',
                  color: isInTerm(t) || t === 'W26' ? '#fff' : '#858080',
                  borderRadius: '15px',
                  padding: '7px 16px',
                  fontFamily: MONO,
                  fontSize: '15px',
                  cursor: 'pointer',
                }}
              >
                {isInTerm(t) ? `✓ ${t}` : t === 'W26' ? `+ add to ${t}` : t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DegreePlanRow({ plan }: { plan: typeof DEGREE_PLANS[number] }) {
  return (
    <div style={{ background: '#ececec', borderRadius: '15px', padding: '16px 20px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
      <div>
        <div style={{ fontFamily: SANS, fontSize: '20px', color: '#000' }}>{plan.name}</div>
        <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', marginTop: '4px' }}>{plan.desc} · {plan.reqs}</div>
      </div>
      <span style={{ fontFamily: MONO, fontSize: '20px', color: '#858080' }}>→</span>
    </div>
  );
}

export default function CourseCatalog() {
  const { completedCourses, semesterPlans, favoriteCourses, toggleFavorite } = useApp();
  const [catalogView, setCatalogView] = useState<'courses' | 'degree plans'>('courses');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [search, setSearch] = useState('');

  const completedSet = new Set(completedCourses);
  const plannedSet = new Set(Object.values(semesterPlans).flat());

  const getStatus = (code: string): CourseStatus => {
    if (completedSet.has(code)) return 'done';
    if (plannedSet.has(code)) return 'planned';
    return 'add';
  };

  const filtered = COURSES.filter(
    (c) =>
      !search ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.req.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '32px 48px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0 }}>
        <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', lineHeight: 1, margin: 0, fontWeight: 400, animation: 'headingReveal 0.5s ease forwards' }}>
          course catalog...
        </h1>
        <div style={{ background: '#d9d9d9', borderRadius: '40px', padding: '10px', display: 'flex', marginBottom: '4px', flexShrink: 0 }}>
          {(['courses', 'degree plans'] as const).map((v) => (
            <div
              key={v}
              onClick={() => { setCatalogView(v); setSelectedCourse(null); }}
              style={{
                borderRadius: '40px',
                padding: '0 24px',
                height: '58px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                background: catalogView === v ? '#fff' : 'transparent',
                color: catalogView === v ? '#000' : '#858080',
                fontFamily: SANS,
                fontSize: '20px',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s',
              }}
            >
              {v}
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      {catalogView === 'courses' && (
        <div style={{ padding: '14px 48px', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: '1px solid #858080', flexShrink: 0, flexWrap: 'wrap' }}>
          {['subject', 'level', 'term', 'status'].map((f) => (
            <div key={f} style={{ background: '#d9d9d9', borderRadius: '15px', padding: '8px 16px', fontFamily: SANS, fontSize: '16px', color: '#858080', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {f} <span style={{ fontFamily: MONO, fontSize: '12px' }}>▾</span>
            </div>
          ))}
          <div style={{ background: '#d9d9d9', borderRadius: '15px', padding: '8px 20px', flex: 1, minWidth: '200px' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="⌕ search courses, subjects, professors..."
              style={{ border: 'none', background: 'transparent', fontFamily: SANS, fontSize: '16px', color: '#858080', outline: 'none', width: '100%' }}
            />
          </div>
        </div>
      )}

      {catalogView === 'degree plans' && (
        <div style={{ padding: '14px 48px', borderBottom: '1px solid #858080', flexShrink: 0 }}>
          <div style={{ background: '#d9d9d9', borderRadius: '15px', padding: '8px 20px', display: 'inline-flex', minWidth: '320px' }}>
            <input
              placeholder="⌕ search bmath programs and plans..."
              style={{ border: 'none', background: 'transparent', fontFamily: SANS, fontSize: '16px', color: '#858080', outline: 'none', width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '16px 48px', overflowY: 'auto' }}>
          {catalogView === 'courses'
            ? filtered.map((c) => (
                <CourseRow
                  key={c.code}
                  course={c}
                  status={getStatus(c.code)}
                  isFavorited={favoriteCourses.includes(c.code)}
                  isSelected={selectedCourse?.code === c.code}
                  onToggleFavorite={() => toggleFavorite(c.code)}
                  onClick={() => setSelectedCourse(selectedCourse?.code === c.code ? null : c)}
                />
              ))
            : DEGREE_PLANS.map((p, i) => <DegreePlanRow key={i} plan={p} />)
          }
        </div>
        {selectedCourse && catalogView === 'courses' && (
          <CourseDetail course={selectedCourse} />
        )}
      </div>
    </div>
  );
}
