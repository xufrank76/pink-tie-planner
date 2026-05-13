'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/src/context/AppContext';
import { getCurrentTerm, nextTerm } from '@/src/lib/termUtils';
import rawPrograms from '@/src/data/requirements-filtered.json';
import rawAntireqs from '@/src/data/antireqs.json';
import { courseCodes } from '@/src/lib/requirementEvaluator';
import type { ReqNode } from '@/src/lib/requirementEvaluator';
import { getMissingPrereqs, isMathRestricted, parseRequiredLevel, levelNum } from '@/src/lib/prereqCheck';
import { getStudyLabel } from '@/src/data/coopSequences';

const antireqs = rawAntireqs as Record<string, string[]>;

const programs = rawPrograms as Record<string, { name: string; requirements: ReqNode[] }>;

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

const CURRENT_TERM = getCurrentTerm();
const NEXT_TERM = nextTerm(CURRENT_TERM);

export default function SemesterPlanner({ onNavigate }: { onNavigate: (id: import('./Sidebar').PageId) => void }) {
  const { semesterPlans, addCourseToTerm, removeCourseFromTerm, completedCourses, courses, coursesStatus, program } = useApp();
  const [selectedTerm, setSelectedTerm] = useState<string>(CURRENT_TERM);
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showCheck, setShowCheck] = useState(false);

  const selectedSeason = selectedTerm[0] as 'F' | 'W' | 'S';
  const planned = semesterPlans[selectedTerm] ?? [];
  const completedSet = useMemo(() => new Set(completedCourses), [completedCourses]);

  const courseInfoMap = useMemo(() => new Map(courses.map(c => [c.code, c])), [courses]);

  // For prereq checking: courses available before selectedTerm
  const prereqAvailable = useMemo(() => {
    const base = new Set(completedCourses);
    if (selectedTerm === NEXT_TERM) {
      for (const code of semesterPlans[CURRENT_TERM] ?? []) base.add(code);
    }
    return base;
  }, [selectedTerm, completedCourses, semesterPlans]);

  const studentLevelAtTerm = useMemo(() => {
    if (!program.startTerm || !program.coopStream) return null;
    const lbl = getStudyLabel(selectedTerm, program.startTerm, program.coopStream);
    return lbl?.startsWith('WT') ? null : lbl ?? null;
  }, [selectedTerm, program.startTerm, program.coopStream]);

  const courseIssues = useMemo(() => {
    const allTaken = new Set([...completedCourses, ...planned]);
    const result: Record<string, { antireqs: string[]; prereqs: string[]; restricted: boolean; requiredLevel: string | null }> = {};
    for (const code of planned) {
      const prereqStr = courseInfoMap.get(code)?.prereqs ?? '';
      const antireqList = (antireqs[code] ?? []).filter(a => allTaken.has(a));
      const missingPrereqs = getMissingPrereqs(prereqStr, prereqAvailable);
      const restricted = isMathRestricted(prereqStr, program.major);
      const reqLevel = parseRequiredLevel(prereqStr);
      const requiredLevel = reqLevel && studentLevelAtTerm && levelNum(studentLevelAtTerm) < levelNum(reqLevel) ? reqLevel : null;
      if (antireqList.length > 0 || missingPrereqs.length > 0 || restricted || requiredLevel) {
        result[code] = { antireqs: antireqList, prereqs: missingPrereqs, restricted, requiredLevel };
      }
    }
    return result;
  }, [planned, completedCourses, courseInfoMap, prereqAvailable, studentLevelAtTerm, program.major]);

  // Course codes required by the user's program
  const programCourseCodes = useMemo(() => {
    const ids = [program.id, program.doubleMajorId, program.minorId, ...program.extras.map(e => e.id)].filter(Boolean) as string[];
    const set = new Set<string>();
    for (const id of ids) {
      const entry = programs[id];
      if (entry) entry.requirements.forEach(r => courseCodes(r).forEach(c => set.add(c)));
    }
    return set;
  }, [program]);

  // Show courses offered this season, not yet completed, prioritising required ones
  const availableCourses = useMemo(() => {
    return courses
      .filter(c => c.offered.includes(selectedSeason) && !completedSet.has(c.code))
      .sort((a, b) => {
        const aReq = programCourseCodes.has(a.code) ? 0 : 1;
        const bReq = programCourseCodes.has(b.code) ? 0 : 1;
        return aReq - bReq || a.code.localeCompare(b.code);
      });
  }, [courses, completedSet, programCourseCodes, selectedSeason]);

  const toggleCourse = (code: string) => {
    if (planned.includes(code)) {
      removeCourseFromTerm(selectedTerm, code);
    } else {
      addCourseToTerm(selectedTerm, code);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return availableCourses;
    const q = search.toLowerCase();
    return availableCourses.filter(c =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [availableCourses, search]);

  const plannedCourses = useMemo(
    () => courses.filter(c => planned.includes(c.code)),
    [courses, planned]
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '32px 48px 16px', flexShrink: 0 }}>
        <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', lineHeight: 1, margin: '0 0 16px', fontWeight: 400 }}>
          build your semester...
        </h1>
        <div style={{ background: '#d9d9d9', borderRadius: '40px', padding: '6px', display: 'inline-flex' }}>
          {[CURRENT_TERM, NEXT_TERM].map(term => (
            <div
              key={term}
              onClick={() => { setSelectedTerm(term); setSearch(''); setShowCheck(false); }}
              style={{
                borderRadius: '40px', padding: '0 24px', height: '44px', display: 'flex', alignItems: 'center',
                cursor: 'pointer', background: selectedTerm === term ? '#000' : 'transparent',
                color: selectedTerm === term ? '#fff' : '#858080',
                fontFamily: MONO, fontSize: '15px', transition: 'background 0.15s',
              }}
            >
              {term}
            </div>
          ))}
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ flex: 1, display: 'flex', gap: '16px', padding: '0 48px 32px', overflow: 'hidden' }}>

        {/* Left: available courses */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#d9d9d9',
            borderRadius: '15px',
            padding: '16px',
            overflow: 'hidden',
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.04em' }}>
            AVAILABLE COURSES — REQUIRED FOR YOUR MAJOR
          </div>
          <div
            style={{
              background: '#fff',
              borderRadius: '15px',
              padding: '10px 14px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              border: '1px solid #000',
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: '18px', marginRight: '8px' }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search courses..."
              style={{
                border: 'none',
                background: 'transparent',
                fontFamily: SANS,
                fontSize: '15px',
                color: '#858080',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {coursesStatus === 'loading' && (
              <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', padding: '8px 4px' }}>loading courses...</div>
            )}
            {filtered.map((c) => {
              const isPlanned = planned.includes(c.code);
              const isRequired = programCourseCodes.has(c.code);
              return (
                <div
                  key={c.code}
                  onClick={() => toggleCourse(c.code)}
                  style={{
                    background: '#fff',
                    border: '1px solid #000',
                    borderRadius: '15px',
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    opacity: isPlanned ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: 0 }}>
                    <span style={{ fontFamily: MONO, fontSize: '18px', color: '#000', whiteSpace: 'nowrap' }}>{c.code}</span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '2px 10px', fontFamily: MONO, fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {isRequired ? 'Required' : 'Elective'}
                      </div>
                      {c.prereqs && (
                        <span style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.prereqs}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: '18px', color: '#858080', flexShrink: 0, marginLeft: '8px' }}>{isPlanned ? '✓' : '+'}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: this term's plan */}
        <div
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={() => setDragOver(false)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderRadius: '15px',
            border: `1px dashed ${dragOver ? '#000' : '#858080'}`,
            padding: '16px',
            overflow: 'hidden',
            transition: 'border-color 0.15s',
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.04em' }}>
            DRAG HERE — {selectedTerm} ({plannedCourses.length}/5 courses)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
            {plannedCourses.map((c) => {
              const issue = courseIssues[c.code];
              return (
                <div
                  key={c.code}
                  style={{
                    background: '#fff',
                    border: `1px solid ${issue ? '#c60078' : '#000'}`,
                    borderRadius: '15px',
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontFamily: MONO, fontSize: '18px', color: '#000', whiteSpace: 'nowrap' }}>{c.code}</span>
                    <span style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{c.name}</span>
                    {issue?.requiredLevel ? (
                      <span style={{ fontFamily: MONO, fontSize: '11px', color: '#c60078', whiteSpace: 'nowrap' }}>
                        level at least {issue.requiredLevel} required
                      </span>
                    ) : null}
                    {issue?.restricted ? (
                      <span style={{ fontFamily: MONO, fontSize: '11px', color: '#c60078', whiteSpace: 'nowrap' }}>
                        not open to Math students
                      </span>
                    ) : null}
                    {issue?.antireqs.length ? (
                      <span style={{ fontFamily: MONO, fontSize: '11px', color: '#c60078', whiteSpace: 'nowrap' }}>
                        antireq conflict: {issue.antireqs.join(', ')}
                      </span>
                    ) : null}
                    {issue?.prereqs.length ? (
                      <span style={{ fontFamily: MONO, fontSize: '11px', color: '#c60078', whiteSpace: 'nowrap' }}>
                        missing prereq: {issue.prereqs.join(', ')}
                      </span>
                    ) : null}
                  </div>
                  <span
                    onClick={() => toggleCourse(c.code)}
                    style={{ fontFamily: MONO, fontSize: '18px', color: '#858080', cursor: 'pointer' }}
                  >
                    ×
                  </span>
                </div>
              );
            })}
            {plannedCourses.length < 5 && (
              <div
                style={{
                  background: '#fff',
                  border: '1px dashed #858080',
                  borderRadius: '15px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: '18px', color: '#858080' }}>+ drag a course here</span>
              </div>
            )}
          </div>

          {plannedCourses.length > 0 && (
            <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '5px 12px', fontFamily: MONO, fontSize: '13px' }}>
                ✓ list 1 comm req
              </div>
              <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '5px 12px', fontFamily: MONO, fontSize: '13px' }}>
                ✓ PD req
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plan check panel */}
      {showCheck && (
        <div style={{ padding: '0 48px 16px', flexShrink: 0 }}>
          <div style={{ background: '#ececec', borderRadius: '15px', padding: '16px 20px' }}>
            <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }}>
              PLAN CHECK — {selectedTerm}
            </div>
            {plannedCourses.length === 0
              ? <span style={{ fontFamily: SANS, fontSize: '16px', color: '#858080' }}>No courses planned yet.</span>
              : plannedCourses.map(c => {
                  const issue = courseIssues[c.code];
                  const hasIssue = !!issue;
                  return (
                    <div key={c.code} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '5px', flexShrink: 0, marginTop: '2px',
                        background: hasIssue ? '#c60078' : '#000',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ color: '#fff', fontFamily: MONO, fontSize: '12px' }}>{hasIssue ? '!' : '✓'}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontFamily: MONO, fontSize: '15px', color: '#000' }}>{c.code}</span>
                        {issue?.requiredLevel ? (
                          <span style={{ fontFamily: SANS, fontSize: '14px', color: '#858080' }}>level at least {issue.requiredLevel} required</span>
                        ) : null}
                        {issue?.restricted ? (
                          <span style={{ fontFamily: SANS, fontSize: '14px', color: '#858080' }}>not open to Math students</span>
                        ) : null}
                        {issue?.prereqs.length ? (
                          <span style={{ fontFamily: SANS, fontSize: '14px', color: '#858080' }}>missing prereq: {issue.prereqs.join(', ')}</span>
                        ) : null}
                        {issue?.antireqs.length ? (
                          <span style={{ fontFamily: SANS, fontSize: '14px', color: '#858080' }}>antireq conflict: {issue.antireqs.join(', ')}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ padding: '0 48px 32px', display: 'flex', gap: '12px', flexShrink: 0 }}>
        <button
          onClick={() => onNavigate('dashboard')}
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
          ← back
        </button>
        <button
          onClick={() => setShowCheck(v => !v)}
          style={{
            background: showCheck ? '#000' : '#d9d9d9',
            color: showCheck ? '#fff' : '#000',
            border: 'none',
            borderRadius: '40px',
            height: '58px',
            padding: '0 35px',
            fontFamily: SANS,
            fontSize: '20px',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          check plan →
        </button>
      </div>
    </div>
  );
}
