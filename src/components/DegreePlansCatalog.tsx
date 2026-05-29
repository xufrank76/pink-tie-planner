'use client';

import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import rawPrograms from '@/src/data/requirements-filtered.json';
import { satisfies, isAmathSubjectConcentration, parseConcentrationSubjects, extractAdditionalN, unitsToCoursesFromText, extractSubjectsFromText, courseCodes } from '@/src/lib/requirementEvaluator';
import type { ReqNode } from '@/src/lib/requirementEvaluator';
import type { UserProgram } from '@/src/types/program';
import type { PageId } from '@/src/components/Sidebar';
import { useApp } from '@/src/context/AppContext';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';
const PINK = '#c60078';

const EXCLUDE_IDS = new Set(['core-bmath', 'core-bmath-mathstudies']);

type TypeFilter = 'all' | 'honours' | 'minor' | 'specialization';

type ProgramEntry = {
  id: string;
  name: string;
  faculty: string;
  code: string;
  isMinor?: boolean;
  isSpecialization?: boolean;
  isMathFaculty?: boolean;
  minCourses?: number;
  graduationRequirementsHtml?: string;
  additionalConstraintsHtml?: string;
  rawHtml?: string;
  requirements: ReqNode[];
};

const SPEC_PARENT: Record<string, string> = {
  'MS':    'Mathematical Studies',
  'ACTSC': 'Actuarial Science',
  'AMATH': 'Applied Mathematics',
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


function countRequiredCourses(node: ReqNode): number {
  switch (node.type) {
    case 'COURSE': return node.code ? 1 : 0;
    case 'AND': {
      const t = (node.text ?? '').trimStart();
      // Pool lists and constraint blocks — check only the header (text starts with these phrases)
      if (/^choose\s+any/i.test(t)) return 0;
      if (/^complete\s+no\s+more\s+than/i.test(t)) return 0;
      // Leading descriptive ADDITIONAL ("Complete N courses from the following choices:")
      const leadingLabel = (node.children ?? []).find(c => c.type === 'ADDITIONAL' && c.n == null && (c.children ?? []).length === 0);
      if (leadingLabel) {
        const nMatch = (leadingLabel.text ?? '').match(/Complete\s+(\d+(?:\.\d+)?)\s+(courses?|units?)\s+from/i);
        if (nMatch) {
          const rawN = parseFloat(nMatch[1]);
          return /units?/i.test(nMatch[2]) ? Math.round(rawN / 0.5) : Math.round(rawN);
        }
      }
      return (node.children ?? []).reduce((s, c) => s + countRequiredCourses(c), 0);
    }
    case 'OR': return 1;
    case 'N_OF': return node.n ?? 1;
    case 'ADDITIONAL': {
      if (node.n != null) return node.n;
      return extractAdditionalN(node.text ?? '') ?? 0;
    }
    default: return 0;
  }
}

function countRequiredFromEntry(entry: { requirements: ReqNode[]; isMinor?: boolean; isSpecialization?: boolean; minCourses?: number }): number {
  const roots = entry.requirements;
  const nodes = roots.length === 1 && roots[0].type === 'AND' && roots[0].children ? roots[0].children : roots;
  const computed = nodes.reduce((s, n) => s + countRequiredCourses(n), 0);
  // Apply minCourses floor for minors and standalone specializations (< 20 courses).
  // BMath-component specializations have minCourses = full degree, so skip those.
  const useFloor = entry.isMinor || (entry.isSpecialization && (entry.minCourses ?? 0) < 20);
  const floor = useFloor ? (entry.minCourses ?? (entry.isMinor ? 8 : 0)) : 0;
  return floor > 0 ? Math.max(computed, floor) : computed;
}

function formatAdditional(text: string): string {
  const fromListRef = text.match(/Complete\s+(\d+)\s+additional\s+courses?\s+from\s+the\s+options?\s+in\s+List\s*\d+/i);
  if (fromListRef) {
    const n = parseInt(fromListRef[1], 10);
    return `Complete ${n} additional ${n === 1 ? 'course' : 'courses'} from the following:`;
  }
  const subjects = extractSubjectsFromText(text);
  const subject = subjects.size === 1 ? [...subjects][0] : '';
  const levelNums = [...text.matchAll(/\b([1-4])00[-–]/g)].map(m => m[1]);
  const levelStr = levelNums.map(l => `${l}XX`).join('/');

  const unitMatch = text.match(/\b(\d+(?:\.\d+)?)\s+(?:additional\s+)?units?\b/i);
  if (unitMatch) {
    const n = Math.round(parseFloat(unitMatch[1]) * 2);
    const plural = n === 1 ? 'course' : 'courses';
    const isAdditional = /additional/i.test(text);
    const add = isAdditional ? ' additional' : '';
    if (subject && levelStr) return `${n}${add} ${subject} ${levelStr} ${plural}`;
    if (subject) return `${n}${add} ${subject} ${plural}`;
    return `${n}${add} ${plural}`;
  }

  const additionalMatch = text.match(/Complete\s+(\d+(?:\.\d+)?)\s+additional/i);
  if (additionalMatch) {
    const n = additionalMatch[1];
    const plural = parseInt(n) === 1 ? 'course' : 'courses';
    if (subject && levelStr) return `${n} additional ${subject} ${levelStr} ${plural}`;
    if (subject) return `${n} additional ${subject} ${plural}`;
    if (subjects.size > 1) return `${n} additional ${plural}`;
    return text;
  }
  if (subject && levelStr) return `${subject} ${levelStr}`;
  return text;
}

function nodeHeader(node: ReqNode): string {
  const children = node.children ?? [];
  if (children.length === 0) return (node.text ?? '').replace(/\s+/g, ' ').trim();
  const raw = (node.text ?? '').replace(/\s+/g, ' ').trim();
  const firstChildText = (children[0].text ?? '').replace(/\s+/g, ' ').trim();
  const idx = firstChildText ? raw.indexOf(firstChildText) : -1;
  const header = idx > 0 ? raw.slice(0, idx).trim() : raw;
  return header.replace(/:$/, '').trim();
}

function CheckBox({ done, inPlan }: { done: boolean; inPlan: boolean }) {
  const filled = done || inPlan;
  return (
    <div style={{ width: '20px', height: '20px', borderRadius: '5px', background: filled ? '#000' : '#d9d9d9', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {filled && <span style={{ color: '#fff', fontSize: '12px', lineHeight: 1 }}>✓</span>}
    </div>
  );
}

function KualiHtml({ html }: { html: string }) {
  // Parse <ul>/<ol> + <li> from Kuali HTML into styled React elements.
  // Handles one level of nesting. Ignores everything outside list items.
  function parseList(src: string, depth = 0): ReactNode[] {
    const items: ReactNode[] = [];
    const liRe = /<li>([\s\S]*?)<\/li>/gi;
    let m: RegExpExecArray | null;
    while ((m = liRe.exec(src)) !== null) {
      const inner = m[1];
      const nestedMatch = inner.match(/<[uo]l>([\s\S]*?)<\/[uo]l>/i);
      const text = inner.replace(/<[^>]+>/g, '').trim();
      const nested = nestedMatch ? parseList(nestedMatch[1], depth + 1) : null;
      items.push(
        <div key={items.length} style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: depth > 0 ? '14px' : 0 }}>
          {text && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ color: '#858080', flexShrink: 0 }}>-</span>
              <span>{text}</span>
            </div>
          )}
          {nested && <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{nested}</div>}
        </div>
      );
    }
    return items;
  }
  const items = parseList(html);
  return (
    <div style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {items}
    </div>
  );
}

