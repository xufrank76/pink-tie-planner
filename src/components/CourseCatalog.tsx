'use client';

import { useState, useMemo } from 'react';
import { useApp, type CourseInfo } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';
import { courseCodes } from '@/src/lib/requirementEvaluator';
import type { ReqNode } from '@/src/lib/requirementEvaluator';
import { getCurrentTerm } from '@/src/lib/termUtils';
const programs = rawPrograms as Record<string, { name: string; requirements: ReqNode[] }>;

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

type CourseStatus = 'done' | 'planned' | 'available';

const MATH_FACULTY_SUBJECTS = new Set(['ACTSC','AMATH','CO','CS','MATBUS','MATH','PMATH','STAT']);

function getSubject(code: string) {
  return code.match(/^([A-Z]+)/)?.[1] ?? '';
}

function offeredLabel(offered: string[]) {
  return offered.join(' · ') || '—';
}

function CourseRow({ course, status, req, isFavorited, isSelected, onToggleFavorite, onClick }: {
  course: CourseInfo;
  status: CourseStatus;
  req: string;
  isFavorited: boolean;
  isSelected: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
}) {
  const pill = status === 'done'
    ? { bg: '#858080', color: '#fff', label: 'done ✓' }
    : status === 'planned'
      ? { bg: 'rgba(133,128,128,0.24)', color: '#858080', label: 'planned' }
      : { bg: '#000', color: '#fff', label: '+ add' };

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: '18px', color: '#000' }}>
          <span style={{ fontFamily: MONO }}>{course.code}</span>
          {' '}{course.name}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
          <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '3px 10px', fontFamily: MONO, fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {req}
          </div>
          {course.prereqs && (
            <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {course.prereqs}
            </span>
          )}
          <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {offeredLabel(course.offered)}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
        <svg
          width={22} height={22} viewBox="0 0 24 24"
          fill={isFavorited ? '#e0002b' : 'none'}
          stroke={isFavorited ? '#e0002b' : '#858080'}
          strokeWidth={1.8}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          style={{ cursor: 'pointer', flexShrink: 0, transition: 'fill 0.15s, stroke 0.15s' }}
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
        <div style={{ background: pill.bg, color: pill.color, borderRadius: '15px', padding: '6px 14px', fontFamily: SANS, fontSize: '14px', whiteSpace: 'nowrap' }}>
          {pill.label}
        </div>
      </div>
    </div>
  );
}

