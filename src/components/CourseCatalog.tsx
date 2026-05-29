'use client';

import { useState, useMemo, useDeferredValue, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useApp, type CourseInfo, DEFAULT_COURSES_FOLDER_ID } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';
import { courseCodes } from '@/src/lib/requirementEvaluator';
import type { ReqNode } from '@/src/lib/requirementEvaluator';
import { patchCoreBmathRequirements } from '@/src/lib/coreBmathCommPatch';
import { getCurrentTerm, nextTerm, termToNum } from '@/src/lib/termUtils';
import DegreePlansCatalog from '@/src/components/DegreePlansCatalog';
// import FoldersPage from '@/src/components/FoldersPage'; // folders feature (disabled)
import SlidingToggle from '@/src/components/SlidingToggle';
import type { PageId } from '@/src/components/Sidebar';
import type { FlowRating } from '@/src/context/AppContext';
import type { SectionInfo, ScheduleEntry } from '@/app/api/schedule/route';
import { useIsMobile } from '@/src/lib/useIsMobile';

const programs = rawPrograms as Record<string, { name: string; requirements: ReqNode[] }>;

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

const PAGE = 200;

type CourseStatus = 'done' | 'planned' | 'available';

const MATH_FACULTY_SUBJECTS = new Set(['ACTSC', 'AMATH', 'CO', 'CS', 'MATBUS', 'MATH', 'PMATH', 'STAT']);

function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

function getSubject(code: string) {
  return code.match(/^([A-Z]+)/)?.[1] ?? '';
}

const SEASON_ORDER: Record<string, number> = { F: 0, W: 1, S: 2 };
function offeredLabel(offered: string[]) {
  return [...offered].sort((a, b) => (SEASON_ORDER[a] ?? 9) - (SEASON_ORDER[b] ?? 9)).join(' · ') || '—';
}

function topLevelNodes(entry: { requirements: ReqNode[] }): ReqNode[] {
  const roots = entry.requirements;
  return roots.length === 1 && roots[0].children ? roots[0].children : roots;
}

function FlowStat({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '80px' }}>
      <div style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', textTransform: 'lowercase' }}>{label}</div>
      <div style={{ background: '#ececec', borderRadius: '40px', height: '6px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#000', borderRadius: '40px' }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: '13px', color: '#000' }}>{pct}%</div>
    </div>
  );
}

/* Folders feature — disabled for now, re-enable by uncommenting and swapping HeartToggleCourseButton back to FolderToggleCourseButton in CourseRow
function FolderPopover({ children, open, items }: { children: ReactNode; open: boolean; items: ReactNode }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      {children}
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '6px', zIndex: 200, minWidth: '190px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
        >
          {items}
        </div>
      )}
    </div>
  );
}

function FolderToggleCourseButton({ code }: { code: string }) {
  const { folders, addCourseToFolder, removeCourseFromFolder } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const inAnyFolder = folders.some(f => f.courses.includes(code));
  return (
    <div ref={ref}>
      <FolderPopover
        open={open}
        items={folders.map(f => {
          const checked = f.courses.includes(code);
          return (
            <div
              key={f.id}
              onClick={e => { e.stopPropagation(); checked ? removeCourseFromFolder(f.id, code) : addCourseToFolder(f.id, code); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', cursor: 'pointer', borderRadius: '8px' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: 16, height: 16, borderRadius: 4, background: checked ? '#000' : 'transparent', border: `1.5px solid ${checked ? '#000' : '#c0c0c0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {checked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
              </div>
              <span style={{ fontFamily: SANS, fontSize: '13px', color: '#000' }}>{f.name}</span>
            </div>
          );
        })}
      >
        <svg
          width={22} height={22} viewBox="0 0 24 24"
          fill={inAnyFolder ? PINK : 'none'}
          stroke={inAnyFolder ? PINK : '#858080'}
          strokeWidth={1.8}
          onClick={e => { e.stopPropagation(); setOpen(s => !s); }}
          style={{ cursor: 'pointer', flexShrink: 0, transition: 'fill 0.15s, stroke 0.15s' }}
        >
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      </FolderPopover>
    </div>
  );
}
*/

const PINK = '#c60078';