function ReqNodeSimple({ node, completedSet, planSet, depth = 0 }: {
  node: ReqNode; completedSet: Set<string>; planSet: Set<string>; depth?: number;
}) {
  const children = node.children ?? [];
  const done = satisfies(node, completedSet);
  const inPlan = !done && satisfies(node, planSet);
  const shared = { completedSet, planSet, depth: depth + 1 };

  if (node.type === 'COURSE' && node.code) {
    const raw = (node.text ?? '').replace(/ \(0\.\d+\)/g, '').trim();
    const dashIdx = raw.indexOf(' - ');
    const name = dashIdx >= 0 ? raw.slice(dashIdx + 3) : '';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <CheckBox done={done} inPlan={inPlan} />
        <span style={{ fontFamily: MONO, fontSize: '13px', color: '#000', flexShrink: 0 }}>{node.code}</span>
        {name && <span style={{ fontFamily: SANS, fontSize: '13px', color: '#858080' }}>{name}</span>}
        {inPlan && <span style={{ fontFamily: SANS, fontSize: '11px', color: '#858080', background: '#d9d9d9', borderRadius: '40px', padding: '2px 8px', flexShrink: 0 }}>planned</span>}
      </div>
    );
  }

  if (node.type === 'ADDITIONAL' && isAmathSubjectConcentration(node)) {
    const subjects = parseConcentrationSubjects(node);
    const n = node.n ?? 4;
    const combined = new Set([...completedSet, ...planSet]);
    const groups = new Map<string, string[]>();
    for (const code of combined) {
      const subj = code.match(/^([A-Z]+)/)?.[1] ?? '';
      if (!subjects.has(subj)) continue;
      if (!groups.has(subj)) groups.set(subj, []);
      groups.get(subj)!.push(code);
    }
    let bestSubj = '';
    let bestGroup: string[] = [];
    for (const [subj, g] of groups.entries()) if (g.length > bestGroup.length) { bestGroup = g; bestSubj = subj; }
    const filledCodes = bestGroup.slice(0, n);
    const SUBJS = [...subjects].sort().join(', ');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', fontStyle: 'italic' }}>
            Subject concentration: {n} courses, all same subject code{bestSubj ? ` (${bestSubj})` : ''}
          </span>
          <span style={{ fontFamily: SANS, fontSize: '11px', color: '#858080' }}>{SUBJS}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {Array.from({ length: n }).map((_, i) => {
            const code = filledCodes[i];
            const isDone = code ? completedSet.has(code) : false;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckBox done={isDone} inPlan={!isDone && !!code} />
                {code
                  ? <div style={{ background: isDone ? '#000' : '#858080', color: '#fff', borderRadius: '40px', padding: '0 12px', height: '30px', display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: '13px' }}>{code}</div>
                  : <div style={{ width: '80px', height: '30px', borderRadius: '40px', background: '#d9d9d9' }} />}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (node.type === 'ADDITIONAL') {
    const text = node.text ?? '';
    const label = formatAdditional(text.trim());
    const subjects = extractSubjectsFromText(text);
    const levelNums = [...text.matchAll(/\b([1-4])00[-–]/g)].map(m => parseInt(m[1]));
    const orHigher = /or\s+higher/i.test(text);
    let n: number | null = node.n ?? extractAdditionalN(text) ?? null;
    if (subjects.size > 0 && n != null) {
      const matchesCriteria = (code: string) => {
        const subj = code.match(/^([A-Z]+)/)?.[1] ?? '';
        if (!subjects.has(subj)) return false;
        if (levelNums.length === 0) return true;
        const lvl = Math.floor(parseInt(code.replace(/^[A-Z]+/, '') || '0') / 100);
        return orHigher ? lvl >= levelNums[0] : levelNums.includes(lvl);
      };
      const combined = new Set([...completedSet, ...planSet]);
      const filledCodes = [...combined].filter(c => matchesCriteria(c)).slice(0, n);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', fontStyle: 'italic' }}>{label}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Array.from({ length: n }).map((_, i) => {
              const code = filledCodes[i];
              const isDone = code ? completedSet.has(code) : false;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckBox done={isDone} inPlan={!isDone && !!code} />
                  {code
                    ? <div style={{ background: isDone ? '#000' : '#858080', color: '#fff', borderRadius: '40px', padding: '0 12px', height: '30px', display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: '13px' }}>{code}</div>
                    : <div style={{ width: '80px', height: '30px', borderRadius: '40px', background: '#d9d9d9' }} />}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return <div style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', fontStyle: 'italic' }}>{label}</div>;
  }

  if (children.length > 0) {
    // Special case: ADDITIONAL "...from courses listed below" + OR sibling — merge into combined slots
    const addChild = children.find(c => c.type === 'ADDITIONAL' && /courses?\s+listed\s+below/i.test(c.text ?? ''));
    const orChild = addChild ? children.find(c => c !== addChild && (c.type === 'OR' || (c.type === 'AND' && /^choose\s+any/i.test(c.text ?? '')))) : undefined;
    if (addChild && orChild) {
      const listedCodes = new Set(courseCodes(orChild));
      const text = addChild.text ?? '';
      const n = addChild.n ?? extractAdditionalN(text) ?? 2;
      const subjects = extractSubjectsFromText(text);
      const levelNums = [...text.matchAll(/\b([1-4])00[-–]/g)].map(m => parseInt(m[1]));
      const matchesCriteria = (code: string) => {
        if (listedCodes.has(code)) return true;
        const subj = code.match(/^([A-Z]+)/)?.[1] ?? '';
        if (!subjects.has(subj)) return false;
        if (levelNums.length === 0) return true;
        const lvl = Math.floor(parseInt(code.replace(/^[A-Z]+/, '') || '0') / 100);
        return levelNums.includes(lvl);
      };
      const combined = new Set([...completedSet, ...planSet]);
      const filledCodes = [...combined].filter(c => matchesCriteria(c)).slice(0, n);
      const label = formatAdditional(text.trim());
      const addDone = filledCodes.filter(c => completedSet.has(c)).length >= n;
      const addInPlan = !addDone && filledCodes.length >= n;
      const otherChildren = children.filter(c => c !== addChild && c !== orChild);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {depth === 0 && <CheckBox done={addDone} inPlan={addInPlan} />}
            <span style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', fontStyle: 'italic' }}>{label}</span>
          </div>
          <div style={{ marginLeft: depth === 0 ? '38px' : '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Array.from({ length: n }).map((_, i) => {
              const code = filledCodes[i];
              const isDone = code ? completedSet.has(code) : false;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckBox done={isDone} inPlan={!isDone && !!code} />
                  {code
                    ? <div style={{ background: isDone ? '#000' : '#858080', color: '#fff', borderRadius: '40px', padding: '0 12px', height: '30px', display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: '13px' }}>{code}</div>
                    : <div style={{ width: '80px', height: '30px', borderRadius: '40px', background: '#d9d9d9' }} />}
                </div>
              );
            })}
            {(orChild.children ?? []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em' }}>or from</span>
                {(orChild.children ?? []).map((c, i) => <ReqNodeSimple key={i} node={c} {...shared} />)}
              </div>
            )}
            {otherChildren.map((c, i) => <ReqNodeSimple key={i} node={c} {...shared} />)}
          </div>
        </div>
      );
    }

    const header = nodeHeader(node);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {depth === 0 && <CheckBox done={done} inPlan={inPlan} />}
          {header && (
            <div style={{ fontFamily: SANS, fontSize: '13px', color: depth === 0 ? '#000' : '#858080', fontStyle: depth > 0 ? 'italic' : 'normal' }}>
              {header}
            </div>
          )}
        </div>
        <div style={{ marginLeft: depth === 0 ? '38px' : '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {children.map((c, i) => <ReqNodeSimple key={i} node={c} {...shared} />)}
        </div>
      </div>
    );
  }

  const text = (node.text ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {depth === 0 && <CheckBox done={done} inPlan={inPlan} />}
      <div style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', fontStyle: 'italic' }}>{text}</div>
    </div>
  );
}

/* Folders feature — disabled for now
function FolderPopoverItems({ items }: { items: ReactNode }) {
  return (
    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '6px', zIndex: 200, minWidth: '190px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
      {items}
    </div>
  );
}

function FolderToggleProgramButton({ programId }: { programId: string }) {
  const { folders, addProgramToFolder, removeProgramFromFolder } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const inAnyFolder = folders.some(f => f.programs.includes(programId));
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <svg
        width={20} height={20} viewBox="0 0 24 24"
        fill={inAnyFolder ? PINK : 'none'}
        stroke={inAnyFolder ? PINK : '#c0c0c0'}
        strokeWidth={1.8}
        onClick={e => { e.stopPropagation(); setOpen(s => !s); }}
        style={{ cursor: 'pointer', flexShrink: 0 }}
      >
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      </svg>
      {open && (
        <FolderPopoverItems items={folders.map(f => {
          const checked = f.programs.includes(programId);
          return (
            <div
              key={f.id}
              onClick={e => { e.stopPropagation(); checked ? removeProgramFromFolder(f.id, programId) : addProgramToFolder(f.id, programId); }}
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
        })} />
      )}
    </div>
  );
}
*/

function ProgramRow({ entry, isSelected, isYours, onClick }: {
  entry: ProgramEntry;
  isSelected: boolean;
  isYours: boolean;
  onClick: () => void;
}) {
  const type = programType(entry);
  const nCourses = countRequiredFromEntry(entry);
  const title = displayTitle(entry);
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
        <div style={{ fontFamily: SANS, fontSize: '18px', color: '#000' }}>{title}</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
          <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '3px 10px', fontFamily: MONO, fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {type}
          </div>
          <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {nCourses > 0 ? `${nCourses} courses · ` : ''}{entry.faculty}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px', flexShrink: 0 }}>
        {isYours && (
          <div style={{ background: PINK, color: '#fff', borderRadius: '15px', padding: '6px 14px', fontFamily: SANS, fontSize: '14px', whiteSpace: 'nowrap' }}>
            your program
          </div>
        )}
        {/* <FolderToggleProgramButton programId={entry.id} /> folders feature disabled */}
      </div>
    </div>
  );
}

function ProgramDetail({ entry, isYours, onNavigate, completedSet, planSet, onClose }: {
  entry: ProgramEntry;
  isYours: boolean;
  onNavigate: (page: PageId) => void;
  completedSet: Set<string>;
  planSet: Set<string>;
  onClose: () => void;
}) {
  const type = programType(entry);
  const nCourses = countRequiredFromEntry(entry);
  const roots = entry.requirements ?? [];
  const reqNodes = roots.length === 1 && roots[0].type === 'AND' && roots[0].children ? roots[0].children : roots;
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);

  async function sendFeedback() {
    setFeedbackSending(true);
    setFeedbackError(false);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: feedbackText,
          context: { program: `${displayTitle(entry)} (${entry.id})`, page: 'catalog' },
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
  }

  return (
    <div style={{ width: 'min(400px, 40vw)', minWidth: '280px', borderLeft: '1px solid #d9d9d9', display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0, minHeight: 0 }}>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', marginBottom: '4px' }}>{entry.faculty}</div>
            <div style={{ fontFamily: SANS, fontSize: '24px', color: '#000', lineHeight: 1.2, fontWeight: 400, marginTop: '4px' }}>{displayTitle(entry)}</div>
          </div>
          <div onClick={onClose} style={{ cursor: 'pointer', color: '#858080', fontFamily: MONO, fontSize: '20px', lineHeight: 1, padding: '0 0 0 12px', flexShrink: 0 }}>×</div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '4px 12px', fontFamily: MONO, fontSize: '12px' }}>{type}</span>
          {nCourses > 0 && <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>{nCourses} courses</span>}
          {isYours && (
            <span style={{ background: PINK, color: '#fff', borderRadius: '15px', padding: '4px 12px', fontFamily: SANS, fontSize: '12px', fontWeight: 600 }}>your program</span>
          )}
        </div>

        {(entry.graduationRequirementsHtml || reqNodes.length > 0 || entry.additionalConstraintsHtml) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {entry.graduationRequirementsHtml && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', borderBottom: '1px solid #e8e8e8', paddingBottom: '6px' }}>Graduation Requirements</div>
                <KualiHtml html={entry.graduationRequirementsHtml} />
              </div>
            )}
            {reqNodes.length > 0 && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', borderBottom: '1px solid #e8e8e8', paddingBottom: '6px' }}>Course Requirements</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {reqNodes.map((n, i) => <ReqNodeSimple key={i} node={n} completedSet={completedSet} planSet={planSet} />)}
                </div>
              </div>
            )}
            {entry.additionalConstraintsHtml && (
              <div>
                <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', borderBottom: '1px solid #e8e8e8', paddingBottom: '6px' }}>Additional Constraints</div>
                <KualiHtml html={entry.additionalConstraintsHtml} />
              </div>
            )}
          </div>
        )}

        {isYours && (
          <div style={{ borderTop: '1px solid #d9d9d9', paddingTop: '16px' }}>
            <div
              onClick={() => onNavigate('degree-plan')}
              style={{
                background: '#000',
                color: '#fff',
                borderRadius: '15px',
                padding: '12px 20px',
                fontFamily: SANS,
                fontSize: '16px',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              view your plan →
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid #ececec', paddingTop: '16px' }}>
          {!feedbackOpen ? (
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: SANS, fontSize: '13px', color: '#858080', padding: 0, display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <span style={{ fontSize: '15px', lineHeight: 1 }}>⚑</span> report an issue with this program
            </button>
          ) : feedbackSent ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontFamily: SANS, fontSize: '13px', color: '#2a7a2a', margin: 0 }}>
                report received — thanks!
              </p>
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
              <p style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                Report an issue
              </p>
              <textarea
                autoFocus
                value={feedbackText}
                onChange={e => { setFeedbackText(e.target.value); setFeedbackError(false); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                placeholder="what's wrong? (e.g. missing course, wrong requirement...)"
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
                  onClick={sendFeedback}
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

export default function DegreePlansCatalog({
  program,
  onNavigate,
}: {
  program: UserProgram;
  onNavigate: (page: PageId) => void;
}) {
  const { completedCourses, semesterPlans } = useApp();
  const completedSet = useMemo(() => new Set(completedCourses), [completedCourses]);
  const planSet = useMemo(() => {
    const s = new Set<string>();
    for (const codes of Object.values(semesterPlans)) for (const c of codes) s.add(c);
    return s;
  }, [semesterPlans]);

  const allPrograms = useMemo(() => {
    const raw = rawPrograms as unknown as Record<string, ProgramEntry>;
    const rows: ProgramEntry[] = [];
    for (const [id, v] of Object.entries(raw)) {
      if (!v || EXCLUDE_IDS.has(id)) continue;
      if (v.isMathFaculty !== true && !v.isMinor) continue;
      rows.push({ ...v, id: v.id ?? id });
    }
    return rows.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
  }, []);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const userClosedRef = useRef(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPrograms.filter(p => {
      if (typeFilter === 'minor' && !p.isMinor) return false;
      if (typeFilter === 'specialization' && !p.isSpecialization) return false;
      if (typeFilter === 'honours' && (p.isMinor || p.isSpecialization)) return false;
      if (q && !displayTitle(p).toLowerCase().includes(q) && !p.faculty.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allPrograms, typeFilter, search]);

  useEffect(() => {
    if (userClosedRef.current) { userClosedRef.current = false; return; }
    if (selectedId && filtered.some(p => p.id === selectedId)) return;
    const pick = program.id && filtered.some(p => p.id === program.id) ? program.id : (filtered[0]?.id ?? null);
    setSelectedId(pick);
  }, [filtered, program.id, selectedId]);

  useEffect(() => {
    userClosedRef.current = false;
    setSelectedId(null);
  }, [typeFilter, search]);

  const selected = useMemo(() => filtered.find(p => p.id === selectedId) ?? null, [filtered, selectedId]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <div style={{ padding: '14px 48px', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: '1px solid #d9d9d9', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            style={{ appearance: 'none', background: '#ececec', border: 'none', borderRadius: '15px', padding: '8px 36px 8px 16px', fontFamily: SANS, fontSize: '15px', color: typeFilter !== 'all' ? '#000' : '#858080', cursor: 'pointer', outline: 'none' }}
          >
            <option value="all">all types</option>
            <option value="honours">major</option>
            <option value="minor">minor</option>
            <option value="specialization">specialization</option>
          </select>
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ position: 'absolute', right: '14px', pointerEvents: 'none', color: '#858080' }}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ background: '#ececec', borderRadius: '15px', padding: '8px 20px', flex: 1, minWidth: '200px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="⌕  search programs..."
            style={{ border: 'none', background: 'transparent', fontFamily: SANS, fontSize: '15px', color: '#000', outline: 'none', width: '100%' }}
          />
        </div>
        <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>
          {filtered.length.toLocaleString()} shown
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, padding: '16px 48px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {filtered.length === 0 && (
            <div style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', padding: '24px 0' }}>
              No programs match your filters.
            </div>
          )}
          {filtered.map(p => (
            <ProgramRow
              key={p.id}
              entry={p}
              isSelected={p.id === selectedId}
              isYours={p.id === program.id}
              onClick={() => { userClosedRef.current = p.id === selectedId; setSelectedId(p.id === selectedId ? null : p.id); }}
            />
          ))}
        </div>
        {selected && (
          <ProgramDetail
            entry={selected}
            isYours={selected.id === program.id}
            onNavigate={onNavigate}
            completedSet={completedSet}
            planSet={planSet}
            onClose={() => { userClosedRef.current = true; setSelectedId(null); }}
          />
        )}
      </div>
    </div>
  );
}