function CourseDetail({ course, req, currentTerm }: { course: CourseInfo; req: string; currentTerm: string }) {
  const { addCourseToTerm, removeCourseFromTerm, semesterPlans } = useApp();
  const nextTerms = useMemo(() => {
    const seasons: Record<string, number> = { F: 0, W: 1, S: 2 };
    const [, yy] = currentTerm.match(/^([WFS])(\d{2})$/) ?? [];
    const curSeason = currentTerm[0];
    // Generate next 3 upcoming terms
    const all: string[] = [];
    let s = curSeason, y = parseInt(yy ?? '26');
    for (let i = 0; i < 6 && all.length < 3; i++) {
      const next = s === 'F' ? 'W' : s === 'W' ? 'S' : 'F';
      const ny = s === 'F' ? y + 1 : y;
      s = next; y = ny;
      const code = `${s}${String(y).padStart(2, '0')}`;
      if (course.offered.includes(s)) all.push(code);
    }
    return all;
  }, [course, currentTerm]);

  const isInTerm = (term: string) => (semesterPlans[term] ?? []).includes(course.code);

  return (
    <div style={{ width: '400px', minWidth: '400px', borderLeft: '1px solid #d9d9d9', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', marginBottom: '4px' }}>{req}</div>
          <div style={{ fontFamily: MONO, fontSize: '22px', color: '#000' }}>{course.code}</div>
          <div style={{ fontFamily: SANS, fontSize: '24px', color: '#000', lineHeight: 1.2, fontWeight: 400, marginTop: '4px' }}>{course.name}</div>
        </div>

        {course.description && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Description</div>
            <div style={{ fontFamily: SANS, fontSize: '14px', color: '#858080', lineHeight: 1.6 }}>{course.description}</div>
          </div>
        )}

        {course.prereqs && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Prerequisites</div>
            <div style={{ fontFamily: MONO, fontSize: '14px', color: '#000' }}>{course.prereqs}</div>
          </div>
        )}

        {course.antireqs && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Antirequisites</div>
            <div style={{ fontFamily: MONO, fontSize: '14px', color: '#858080' }}>{course.antireqs}</div>
          </div>
        )}

        <div>
          <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Offered</div>
          <div style={{ fontFamily: MONO, fontSize: '14px', color: '#000' }}>{offeredLabel(course.offered)}</div>
        </div>

        {nextTerms.length > 0 && (
          <div style={{ borderTop: '1px solid #d9d9d9', paddingTop: '16px' }}>
            <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Add to plan</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {nextTerms.map(t => (
                <div
                  key={t}
                  onClick={() => isInTerm(t) ? removeCourseFromTerm(t, course.code) : addCourseToTerm(t, course.code)}
                  style={{
                    background: isInTerm(t) ? '#858080' : '#000',
                    color: '#fff',
                    borderRadius: '15px',
                    padding: '7px 16px',
                    fontFamily: MONO,
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  {isInTerm(t) ? `✓ ${t}` : `+ ${t}`}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CURRENT_TERM = getCurrentTerm();

export default function CourseCatalog() {
  const { completedCourses, semesterPlans, favoriteCourses, toggleFavorite, courses, coursesStatus, program } = useApp();
  const [selectedCourse, setSelectedCourse] = useState<CourseInfo | null>(null);
  const [search, setSearch] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'done' | 'planned' | 'available'>('');

  const completedSet = useMemo(() => new Set(completedCourses), [completedCourses]);
  const plannedSet = useMemo(() => new Set(Object.values(semesterPlans).flat()), [semesterPlans]);

  // Build a set of course codes that appear in the user's program requirements
  const programCourseCodes = useMemo(() => {
    const ids = [program.id, program.doubleMajorId, program.minorId, ...program.extras.map(e => e.id)].filter(Boolean) as string[];
    const set = new Set<string>();
    for (const id of ids) {
      const entry = programs[id];
      if (entry) entry.requirements.forEach(r => courseCodes(r).forEach(c => set.add(c)));
    }
    return set;
  }, [program]);

  const getReq = (code: string): string => {
    if (programCourseCodes.has(code)) return 'Required';
    const subj = getSubject(code);
    if (MATH_FACULTY_SUBJECTS.has(subj)) return 'Math elective';
    return 'Non-math elective';
  };

  const getStatus = (code: string): CourseStatus => {
    if (completedSet.has(code)) return 'done';
    if (plannedSet.has(code)) return 'planned';
    return 'available';
  };

  const subjects = useMemo(() => {
    const s = new Set(courses.map(c => getSubject(c.code)));
    return [...s].sort();
  }, [courses]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return courses.filter(c => {
      if (filterSubject && getSubject(c.code) !== filterSubject) return false;
      if (filterStatus && getStatus(c.code) !== filterStatus) return false;
      if (q && !c.code.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, search, filterSubject, filterStatus, completedSet, plannedSet]);

  const selectedReq = selectedCourse ? getReq(selectedCourse.code) : '';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '32px 48px 0', flexShrink: 0 }}>
        <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', lineHeight: 1, margin: 0, fontWeight: 400, animation: 'headingReveal 0.5s ease forwards' }}>
          course catalog...
        </h1>
      </div>

      {/* Filter bar */}
      <div style={{ padding: '14px 48px', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: '1px solid #d9d9d9', flexShrink: 0, flexWrap: 'wrap' }}>
        <select
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value)}
          style={{ background: '#ececec', border: 'none', borderRadius: '15px', padding: '8px 16px', fontFamily: SANS, fontSize: '15px', color: filterSubject ? '#000' : '#858080', cursor: 'pointer', outline: 'none' }}
        >
          <option value="">all subjects</option>
          {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
          style={{ background: '#ececec', border: 'none', borderRadius: '15px', padding: '8px 16px', fontFamily: SANS, fontSize: '15px', color: filterStatus ? '#000' : '#858080', cursor: 'pointer', outline: 'none' }}
        >
          <option value="">all status</option>
          <option value="done">done</option>
          <option value="planned">planned</option>
          <option value="available">available</option>
        </select>
        <div style={{ background: '#ececec', borderRadius: '15px', padding: '8px 20px', flex: 1, minWidth: '200px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={coursesStatus === 'loading' ? 'loading courses...' : '⌕  search courses...'}
            style={{ border: 'none', background: 'transparent', fontFamily: SANS, fontSize: '15px', color: '#000', outline: 'none', width: '100%' }}
          />
        </div>
        <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>
          {coursesStatus === 'ok' ? `${filtered.length.toLocaleString()} courses` : coursesStatus === 'error' ? 'unavailable' : ''}
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '16px 48px', overflowY: 'auto' }}>
          {filtered.map(c => (
            <CourseRow
              key={c.code}
              course={c}
              status={getStatus(c.code)}
              req={getReq(c.code)}
              isFavorited={favoriteCourses.includes(c.code)}
              isSelected={selectedCourse?.code === c.code}
              onToggleFavorite={() => toggleFavorite(c.code)}
              onClick={() => setSelectedCourse(selectedCourse?.code === c.code ? null : c)}
            />
          ))}
        </div>
        {selectedCourse && (
          <CourseDetail course={selectedCourse} req={selectedReq} currentTerm={CURRENT_TERM} />
        )}
      </div>
    </div>
  );
}