function HeartToggleCourseButton({ code }: { code: string }) {
  const { favoriteCourses, addCourseToFolder, removeCourseFromFolder } = useApp();
  const isFav = favoriteCourses.includes(code);
  return (
    <svg
      onClick={e => { e.stopPropagation(); isFav ? removeCourseFromFolder(DEFAULT_COURSES_FOLDER_ID, code) : addCourseToFolder(DEFAULT_COURSES_FOLDER_ID, code); }}
      viewBox="0 0 24 24" fill="currentColor"
      style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0, color: isFav ? PINK : '#c0c0c0' }}
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
  );
}

function CourseRow({ course, status, req, rating, isSelected, onClick }: {
  course: CourseInfo;
  status: CourseStatus;
  req: string;
  rating?: FlowRating | null;
  isSelected: boolean;
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
        transition: 'background 0.1s, opacity 0.15s',
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
        <HeartToggleCourseButton code={course.code} />
        <div style={{ background: pill.bg, color: pill.color, borderRadius: '15px', padding: '6px 14px', fontFamily: SANS, fontSize: '14px', whiteSpace: 'nowrap' }}>
          {pill.label}
        </div>
      </div>
    </div>
  );
}

function prevTermLabel(t: string): string {
  const s = t[0]; const yy = parseInt(t.slice(1));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (s === 'W') return `F${pad(yy - 1)}`;
  if (s === 'S') return `W${pad(yy)}`;
  return `S${pad(yy)}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const timePart = iso.includes('T') ? iso.split('T')[1] : iso;
  const [hStr, mStr] = timePart.split(':');
  let h = parseInt(hStr);
  const m = mStr ?? '00';
  const period = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${period}`;
}

// UW day pattern uses M T W R F where R = Thursday
function parseWeekdays(pattern: string | null): Set<string> {
  if (!pattern) return new Set();
  const result = new Set<string>();
  for (const c of pattern) {
    if (c === 'M') result.add('M');
    else if (c === 'T') result.add('T');
    else if (c === 'W') result.add('W');
    else if (c === 'R') result.add('Th');
    else if (c === 'F') result.add('F');
  }
  return result;
}

