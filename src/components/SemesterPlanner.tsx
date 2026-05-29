'use client';

import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/src/context/AppContext';
import { getCurrentTerm, termToNum } from '@/src/lib/termUtils';
import { effectivePlanTerms } from '@/src/lib/planTerms';
import rawPrograms from '@/src/data/requirements-filtered.json';
import rawAntireqs from '@/src/data/antireqs.json';
import { courseCodes } from '@/src/lib/requirementEvaluator';
import type { ReqNode } from '@/src/lib/requirementEvaluator';
import { getMissingPrereqs, isMathRestricted, parseRequiredLevel, levelNum, expandWithLabCourses } from '@/src/lib/prereqCheck';
import { getStudyLabel } from '@/src/data/coopSequences';
import { useIsMobile } from '@/src/lib/useIsMobile';

const antireqs = rawAntireqs as Record<string, string[]>;

const programs = rawPrograms as Record<string, { name: string; requirements: ReqNode[] }>;

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

const CURRENT_TERM = getCurrentTerm();

export default function SemesterPlanner({ onNavigate }: { onNavigate: (id: import('./Sidebar').PageId) => void }) {
  const { semesterPlans, addCourseToTerm, removeCourseFromTerm, completedCourses, courses, coursesStatus, effectiveProgram: program, planEndTerm, flowRatings, showDifficultyScore, courseOverrides, favoriteCourses } = useApp();
  const planTerms = useMemo(() => effectivePlanTerms(program, planEndTerm), [program, planEndTerm]);
  const isMobile = useIsMobile();
  const [selectedTerm, setSelectedTerm] = useState<string>(CURRENT_TERM);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => new Set(['available-now']));
  const [dragOver, setDragOver] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [onlineCodes, setOnlineCodes] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!activeFilters.has('online')) return;
    fetch(`/api/online-courses?term=${selectedTerm}`)
      .then(r => r.json())
      .then((codes: string[]) => setOnlineCodes(new Set(codes)))
      .catch(() => {});
  }, [selectedTerm, activeFilters]);
  useEffect(() => {
    if (planTerms.length === 0) return;
    if (!planTerms.includes(selectedTerm)) setSelectedTerm(planTerms[0]!);
  }, [planTerms, selectedTerm]);

  const selectedSeason = selectedTerm[0] as 'F' | 'W' | 'S';
  const planned = semesterPlans[selectedTerm] ?? [];
  const completedSet = useMemo(() => new Set(completedCourses), [completedCourses]);

  const courseInfoMap = useMemo(() => new Map(courses.map(c => [c.code, c])), [courses]);

  const semesterDifficulty = useMemo(() => {
    const scores = planned
      .map(code => {
        const r = flowRatings[code];
        return r && r.filled_count >= 10 && r.easy !== null ? r.easy : null;
      })
      .filter((e): e is number => e !== null);
    if (scores.length < 2) return null;
    return scores.reduce((s, v) => s + v, 0) / scores.length;
  }, [planned, flowRatings]);

  // For prereq checking: courses available before selectedTerm
  const prereqAvailable = useMemo(() => {
    const base = new Set(completedCourses);
    const selN = termToNum(selectedTerm);
    for (const [t, codes] of Object.entries(semesterPlans)) {
      if (termToNum(t) < selN) for (const c of codes) base.add(c);
    }
    return expandWithLabCourses(base);
  }, [selectedTerm, completedCourses, semesterPlans]);

  const studentLevelAtTerm = useMemo(() => {
    if (!program.startTerm || !program.coopStream) return null;
    const lbl = getStudyLabel(selectedTerm, program.startTerm, program.coopStream);
    return lbl?.startsWith('WT') ? null : lbl ?? null;
  }, [selectedTerm, program.startTerm, program.coopStream]);

  const courseIssues = useMemo(() => {
    const allTaken = new Set([...completedCourses, ...planned]);
    // Minimum term where each course appears — used to suppress antireqs planned only in future terms
    const courseTermNum = new Map<string, number>();
    for (const [term, codes] of Object.entries(semesterPlans)) {
      const termN = termToNum(term);
      for (const code of codes) {
        const cur = courseTermNum.get(code);
        if (cur === undefined || termN < cur) courseTermNum.set(code, termN);
      }
    }
    const selTermN = termToNum(selectedTerm);
    const result: Record<string, { antireqs: string[]; prereqs: string[][]; restricted: boolean; requiredLevel: string | null; notOffered: boolean }> = {};
    for (const code of planned) {
      const info = courseInfoMap.get(code);
      const prereqStr = info?.prereqs ?? '';
      const prereqCodes = new Set(
        (prereqStr.match(/([A-Z]{2,8})\s+(\d{1,3}[A-Z]?)/g) ?? []).map(m => m.replace(/\s+/g, ''))
      );
      const antireqList = (antireqs[code] ?? []).filter(a => {
        if (!allTaken.has(a)) return false;
        if (prereqCodes.has(a)) return false;
        const aTermN = courseTermNum.get(a);
        if (aTermN !== undefined && aTermN > selTermN) return false;
        return true;
      });
      const missingPrereqs = getMissingPrereqs(prereqStr, prereqAvailable);
      const restricted = isMathRestricted(prereqStr, program.major);
      const reqLevel = parseRequiredLevel(prereqStr);
      const requiredLevel = reqLevel && studentLevelAtTerm && levelNum(studentLevelAtTerm) < levelNum(reqLevel) ? reqLevel : null;
      const offered = info?.offered ?? [];
      const offeredTerms = info?.offeredTerms ?? null;
      let notOffered: boolean;
      if (offeredTerms) {
        const maxN = Math.max(...offeredTerms.map(t => termToNum(t)));
        notOffered = termToNum(selectedTerm) > maxN
          ? offered.length > 0 && !offered.includes(selectedSeason)
          : !offeredTerms.includes(selectedTerm);
      } else {
        notOffered = offered.length > 0 && !offered.includes(selectedSeason);
      }
      if (antireqList.length > 0 || missingPrereqs.length > 0 || restricted || requiredLevel || notOffered) {
        result[code] = { antireqs: antireqList, prereqs: missingPrereqs, restricted, requiredLevel, notOffered };
      }
    }
    return result;
  }, [planned, completedCourses, semesterPlans, courseInfoMap, prereqAvailable, studentLevelAtTerm, program.major, selectedSeason, selectedTerm]);

  // Course codes required by the user's program (all: major + minor + extras) — used for the req dot
  const programCourseCodes = useMemo(() => {
    const ids = [program.id, program.doubleMajorId, program.minorId, ...program.extras.map(e => e.id)].filter(Boolean) as string[];
    const set = new Set<string>();
    for (const id of ids) {
      const entry = programs[id];
      if (entry) entry.requirements.forEach(r => courseCodes(r).forEach(c => set.add(c)));
    }
    return set;
  }, [program]);

  const majorCourseCodes = useMemo(() => {
    const ids = [program.id, program.doubleMajorId, ...program.extras.map(e => e.id)].filter(Boolean) as string[];
    const set = new Set<string>();
    for (const id of ids) {
      const entry = programs[id];
      if (entry) entry.requirements.forEach(r => courseCodes(r).forEach(c => set.add(c)));
    }
    return set;
  }, [program]);

  const minorCourseCodes = useMemo(() => {
    if (!program.minorId) return new Set<string>();
    const entry = programs[program.minorId];
    const set = new Set<string>();
    if (entry) entry.requirements.forEach(r => courseCodes(r).forEach(c => set.add(c)));
    return set;
  }, [program.minorId]);

  const restrictedCodes = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses) {
      if (isMathRestricted(c.prereqs ?? '', program.major)) set.add(c.code);
    }
    return set;
  }, [courses, program.major]);

  const prereqUnlockedCodes = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses) {
      const prereqStr = c.prereqs ?? '';
      if (!prereqStr || getMissingPrereqs(prereqStr, prereqAvailable).length === 0) set.add(c.code);
    }
    return set;
  }, [courses, prereqAvailable]);

  const toggleCourse = (code: string) => {
    if (planned.includes(code)) {
      removeCourseFromTerm(selectedTerm, code);
    } else {
      addCourseToTerm(selectedTerm, code);
    }
  };

  const filtered = useMemo(() => {
    const isSearching = search.trim().length > 0;
    let pool = courses.filter(c => (isSearching || !completedSet.has(c.code)) && (isSearching || !restrictedCodes.has(c.code) || courseOverrides.has(c.code)));
    if (activeFilters.has('available-now')) {
      pool = pool.filter(c => {
        if (!c.offered.includes(selectedSeason)) return false;
        if (c.offeredTerms && !c.offeredTerms.includes(selectedTerm)) return false;
        return true;
      });
    }
    if (activeFilters.has('prereq-unlocked')) pool = pool.filter(c => prereqUnlockedCodes.has(c.code));
    if (activeFilters.has('req-major')) pool = pool.filter(c => majorCourseCodes.has(c.code));
    if (activeFilters.has('req-minor')) pool = pool.filter(c => minorCourseCodes.has(c.code));
    if (activeFilters.has('online')) pool = pool.filter(c => onlineCodes.has(c.code));
    if (activeFilters.has('favourites')) { const favSet = new Set(favoriteCourses); pool = pool.filter(c => favSet.has(c.code)); }
    pool = pool.sort((a, b) => {
      const aReq = programCourseCodes.has(a.code) ? 0 : 1;
      const bReq = programCourseCodes.has(b.code) ? 0 : 1;
      return aReq - bReq || a.code.localeCompare(b.code);
    });
    if (!search) return pool;
    const qNoSpace = search.toLowerCase().replace(/\s+/g, '');
    const qWords = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return pool.filter(c => {
      const codeMatch = c.code.toLowerCase().replace(/\s+/g, '').includes(qNoSpace);
      const nameMatch = qWords.every(w => c.name.toLowerCase().includes(w));
      return codeMatch || nameMatch;
    });
  }, [courses, completedSet, activeFilters, selectedSeason, selectedTerm, prereqUnlockedCodes, majorCourseCodes, minorCourseCodes, programCourseCodes, restrictedCodes, courseOverrides, favoriteCourses, onlineCodes, search]);

  const plannedCourses = useMemo(
    () => courses.filter(c => planned.includes(c.code)),
    [courses, planned]
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: isMobile ? '20px 16px 12px' : '32px 48px 16px', flexShrink: 0 }}>
        <h1 style={{ fontFamily: SANS, fontSize: isMobile ? '36px' : '60px', color: '#000', lineHeight: 1, margin: '0 0 16px', fontWeight: 400 }}>
          build your semester...
        </h1>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>term</span>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              value={selectedTerm}
              onChange={e => {
                setSelectedTerm(e.target.value);
                setSearch('');
                setShowCheck(false);
              }}
              style={{
                appearance: 'none',
                background: '#ececec',
                border: 'none',
                borderRadius: '15px',
                padding: '10px 36px 10px 16px',
                fontFamily: SANS,
                fontSize: '15px',
                color: '#000',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {planTerms.map(term => (
                <option key={term} value={term}>{term}{term === CURRENT_TERM ? ' — current' : ''}</option>
              ))}
            </select>
            <svg width="12" height="12" viewBox="0 0 12 12" style={{ position: 'absolute', right: '14px', pointerEvents: 'none', color: '#858080' }}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '16px', padding: isMobile ? '0 16px 24px' : '0 48px 32px', overflow: isMobile ? 'auto' : 'hidden' }}>

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
            COURSES
          </div>
          <div
            style={{
              background: '#fff',
              borderRadius: '15px',
              padding: '10px 14px',
              marginBottom: '8px',
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
          {/* Filter chips */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px', flexShrink: 0, alignItems: 'center', justifyContent: 'flex-start' }}>
            {([
              { id: 'available-now', label: `offered this ${selectedSeason === 'F' ? 'fall' : selectedSeason === 'W' ? 'winter' : 'spring'}` },
              { id: 'prereq-unlocked', label: 'prereq unlocked' },
              { id: 'req-major', label: 'req for major' },
              ...(program.minorId ? [{ id: 'req-minor', label: 'req for minor' }] : []),
              { id: 'online', label: 'online' },
            ] as { id: string; label: string }[]).map(f => {
              const on = activeFilters.has(f.id);
              return (
                <div
                  key={f.id}
                  onClick={() => setActiveFilters(prev => { const s = new Set(prev); on ? s.delete(f.id) : s.add(f.id); return s; })}
                  style={{ background: on ? '#000' : '#c8c8c8', color: on ? '#fff' : '#858080', borderRadius: '40px', padding: '5px 12px', fontFamily: MONO, fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {f.label}
                </div>
              );
            })}
            <svg
              onClick={() => setActiveFilters(prev => { const s = new Set(prev); s.has('favourites') ? s.delete('favourites') : s.add('favourites'); return s; })}
              viewBox="0 0 24 24" fill="currentColor"
              style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0, color: activeFilters.has('favourites') ? '#e91e8c' : '#858080' }}
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>

          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {coursesStatus === 'loading' && (
              <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', padding: '8px 4px' }}>loading courses...</div>
            )}
            {filtered.map((c) => {
              const isPlanned = planned.includes(c.code);
              const isCompleted = completedSet.has(c.code);
              const isMajorReq = majorCourseCodes.has(c.code);
              const isMinorReq = !isMajorReq && minorCourseCodes.has(c.code);
              return (
                <div
                  key={c.code}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/plain', c.code);
                  }}
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
                    opacity: isPlanned || isCompleted ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                    <span style={{ fontFamily: MONO, fontSize: '18px', color: '#000', whiteSpace: 'nowrap' }}>{c.code}</span>
                    {c.name && <span style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {(isMajorReq || isMinorReq) && (
                        <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '2px 10px', fontFamily: MONO, fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {isMajorReq ? 'Major req' : 'Minor req'}
                        </div>
                      )}
                      {c.prereqs && (
                        <span style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.prereqs}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: '18px', color: '#858080', flexShrink: 0, marginLeft: '8px' }}>
                    {isCompleted ? '✓' : isPlanned ? '✓' : '+'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: this term's plan */}
        <div
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const code = e.dataTransfer.getData('text/plain').trim().toUpperCase().replace(/\s+/g, '');
            if (!code || planned.includes(code)) return;
            if (!courseInfoMap.has(code)) return;
            addCourseToTerm(selectedTerm, code);
          }}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderRadius: '15px',
            border: `1px dashed ${dragOver ? '#000' : '#858080'}`,
            padding: '16px',
            overflow: 'hidden',
            transition: 'border-color 0.15s, opacity 0.15s',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {selectedTerm} ({plannedCourses.length}/5 courses)
            </div>
            {showDifficultyScore && semesterDifficulty !== null && (
              <div style={{ position: 'relative', display: 'inline-block' }}
                onMouseEnter={e => { const t = e.currentTarget.querySelector<HTMLElement>('[data-tooltip]'); if (t) t.style.display = 'block'; }}
                onMouseLeave={e => { const t = e.currentTarget.querySelector<HTMLElement>('[data-tooltip]'); if (t) t.style.display = 'none'; }}
              >
                <div style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', letterSpacing: '0.04em', cursor: 'default', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {Math.round(semesterDifficulty * 100)}% easy
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '13px', height: '13px', borderRadius: '50%', border: '1px solid #858080', fontSize: '9px', lineHeight: 1, flexShrink: 0 }}>?</span>
                </div>
                <div data-tooltip style={{
                  display: 'none',
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  width: '220px',
                  background: '#000',
                  color: '#fff',
                  fontFamily: SANS,
                  fontSize: '11px',
                  lineHeight: 1.5,
                  padding: '10px 12px',
                  borderRadius: '10px',
                  zIndex: 100,
                  pointerEvents: 'none',
                }}>
                  average difficulty score from UW Flow ratings — may reflect sampling bias. do your own research & consult reddit
                </div>
              </div>
            )}
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, overflow: 'hidden' }}>
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
                      <span style={{ fontFamily: MONO, fontSize: '11px', color: '#c60078' }}>
                        missing prereq: {issue.prereqs.map(g => g.length > 1 ? `One of ${g.join(', ')}` : g[0]).join(' and ')}
                      </span>
                    ) : null}
                    {issue?.notOffered ? (
                      <span style={{ fontFamily: MONO, fontSize: '11px', color: '#c60078', whiteSpace: 'nowrap' }}>
                        not offered in {selectedSeason === 'F' ? 'Fall' : selectedSeason === 'W' ? 'Winter' : 'Spring'}
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
            {(
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
                <span style={{ fontFamily: MONO, fontSize: '18px', color: '#858080' }}>+ click or drop a course here</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Plan check panel */}
      {showCheck && (
        <div style={{ padding: isMobile ? '0 16px 12px' : '0 48px 16px', flexShrink: 0 }}>
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
                          <span style={{ fontFamily: SANS, fontSize: '14px', color: '#858080' }}>
                            missing prereq: {issue.prereqs.map(g => g.length > 1 ? `One of ${g.join(', ')}` : g[0]).join(' and ')}
                          </span>
                        ) : null}
                        {issue?.antireqs.length ? (
                          <span style={{ fontFamily: SANS, fontSize: '14px', color: '#858080' }}>antireq conflict: {issue.antireqs.join(', ')}</span>
                        ) : null}
                        {issue?.notOffered ? (
                          <span style={{ fontFamily: SANS, fontSize: '14px', color: '#858080' }}>not offered in {selectedSeason === 'F' ? 'Fall' : selectedSeason === 'W' ? 'Winter' : 'Spring'}</span>
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
      <div style={{ padding: isMobile ? '0 16px 20px' : '0 48px 32px', display: 'flex', gap: '12px', flexShrink: 0 }}>
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
            transition: 'background 0.15s, opacity 0.15s',
          }}
        >
          check plan
        </button>
      </div>
    </div>
  );
}