function CourseDetail({ course, req, currentTerm, rating, onClose, isMobile }: { course: CourseInfo; req: string; currentTerm: string; rating?: FlowRating | null; onClose: () => void; isMobile?: boolean }) {
  const { addCourseToTerm, removeCourseFromTerm, semesterPlans } = useApp();

  const [scheduledTerms, setScheduledTerms] = useState<string[]>([]);
  const [scheduleTerm, setScheduleTerm] = useState('');
  const [scheduleData, setScheduleData] = useState<SectionInfo[] | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);

  useEffect(() => {
    setScheduledTerms([]);
    setScheduleTerm('');
    setScheduleData(null);
    fetch(`/api/schedule-terms?code=${course.code.toLowerCase()}`)
      .then(r => r.json())
      .then((terms: string[]) => {
        setScheduledTerms(terms);
        const def = terms.includes(currentTerm) ? currentTerm : (terms[0] ?? '');
        setScheduleTerm(def);
      })
      .catch(() => {});
  }, [course.code]);

  useEffect(() => {
    if (!scheduleTerm) return;
    const subject = course.code.match(/^([A-Z]+)/)?.[1] ?? '';
    const number = course.code.match(/(\d+[A-Z]?)$/)?.[1] ?? '';
    setScheduleLoading(true);
    setScheduleData(null);
    fetch(`/api/schedule?term=${scheduleTerm}&subject=${subject}&number=${number}`)
      .then(r => r.json())
      .then((d: SectionInfo[]) => { setScheduleData(d); setScheduleLoading(false); })
      .catch(() => { setScheduleData([]); setScheduleLoading(false); });
  }, [course.code, scheduleTerm]);

  const nextTerms = useMemo(() => {
    if (course.offeredTerms) {
      const currentN = termToNum(currentTerm);
      return [...course.offeredTerms]
        .sort((a, b) => termToNum(a) - termToNum(b))
        .filter(t => termToNum(t) > currentN)
        .slice(0, 6);
    }
    const seasons = course.offered.length > 0 ? course.offered : (['F', 'W', 'S'] as const);
    const out: string[] = [];
    let t = currentTerm;
    for (let i = 0; i < 24 && out.length < 6; i++) {
      t = nextTerm(t);
      const season = t[0] as 'F' | 'W' | 'S';
      if (seasons.includes(season)) out.push(t);
    }
    return out;
  }, [course.code, course.offered, course.offeredTerms, currentTerm]);

  const isInTerm = (term: string) =>
    (semesterPlans[term] ?? []).some(c => normalizeCode(c) === course.code);

  return (
    <div style={isMobile ? { flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: 0 } : { width: '50%', minWidth: '320px', borderLeft: '1px solid #d9d9d9', display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0, minHeight: 0 }}>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {isMobile && (
          <button
            onClick={onClose}
            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: '15px', color: '#858080', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            ← back
          </button>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', marginBottom: '4px' }}>{req}</div>
            <div style={{ fontFamily: MONO, fontSize: '22px', color: '#000' }}>{course.code}</div>
            <div style={{ fontFamily: SANS, fontSize: '24px', color: '#000', lineHeight: 1.2, fontWeight: 400, marginTop: '4px' }}>{course.name}</div>
          </div>
          {!isMobile && <div onClick={onClose} style={{ cursor: 'pointer', color: '#858080', fontFamily: MONO, fontSize: '20px', lineHeight: 1, padding: '0 0 0 12px', flexShrink: 0 }}>×</div>}
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
          <div style={{ fontFamily: MONO, fontSize: '14px', color: '#000' }}>{offeredLabel(course.offered.length ? course.offered : ['F', 'W', 'S'])}</div>
        </div>

        {rating && rating.filled_count >= 5 && (
          <div>
            <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              <a
                href={`https://uwflow.com/course/${course.code.toLowerCase()}`}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={e => { (e.target as HTMLElement).style.color = '#000'; (e.target as HTMLElement).style.borderBottomColor = '#000'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = '#858080'; (e.target as HTMLElement).style.borderBottomColor = '#858080'; }}
                style={{ color: '#858080', textDecoration: 'none', borderBottom: '1px solid #858080', transition: 'color 0.15s, opacity 0.15s' }}
              >UW Flow</a> · {rating.filled_count} ratings
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {rating.easy !== null && <FlowStat label="easy" value={rating.easy} />}
              {rating.useful !== null && <FlowStat label="useful" value={rating.useful} />}
              {rating.liked !== null && <FlowStat label="liked" value={rating.liked} />}
            </div>
          </div>
        )}

        {scheduledTerms.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Course Schedule</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {scheduledTerms.map(t => (
                  <div
                    key={t}
                    onClick={() => setScheduleTerm(t)}
                    style={{
                      background: t === scheduleTerm ? '#000' : 'transparent',
                      color: t === scheduleTerm ? '#fff' : '#858080',
                      border: t === scheduleTerm ? 'none' : '1px solid #d9d9d9',
                      borderRadius: '40px',
                      padding: '2px 10px',
                      fontFamily: MONO,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >{t}</div>
                ))}
              </div>
            </div>
            {scheduleLoading && <div style={{ fontFamily: SANS, fontSize: '13px', color: '#858080' }}>loading…</div>}
            {!scheduleLoading && scheduleData && scheduleData.length === 0 && (
              <div style={{ fontFamily: SANS, fontSize: '13px', color: '#858080' }}>No sections found for {scheduleTerm}.</div>
            )}
            {!scheduleLoading && scheduleData && scheduleData.length > 0 && (
              <div style={{ background: '#ececec', borderRadius: '15px', padding: '12px 16px', overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr auto', columnGap: '20px', rowGap: '8px', alignItems: 'center' }}>
                  {/* Header */}
                  {['SECTION', 'CLASS', 'ENROLLED', 'TIME', 'DATE'].map(h => (
                    <div key={h} style={{ fontFamily: MONO, fontSize: '10px', color: '#858080', paddingBottom: '8px', borderBottom: '1px solid #d9d9d9' }}>{h}</div>
                  ))}
                  {/* Rows */}
                  {scheduleData.map(sec => {
                    const sched: ScheduleEntry | undefined = sec.scheduleData?.[0];
                    const t1 = sched?.classMeetingStartTime;
                    const t2 = sched?.classMeetingEndTime;
                    const time = !sched
                      ? '—'
                      : (!t1 || !t2 || t1 === t2)
                        ? 'Online'
                        : `${formatTime(t1)} – ${formatTime(t2)}`;
                    const activeDays = parseWeekdays(sched?.classMeetingDayPatternCode ?? null);
                    const sectionLabel = `${sec.courseComponent} ${String(sec.classSection).padStart(3, '0')}`;
                    return [
                      <div key={`${sec.classNumber}-s`} style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 700 }}>{sectionLabel}</div>,
                      <div key={`${sec.classNumber}-c`} style={{ fontFamily: MONO, fontSize: '12px' }}>{sec.classNumber}</div>,
                      <div key={`${sec.classNumber}-e`} style={{ fontFamily: MONO, fontSize: '12px' }}>{sec.enrolledStudents}/{sec.maxEnrollmentCapacity}</div>,
                      <div key={`${sec.classNumber}-t`} style={{ fontFamily: MONO, fontSize: '12px' }}>{time}</div>,
                      <div key={`${sec.classNumber}-d`} style={{ fontFamily: MONO, fontSize: '12px', display: 'flex', gap: '4px' }}>
                        {['M', 'T', 'W', 'Th', 'F'].map(d => (
                          <span key={d} style={{ fontWeight: activeDays.has(d) ? 700 : 400, color: activeDays.has(d) ? '#000' : '#858080' }}>{d}</span>
                        ))}
                      </div>,
                    ];
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {(() => {
          const seasons = new Set(course.offered.length > 0 ? course.offered : ['F', 'W', 'S']);
          // Walk backward from current term to find the most recent offered term
          const prevTerm = (t: string) => {
            const s = t[0]; const yy = parseInt(t.slice(1));
            const pad = (n: number) => String(n).padStart(2, '0');
            if (s === 'W') return `F${pad(yy - 1)}`;
            if (s === 'S') return `W${pad(yy)}`;
            return `S${pad(yy)}`;
          };
          let bestTerm: string | null = null;
          let t = currentTerm;
          for (let i = 0; i < 9; i++) { t = prevTerm(t); if (seasons.has(t[0])) { bestTerm = t; break; } }
          if (!bestTerm) return null;
          const subject = course.code.match(/^([A-Z]+)/)?.[1]?.toLowerCase() ?? '';
          const num = course.code.match(/(\d+[A-Z]?)$/)?.[1] ?? '';
          const seasonDigit = bestTerm[0] === 'F' ? '9' : bestTerm[0] === 'W' ? '1' : '5';
          const uwCode = `1${bestTerm.slice(1)}${seasonDigit}`;
          const url = `https://outline.uwaterloo.ca/view/${uwCode}/${subject}/${num}`;
          return (
            <div>
              <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Outline</div>
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
                <div
                  style={{ background: '#ececec', borderRadius: '15px', padding: '14px 16px', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#d9d9d9'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#ececec'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontFamily: SANS, fontSize: '15px', color: '#000' }}>{course.code} – {bestTerm} Outline</div>
                    <span style={{ fontFamily: MONO, fontSize: '14px', color: '#858080', marginLeft: '8px', flexShrink: 0 }}>↗</span>
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', marginTop: '4px' }}>syllabus · grading · profs</div>
                  <div style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', marginTop: '2px' }}>outline.uwaterloo.ca</div>
                </div>
              </a>
            </div>
          );
        })()}

        <div style={{ borderTop: '1px solid #d9d9d9', paddingTop: '16px' }}>
          <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Add to plan</div>
          {nextTerms.length > 0 ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {nextTerms.map(t => (
                <div
                  key={t}
                  onClick={() => (isInTerm(t) ? removeCourseFromTerm(t, course.code) : addCourseToTerm(t, course.code))}
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
          ) : (
            <span style={{ fontFamily: SANS, fontSize: '14px', color: '#858080' }}>No upcoming terms match this offering pattern. Add the course from the degree plan timeline instead.</span>
          )}
        </div>

        <div style={{ borderTop: '1px solid #ececec', paddingTop: '16px' }}>
          {!feedbackOpen ? (
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: '13px', color: '#858080', padding: 0, display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <span style={{ fontSize: '15px', lineHeight: 1 }}>⚑</span> report an issue with this course
            </button>
          ) : feedbackSent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontFamily: SANS, fontSize: '13px', color: '#2a7a2a', margin: 0 }}>report received — thanks!</p>
              <button
                type="button"
                onClick={() => { setFeedbackSent(false); setFeedbackText(''); setFeedbackOpen(false); setFeedbackError(false); }}
                style={{ alignSelf: 'flex-start', background: 'transparent', color: '#858080', border: '1.5px solid #d9d9d9', borderRadius: '40px', height: '36px', padding: '0 16px', fontFamily: SANS, fontSize: '13px', cursor: 'pointer' }}
              >
                done
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Report an issue</p>
              <textarea
                autoFocus
                value={feedbackText}
                onChange={e => { setFeedbackText(e.target.value); setFeedbackError(false); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                placeholder="what's wrong? (e.g. incorrect prereq, wrong offering term...)"
                rows={3}
                style={{ fontFamily: SANS, fontSize: '13px', color: '#000', background: '#ececec', border: 'none', borderRadius: '12px', padding: '10px 14px', outline: 'none', resize: 'none', lineHeight: 1.55, width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}
              />
              {feedbackError && (
                <p style={{ fontFamily: SANS, fontSize: '12px', color: '#c60078', margin: 0 }}>something went wrong — try again.</p>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => { setFeedbackOpen(false); setFeedbackText(''); setFeedbackError(false); }}
                  style={{ background: 'transparent', color: '#858080', border: '1.5px solid #d9d9d9', borderRadius: '40px', height: '36px', padding: '0 16px', fontFamily: SANS, fontSize: '13px', cursor: 'pointer' }}
                >
                  cancel
                </button>
                <button
                  type="button"
                  disabled={!feedbackText.trim() || feedbackSending}
                  onClick={async () => {
                    setFeedbackSending(true);
                    setFeedbackError(false);
                    try {
                      const res = await fetch('/api/feedback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          message: feedbackText,
                          context: { program: `${course.code} — ${course.name}`, page: 'course catalog' },
                        }),
                      });
                      if (!res.ok) throw new Error();
                      setFeedbackSent(true);
                      setFeedbackText('');
                    } catch {
                      setFeedbackError(true);
                    } finally {
                      setFeedbackSending(false);
                    }
                  }}
                  style={{ background: feedbackText.trim() && !feedbackSending ? '#000' : '#ececec', color: feedbackText.trim() && !feedbackSending ? '#fff' : '#858080', border: 'none', borderRadius: '40px', height: '36px', padding: '0 16px', fontFamily: SANS, fontSize: '13px', cursor: feedbackText.trim() && !feedbackSending ? 'pointer' : 'default', transition: 'background 0.15s' }}
                >
                  {feedbackSending ? 'sending…' : 'send →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CURRENT_TERM = getCurrentTerm();

type CatalogView = 'courses' | 'degree-plans'; // | 'folders' — folders feature disabled

const CATALOG_VIEW_OPTIONS: { value: CatalogView; label: string }[] = [
  { value: 'courses', label: 'courses' },
  { value: 'degree-plans', label: 'degree plans' },
  // { value: 'folders', label: 'folders' }, // folders feature disabled
];

export default function CourseCatalog({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const {
    completedCourses,
    semesterPlans,
    favoriteCourses,
    courses,
    coursesStatus,
    program,
    flowRatings,
  } = useApp();
  const isMobile = useIsMobile();
  const [selectedCourse, setSelectedCourse] = useState<CourseInfo | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'done' | 'planned' | 'available'>('');
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [catalogView, setCatalogView] = useState<CatalogView>('courses');
  const [showFavsOnly, setShowFavsOnly] = useState(false);

  const favouriteSet = useMemo(() => new Set(favoriteCourses), [favoriteCourses]);

  const coursesDeduped = useMemo(() => {
    const m = new Map<string, CourseInfo>();
    const list = Array.isArray(courses) ? courses : [];
    for (const c of list) {
      const code = normalizeCode(c.code);
      if (!code) continue;
      if (!m.has(code)) {
        m.set(code, {
          ...c,
          code,
          offered: Array.isArray(c.offered) ? c.offered : [],
        });
      }
    }
    const hasRatings = Object.keys(flowRatings).length > 0;
    return [...m.values()].sort((a, b) => {
      if (hasRatings) {
        const diff = (flowRatings[b.code]?.filled_count ?? 0) - (flowRatings[a.code]?.filled_count ?? 0);
        if (diff !== 0) return diff;
      }
      return a.code.localeCompare(b.code);
    });
  }, [courses, flowRatings]);

  const completedSet = useMemo(() => new Set(completedCourses.map(normalizeCode)), [completedCourses]);
  const plannedSet = useMemo(() => new Set(Object.values(semesterPlans).flat().map(normalizeCode)), [semesterPlans]);

  const programCourseCodes = useMemo(() => {
    const set = new Set<string>();
    const majorEntry = program.id ? programs[program.id] : null;
    const isMathStudies = majorEntry?.name.includes('Mathematical Studies') ?? false;
    const coreId = isMathStudies ? 'core-bmath-mathstudies' : 'core-bmath';
    const coreEntry = programs[coreId];
    if (coreEntry) {
      const patched = patchCoreBmathRequirements(coreEntry.requirements ?? [], program);
      const ch = patched[0]?.children;
      if (ch) for (const n of ch) for (const c of courseCodes(n)) set.add(normalizeCode(c));
    }
    const ids = [program.id, program.doubleMajorId, program.minorId, ...program.extras.map(e => e.id)].filter(Boolean) as string[];
    for (const id of ids) {
      const entry = programs[id];
      if (!entry) continue;
      for (const n of topLevelNodes(entry)) for (const c of courseCodes(n)) set.add(normalizeCode(c));
    }
    return set;
  }, [program]);

  const getReq = useCallback((code: string): string => {
    const n = normalizeCode(code);
    if (programCourseCodes.has(n)) return 'Required';
    if (/^PD\d/i.test(n)) return 'PD courses';
    const subj = getSubject(n);
    if (MATH_FACULTY_SUBJECTS.has(subj)) return 'Math elective';
    return 'Non-Math elective';
  }, [programCourseCodes]);

  const getStatus = useCallback((code: string): CourseStatus => {
    const n = normalizeCode(code);
    if (completedSet.has(n)) return 'done';
    if (plannedSet.has(n)) return 'planned';
    return 'available';
  }, [completedSet, plannedSet]);

  const subjects = useMemo(() => {
    const s = new Set<string>();
    for (const c of coursesDeduped) {
      const sub = getSubject(c.code);
      if (sub) s.add(sub);
    }
    return [...s].sort();
  }, [coursesDeduped]);



  const filtered = useMemo(() => {
    const raw = deferredSearch.trim().toLowerCase();
    const qNoSpace = raw.replace(/\s+/g, '');
    const qWords = raw.split(/\s+/).filter(Boolean);
    return coursesDeduped.filter(c => {
      if (filterSubject && getSubject(c.code) !== filterSubject) return false;
      if (filterStatus && getStatus(c.code) !== filterStatus) return false;
      if (showFavsOnly && !favouriteSet.has(c.code)) return false;
      if (qNoSpace) {
        const codeMatch = c.code.toLowerCase().replace(/\s+/g, '').includes(qNoSpace);
        const nameLower = c.name.toLowerCase();
        const nameMatch = qWords.every(w => nameLower.includes(w));
        if (!codeMatch && !nameMatch) return false;
      }
      return true;
    });
  }, [coursesDeduped, deferredSearch, filterSubject, filterStatus, showFavsOnly, favouriteSet, getStatus]);

  const filteredLenRef = useRef(0);
  filteredLenRef.current = filtered.length;

  useEffect(() => {
    setVisibleCount(PAGE);
  }, [deferredSearch, filterSubject, filterStatus]);

  useEffect(() => {
    const root = listScrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || filtered.length <= visibleCount) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount(v => {
          const cap = filteredLenRef.current;
          if (cap <= 0) return PAGE;
          return Math.min(v + PAGE, cap);
        });
      },
      { root, rootMargin: '400px' }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [filtered.length, visibleCount]);

  const visible = filtered.slice(0, visibleCount);
  const selectedReq = selectedCourse ? getReq(selectedCourse.code) : '';

  useEffect(() => {
    const code = selectedCourse?.code;
    if (!code) return;
    const n = normalizeCode(code);
    if (!coursesDeduped.some(c => c.code === n)) setSelectedCourse(null);
  }, [coursesDeduped, selectedCourse?.code]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

      <div
        style={{
          padding: isMobile ? '20px 16px 0' : '32px 48px 0',
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '20px',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ fontFamily: SANS, fontSize: isMobile ? '36px' : '60px', color: '#000', lineHeight: 1, margin: 0, fontWeight: 400, animation: 'headingReveal 0.5s ease forwards' }}>
          {catalogView === 'courses' ? 'course catalog...' : 'degree plans...'}
        </h1>
        <SlidingToggle options={CATALOG_VIEW_OPTIONS} value={catalogView} onChange={setCatalogView} />
      </div>

      {catalogView === 'courses' && (
      <div style={{ padding: isMobile ? '10px 16px' : '14px 48px', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: '1px solid #d9d9d9', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <select
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
            disabled={coursesStatus !== 'ok'}
            style={{ appearance: 'none', background: '#ececec', border: 'none', borderRadius: '15px', padding: '8px 36px 8px 16px', fontFamily: SANS, fontSize: '15px', color: filterSubject ? '#000' : '#858080', cursor: coursesStatus === 'ok' ? 'pointer' : 'default', outline: 'none' }}
          >
            <option value="">all subjects</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ position: 'absolute', right: '14px', pointerEvents: 'none', color: '#858080' }}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            disabled={coursesStatus !== 'ok'}
            style={{ appearance: 'none', background: '#ececec', border: 'none', borderRadius: '15px', padding: '8px 36px 8px 16px', fontFamily: SANS, fontSize: '15px', color: filterStatus ? '#000' : '#858080', cursor: coursesStatus === 'ok' ? 'pointer' : 'default', outline: 'none' }}
          >
            <option value="">all status</option>
            <option value="done">done</option>
            <option value="planned">planned</option>
            <option value="available">available</option>
          </select>
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ position: 'absolute', right: '14px', pointerEvents: 'none', color: '#858080' }}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ background: '#ececec', borderRadius: '15px', padding: '8px 20px', flex: 1, minWidth: '200px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            disabled={coursesStatus !== 'ok'}
            placeholder={coursesStatus === 'loading' ? 'loading courses...' : coursesStatus === 'error' ? 'catalog unavailable' : '⌕  search courses...'}
            style={{ border: 'none', background: 'transparent', fontFamily: SANS, fontSize: '15px', color: '#000', outline: 'none', width: '100%' }}
          />
        </div>
        <svg
          onClick={() => setShowFavsOnly(f => !f)}
          viewBox="0 0 24 24" fill="currentColor"
          style={{ width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0, color: showFavsOnly ? PINK : '#c0c0c0' }}
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
        <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>
          {coursesStatus === 'ok'
            ? `${visible.length.toLocaleString()}${filtered.length > visible.length ? ` / ${filtered.length.toLocaleString()}` : ''} shown`
            : coursesStatus === 'error'
              ? 'unavailable'
              : '…'}
        </span>
      </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {catalogView === 'degree-plans' && (
          <DegreePlansCatalog program={program} onNavigate={onNavigate} />
        )}
        {/* {catalogView === 'folders' && <FoldersPage />} folders feature disabled */}
        {catalogView === 'courses' && coursesStatus === 'loading' && (
          <div style={{ padding: '48px', fontFamily: SANS, fontSize: '18px', color: '#858080' }}>loading course catalog…</div>
        )}
        {catalogView === 'courses' && coursesStatus === 'error' && (
          <div style={{ padding: '32px 48px', fontFamily: SANS, fontSize: '18px', color: '#858080', maxWidth: '560px', lineHeight: 1.5 }}>
            couldn't load the course catalog. try refreshing the page.
          </div>
        )}
        {catalogView === 'courses' && coursesStatus === 'ok' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
            {/* List — hidden on mobile when a course is selected */}
            {(!isMobile || !selectedCourse) && (
              <div
                ref={listScrollRef}
                style={{ flex: 1, minWidth: 0, minHeight: 0, padding: isMobile ? '12px 16px' : '16px 48px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
              >
                {filtered.length === 0 && (
                  <div style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', padding: '24px 0' }}>
                    {coursesDeduped.length === 0
                      ? 'couldn\'t load the course catalog. try refreshing the page.'
                      : 'No courses match your filters.'}
                  </div>
                )}
                {visible.map(c => (
                  <CourseRow
                    key={c.code}
                    course={c}
                    status={getStatus(c.code)}
                    req={getReq(c.code)}
                    rating={flowRatings[c.code] ?? null}
                    isSelected={selectedCourse ? normalizeCode(selectedCourse.code) === c.code : false}
                    onClick={() => setSelectedCourse(selectedCourse && normalizeCode(selectedCourse.code) === c.code ? null : c)}
                  />
                ))}
                {filtered.length > visible.length && (
                  <div ref={loadMoreRef} style={{ padding: '16px', fontFamily: MONO, fontSize: '13px', color: '#858080', textAlign: 'center' }}>
                    Scroll for more…
                  </div>
                )}
              </div>
            )}
            {selectedCourse && (
              <CourseDetail
                course={selectedCourse}
                req={selectedReq}
                currentTerm={CURRENT_TERM}
                rating={flowRatings[selectedCourse.code] ?? null}
                onClose={() => setSelectedCourse(null)}
                isMobile={isMobile}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
