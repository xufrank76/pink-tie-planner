'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';
import rawAntireqs from '@/src/data/antireqs.json';
import { satisfies, nodeProgress, courseCodes, type ReqNode } from '@/src/lib/requirementEvaluator';
import { getMissingPrereqs, isMathRestricted, parseRequiredLevel, levelNum } from '@/src/lib/prereqCheck';
import { getCurrentTerm, termToNum as termToNumUtil } from '@/src/lib/termUtils';
import { getStudyLabel, computeGradTerm } from '@/src/data/coopSequences';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

const programs = rawPrograms as Record<string, { name: string; requirements: ReqNode[] }>;
const antireqs = rawAntireqs as Record<string, string[]>;

// ── term helpers ────────────────────────────────────────────────────────────

function termToNum(t: string): number { return termToNumUtil(t); }

function nextTerm(t: string): string {
  const s = t[0];
  const yy = parseInt(t.slice(1));
  const pad = (n: number) => String(n).padStart(2, '0');
  if (s === 'W') return `S${pad(yy)}`;
  if (s === 'S') return `F${pad(yy)}`;
  return `W${pad(yy + 1)}`;
}


function buildTermRange(start: string, end: string): string[] {
  const terms: string[] = [];
  let t = start;
  while (termToNum(t) <= termToNum(end)) {
    terms.push(t);
    t = nextTerm(t);
  }
  return terms;
}

// ── requirements helpers ─────────────────────────────────────────────────────

// Plan-aware progress: for OR nodes whose branches have different course counts
// (e.g. OR[MATH247, AND[MATH237+PMATH333]]), picks the planned/completed branch
// so the denominator reflects the actual path being pursued.
function nodeProgressAware(node: ReqNode, completedSet: Set<string>, planSet: Set<string>): { done: number; total: number } {
  switch (node.type) {
    case 'COURSE': {
      if (!node.code) return { done: 0, total: 0 };
      // Weight by credit: 0.5-credit course = 1 unit, 0.25-credit lab = 0.5 units
      const creditStr = (node.text ?? '').match(/\((\d+\.\d+)\)/)?.[1];
      const w = creditStr ? parseFloat(creditStr) / 0.5 : 1;
      return { done: completedSet.has(node.code) ? w : 0, total: w };
    }
    case 'AND': {
      const children = node.children ?? [];
      const sub = children.map(c => nodeProgressAware(c, completedSet, planSet));
      return { done: sub.reduce((s, r) => s + r.done, 0), total: sub.reduce((s, r) => s + r.total, 0) };
    }
    case 'OR': {
      const children = node.children ?? [];
      const branch = children.find(c => satisfies(c, completedSet)) ?? children.find(c => satisfies(c, planSet));
      if (branch) return nodeProgressAware(branch, completedSet, planSet);
      const minTotal = Math.min(...children.map(c => nodeProgressAware(c, completedSet, planSet).total));
      return { done: 0, total: minTotal || 1 };
    }
    case 'N_OF': {
      const n = node.n ?? 1;
      return { done: Math.min((node.children ?? []).filter(c => satisfies(c, completedSet)).length, n), total: n };
    }
    default: return { done: 0, total: 0 };
  }
}

type ReqGroup = {
  title: string; progress: string;
  nodes: ReqNode[]; additional: ReqNode[]; exclusions: ReqNode[];
  additionalAllocations: string[][];  // parallel to additional[], pre-computed
  nodeExcludeCodes: Set<string>;      // requiredCodes + all additional-allocated codes
};

function CheckBox({ done }: { done?: boolean }) {
  return (
    <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: done ? '#000' : '#d9d9d9', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {done && <span style={{ color: '#fff', fontSize: '13px', lineHeight: 1 }}>✓</span>}
    </div>
  );
}

function compositeHeader(node: ReqNode): string {
  if (node.type === 'AND') return 'Complete all of the following:';
  if (node.type === 'OR') return 'Complete 1 of the following:';
  if (node.type === 'N_OF') return `Complete ${node.n} of the following:`;
  return '';
}

function formatAdditional(text: string): string {
  const subject = (text.match(/\b([A-Z]{2,8})\s+courses?/i)?.[1] ?? '').toUpperCase();
  const levelNums = [...text.matchAll(/\b([1-4])00[-–]/g)].map(m => m[1]);
  const levelStr = levelNums.map(l => `${l}XX`).join('/');

  const additionalMatch = text.match(/Complete\s+(\d+)\s+additional/i);
  if (additionalMatch) {
    const n = additionalMatch[1];
    const plural = parseInt(n) === 1 ? 'course' : 'courses';
    if (subject && levelStr) return `${n} additional ${subject} ${levelStr} ${plural}`;
    if (subject) return `${n} additional ${subject} ${plural}`;
    return text;
  }

  // "Complete N SUBJECT course at X-level" (no "additional") → just "SUBJECT XxX/YYY"
  if (subject && levelStr) return `${subject} ${levelStr}`;
  return text;
}

// Unwrap AND/OR wrappers with a single effective child (avoids "Complete all: COURSE_X" nesting)
function unwrapSingle(node: ReqNode): ReqNode {
  if ((node.type === 'AND' || node.type === 'OR') && node.children?.length === 1)
    return unwrapSingle(node.children[0]);
  return node;
}

function isWluOnly(node: ReqNode, planSet: Set<string>): boolean {
  if (node.type === 'ADDITIONAL') {
    const mentioned = [...(node.text ?? '').matchAll(/\b([A-Z]{2,8}\d{3}[A-Z]?)\b/g)].map(m => m[1]);
    return mentioned.length > 0 && mentioned.every(c => c.endsWith('W')) && !mentioned.some(c => planSet.has(c));
  }
  const codes = courseCodes(node);
  return codes.length > 0 && codes.every(c => c.endsWith('W')) && !codes.some(c => planSet.has(c));
}

function ReqNodeView({ node, completedSet, planSet, dim = false, excludeCodes = new Set<string>(), preAllocated }: {
  node: ReqNode; completedSet: Set<string>; planSet: Set<string>; dim?: boolean; excludeCodes?: Set<string>; preAllocated?: string[];
}) {
  const done = satisfies(node, completedSet);
  const inPlan = !done && satisfies(node, planSet);
  const fgDone = dim ? 'rgba(133,128,128,0.55)' : '#000';
  const children = node.children ?? [];

  if (node.type === 'COURSE' && node.code) {
    const raw = (node.text ?? '').replace(/ \(0\.\d+\)/g, '').trim();
    const dashIdx = raw.indexOf(' - ');
    const displayName = dashIdx >= 0 ? raw.slice(dashIdx + 3) : '';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {!dim && <CheckBox done={done || inPlan} />}
        {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
        <span style={{ fontFamily: MONO, fontSize: '14px', color: fgDone, flexShrink: 0 }}>{node.code}</span>
        {displayName && <span style={{ fontFamily: SANS, fontSize: '14px', color: dim ? fgDone : '#555' }}>{displayName}</span>}
        {!dim && inPlan && <span style={{ fontFamily: SANS, fontSize: '11px', color: '#858080', background: '#d9d9d9', borderRadius: '40px', padding: '2px 8px', flexShrink: 0 }}>planned</span>}
      </div>
    );
  }

  // Exclusion note: COURSE node with no code but has children
  if (node.type === 'COURSE' && !node.code && children.length > 0) {
    const headerMatch = (node.text ?? '').match(/^([^:]+:)/);
    const header = headerMatch ? headerMatch[1].trim() : (node.text ?? '').trim();
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontFamily: SANS, fontSize: '13px', color: '#999', fontStyle: 'italic' }}>{header}</span>
        <div style={{ marginLeft: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {children.map((c, i) => <ReqNodeView key={i} node={c} completedSet={completedSet} planSet={planSet} dim />)}
        </div>
      </div>
    );
  }

  if (node.type === 'ADDITIONAL') {
    const text = node.text ?? '';
    const label = formatAdditional(text.trim());
    const subject = text.match(/\b([A-Z]{2,8})\s+courses?/i)?.[1]?.toUpperCase() ?? '';
    const levelNums = [...text.matchAll(/\b([1-4])00[-–]/g)].map(m => parseInt(m[1]));
    const nFromText = text.match(/Complete\s+(\d+)/i)?.[1];
    const n = node.n ?? (nFromText ? parseInt(nFromText) : null);

    // If we can identify subject + count, show checkbox + pill per slot
    if (subject && n != null) {
      const matchesCriteria = (code: string) => {
        if (!code.startsWith(subject)) return false;
        if (levelNums.length === 0) return true;
        const d = parseInt(code.slice(subject.length)[0]);
        return levelNums.includes(d);
      };
      const filledCodes = preAllocated ?? [...planSet].filter(c => matchesCriteria(c) && !excludeCodes.has(c)).slice(0, n);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontFamily: SANS, fontSize: '13px', color: dim ? fgDone : '#888', fontStyle: 'italic' }}>{label}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Array.from({ length: n }).map((_, i) => {
              const code = filledCodes[i];
              const isDone = code ? completedSet.has(code) : false;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckBox done={isDone} />
                  {code ? (
                    <div style={{ background: isDone ? '#000' : '#858080', color: '#fff', borderRadius: '40px', padding: '0 12px', height: '30px', display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: '13px' }}>
                      {code}
                    </div>
                  ) : (
                    <div style={{ width: '80px', height: '30px', borderRadius: '40px', background: '#d9d9d9' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // Fallback for credit-based or unparseable requirements
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        {!dim && <CheckBox done={false} />}
        {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
        <span style={{ fontFamily: SANS, fontSize: '14px', color: dim ? fgDone : '#555', fontStyle: 'italic', paddingTop: '2px' }}>{label}</span>
      </div>
    );
  }

  const sharedChildProps = { completedSet, planSet, excludeCodes };

  // AND: render children flat — no header, no AND-level checkbox
  if (node.type === 'AND') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {children.map((c, i) => (
          <ReqNodeView key={i} node={unwrapSingle(c)} dim={dim} {...sharedChildProps} />
        ))}
      </div>
    );
  }

  // OR / N_OF: filter non-visible (WLU) children, then hide unchosen when done
  const visibleChildren = children.filter(c => !isWluOnly(c, planSet));
  const displayChildren = done
    ? visibleChildren.filter(c => satisfies(c, completedSet))
    : visibleChildren;

  // Single displayable option — render it directly, no header
  if (displayChildren.length <= 1) {
    const only = displayChildren[0] ?? visibleChildren[0];
    if (!only) return null;
    const childDim = dim || (!done && satisfies(node, planSet) && !satisfies(only, planSet));
    return <ReqNodeView node={unwrapSingle(only)} dim={childDim} {...sharedChildProps} />;
  }

  // Multiple options — show choice header + children
  const header = compositeHeader(node);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        {!dim && <CheckBox done={done || inPlan} />}
        {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
        <span style={{ fontFamily: SANS, fontSize: '14px', fontWeight: 500, color: fgDone, paddingTop: '3px' }}>{header}</span>
      </div>
      <div style={{ marginLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {displayChildren.map((c, i) => {
          const childDim = dim || (!done && satisfies(node, planSet) && !satisfies(c, planSet));
          const unwrapped = unwrapSingle(c);
          // AND with multiple courses inside an OR — render with "Complete all the following:" header
          if (unwrapped.type === 'AND' && (unwrapped.children?.length ?? 0) > 1) {
            const andDone = satisfies(unwrapped, completedSet);
            const andInPlan = !andDone && satisfies(unwrapped, planSet);
            const andFg = childDim ? 'rgba(133,128,128,0.55)' : '#000';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  {!childDim && <CheckBox done={andDone || andInPlan} />}
                  {childDim && <div style={{ width: '22px', flexShrink: 0 }} />}
                  <span style={{ fontFamily: SANS, fontSize: '14px', fontWeight: 500, color: andFg, paddingTop: '3px' }}>Complete all the following:</span>
                </div>
                <div style={{ marginLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(unwrapped.children ?? []).map((ac, ai) => (
                    <ReqNodeView key={ai} node={unwrapSingle(ac)} dim={childDim} {...sharedChildProps} />
                  ))}
                </div>
              </div>
            );
          }
          return <ReqNodeView key={i} node={unwrapped} dim={childDim} {...sharedChildProps} />;
        })}
      </div>
    </div>
  );
}

function RequirementGroup({ group, completedSet, planSet }: { group: ReqGroup; completedSet: Set<string>; planSet: Set<string> }) {
  return (
    <div style={{ background: '#ececec', borderRadius: '15px', padding: '16px 20px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontFamily: SANS, fontSize: '20px', color: '#000' }}>{group.title}</div>
        <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '6px 16px', fontFamily: SANS, fontSize: '18px', flexShrink: 0, marginLeft: '12px' }}>
          {group.progress}
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(133,128,128,0.4)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {group.nodes.map((n, i) => <ReqNodeView key={i} node={n} completedSet={completedSet} planSet={planSet} excludeCodes={group.nodeExcludeCodes} />)}
        {group.additional.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(133,128,128,0.2)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {group.additional.map((n, i) => <ReqNodeView key={i} node={n} completedSet={completedSet} planSet={planSet} preAllocated={group.additionalAllocations[i]} />)}
          </div>
        )}
        {group.exclusions.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(133,128,128,0.2)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {group.exclusions.map((n, i) => <ReqNodeView key={i} node={n} completedSet={completedSet} planSet={planSet} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export default function DegreePlan({ onNavigate: _onNavigate }: { onNavigate: (id: import('./Sidebar').PageId) => void }) {
  const [view, setView] = useState<'timeline' | 'requirements'>('timeline');
  const { completedCourses, semesterPlans, addCourseToTerm, removeCourseFromTerm, program } = useApp();

  // timeline state
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState<{ code: string; fromTerm: string | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);

  const setChipDragImage = (e: React.DragEvent, code: string) => {
    const el = document.createElement('div');
    el.textContent = code;
    el.style.cssText = 'position:absolute;left:-9999px;top:-9999px;background:#000;color:#fff;border-radius:40px;padding:0 14px;height:38px;line-height:38px;font-family:"DM Mono",monospace;font-size:14px;white-space:nowrap;';
    document.body.appendChild(el);
    e.dataTransfer.setDragImage(el, el.offsetWidth / 2, 19);
    setTimeout(() => document.body.removeChild(el), 0);
  };

  const currentTerm = useMemo(getCurrentTerm, []);

  const gradTarget = useMemo(() => {
    if (!program.startTerm || !program.coopStream) return '—';
    return computeGradTerm(program.startTerm, program.coopStream) ?? '—';
  }, [program.startTerm, program.coopStream]);

  const terms = useMemo(() => {
    const start = program.startTerm ?? getCurrentTerm();
    let end = gradTarget !== '—' ? gradTarget : start;
    if (end === start) {
      // fallback: 12 terms ahead
      let t = start;
      for (let i = 0; i < 11; i++) t = nextTerm(t);
      end = t;
    }
    return buildTermRange(start, end);
  }, [program.startTerm, gradTarget]);
  const allCourses = useApp().courses;
  const courseInfoMap = useMemo(() => new Map(allCourses.map(c => [c.code, c])), [allCourses]);

  const searchResults = useMemo(() => {
    const q = search.trim().toUpperCase().replace(/\s+/g, '');
    if (!q) return [];
    const qSpaced = q.replace(/([A-Z]+)(\d)/g, '$1 $2');
    type Scored = { c: typeof allCourses[0]; score: number };
    const scored: Scored[] = [];
    for (const c of allCourses) {
      if (c.code.replace(/([A-Z]+)(\d)/g, '$1 $2').startsWith(qSpaced) || c.code.startsWith(q)) {
        scored.push({ c, score: 0 });
      } else if (q.length >= 3 && c.name.toUpperCase().includes(q)) {
        scored.push({ c, score: 1 });
      }
    }
    return scored
      .sort((a, b) => a.score - b.score || a.c.code.localeCompare(b.c.code))
      .slice(0, 30)
      .map(x => x.c);
  }, [search, allCourses]);

  function handleDrop(term: string) {
    if (!dragging) return;
    if (dragging.fromTerm && dragging.fromTerm !== term) removeCourseFromTerm(dragging.fromTerm, dragging.code);
    if (!(semesterPlans[term] ?? []).includes(dragging.code)) addCourseToTerm(term, dragging.code);
    setDragging(null);
    setDropTarget(null);
  }

  // requirements state
  // A course is "completed" only if it's NOT assigned to a future term.
  // Courses in future semester slots are "planned" — they appear in planSet but not completedSet,
  // so OR nodes still show all alternatives rather than collapsing to the planned choice.
  const futureTermCodes = useMemo(() => {
    const currentN = termToNum(currentTerm);
    return new Set(
      Object.entries(semesterPlans)
        .filter(([t]) => termToNum(t) >= currentN)
        .flatMap(([, cs]) => cs)
    );
  }, [semesterPlans, currentTerm]);
  const completedSet = useMemo(
    () => new Set(completedCourses.filter(c => !futureTermCodes.has(c))),
    [completedCourses, futureTermCodes]
  );
  const planSet = new Set([...completedCourses, ...Object.values(semesterPlans).flat()]);

  const planIssues = useMemo(() => {
    const issues = new Map<string, { antireqs: string[]; prereqs: string[]; restricted: boolean; requiredLevel: string | null }>();
    const allPlanned = Object.values(semesterPlans).flat();
    const allTaken = new Set([...completedCourses, ...allPlanned]);
    const courseTermNum = new Map<string, number>();
    for (const [term, codes] of Object.entries(semesterPlans)) {
      for (const code of codes) courseTermNum.set(code, termToNum(term));
    }
    for (const [term, codes] of Object.entries(semesterPlans)) {
      const termN = termToNum(term);
      const studentLevel = (program.startTerm && program.coopStream)
        ? (() => { const l = getStudyLabel(term, program.startTerm!, program.coopStream!); return l?.startsWith('WT') ? null : l ?? null; })()
        : null;
      const availableByThen = new Set([
        ...completedCourses,
        ...allPlanned.filter(c => (courseTermNum.get(c) ?? Infinity) <= termN),
      ]);
      for (const code of codes) {
        const prereqStr = courseInfoMap.get(code)?.prereqs ?? '';
        // Course codes appearing in the prereq string — antireqs that are also prereqs
        // are contradictory data (e.g. PMATH351 lists PMATH333 as both) and should be suppressed.
        const prereqCodes = new Set(
          (prereqStr.match(/([A-Z]{2,8})\s+(\d{1,3}[A-Z]?)/g) ?? []).map(m => m.replace(/\s+/g, ''))
        );
        const antireqList = (antireqs[code] ?? []).filter(a => {
          if (!allTaken.has(a)) return false;
          // Suppress: this antireq is also the course's own prereq (data conflict)
          if (prereqCodes.has(a)) return false;
          // Suppress: antireq is only planned for a future term — no conflict yet
          const aTermN = courseTermNum.get(a);
          if (aTermN !== undefined && aTermN > termN) return false;
          return true;
        });
        const missingPrereqs = getMissingPrereqs(prereqStr, availableByThen);
        const restricted = isMathRestricted(prereqStr, program.major);
        const reqLevel = parseRequiredLevel(prereqStr);
        const requiredLevel = reqLevel && studentLevel && levelNum(studentLevel) < levelNum(reqLevel) ? reqLevel : null;
        if (antireqList.length > 0 || missingPrereqs.length > 0 || restricted || requiredLevel) {
          issues.set(code, { antireqs: antireqList, prereqs: missingPrereqs, restricted, requiredLevel });
        }
      }
    }
    return issues;
  }, [semesterPlans, completedCourses, courseInfoMap]);
  const shortName = (name: string) =>
    name.replace(' (Bachelor of Mathematics - Honours)', '')
        .replace(' (Bachelor of Mathematics)', '')
        .replace(' (Joint Honours)', ' (Joint)')
        .replace(' (Honours)', '');

  const makeGroup = (id: string, name: string, label: string): ReqGroup | null => {
    const entry = programs[id];
    if (!entry) return null;
    const r = entry.requirements ?? [];
    const top: ReqNode[] = r.length === 1 && r[0].children ? r[0].children : r;
    const isExclusion = (n: ReqNode) => n.type === 'COURSE' && !n.code && (n.children?.length ?? 0) > 0;
    const nodes = top
      .filter(n => n.type !== 'ADDITIONAL' && !isExclusion(n))
      .sort((a, b) => {
        // 0 = flat required, 1 = choice group satisfied by plan, 2 = unsatisfied choice group
        const sortRank = (n: ReqNode): 0 | 1 | 2 => {
          if (n.type === 'AND' || n.type === 'COURSE' || n.type === 'ADDITIONAL') return 0;
          const visible = (n.children ?? []).filter(c => !isWluOnly(c, planSet));
          if (visible.length === 0) return 0;
          if (visible.length === 1) return sortRank(unwrapSingle(visible[0]));
          return satisfies(n, planSet) ? 1 : 2;
        };
        return sortRank(a) - sortRank(b);
      });
    const additional = top.filter(n => n.type === 'ADDITIONAL');
    const exclusions = top.filter(isExclusion);

    let totalDone = 0, totalCount = 0;
    for (const n of top) {
      if (n.type === 'ADDITIONAL') {
        totalCount += n.n ?? 1;
      } else if (!isExclusion(n)) {
        const p = nodeProgressAware(n, completedSet, planSet);
        totalDone += p.done;
        totalCount += p.total;
      }
    }

    // Pre-allocate courses to additional slots, most restrictive first (fewest allowed levels)
    const requiredCodes = new Set(nodes.flatMap(n => courseCodes(n)));
    const globalAllocated = new Set<string>();

    const sorted = additional
      .map((node, idx) => ({ node, idx, levels: [...(node.text ?? '').matchAll(/\b[1-4]00[-–]/g)].length }))
      .sort((a, b) => a.levels - b.levels);

    const allocationByIdx = new Map<number, string[]>();
    for (const { node, idx } of sorted) {
      const subject = (node.text ?? '').match(/\b([A-Z]{2,8})\s+courses?/i)?.[1]?.toUpperCase() ?? '';
      const levelNums = [...(node.text ?? '').matchAll(/\b([1-4])00[-–]/g)].map(m => parseInt(m[1]));
      const nFromText = (node.text ?? '').match(/Complete\s+(\d+)/i)?.[1];
      const n = node.n ?? (nFromText ? parseInt(nFromText) : 1);
      const codes = !subject ? [] : [...planSet].filter(c => {
        if (!c.startsWith(subject) || requiredCodes.has(c) || globalAllocated.has(c)) return false;
        if (levelNums.length === 0) return true;
        return levelNums.includes(parseInt(c.slice(subject.length)[0]));
      }).slice(0, n);
      codes.forEach(c => globalAllocated.add(c));
      allocationByIdx.set(idx, codes);
    }
    const additionalAllocations = additional.map((_, i) => allocationByIdx.get(i) ?? []);

    return {
      title: `${label}: ${shortName(name)}`,
      progress: `${totalDone}/${totalCount}`,
      nodes,
      additional,
      exclusions,
      additionalAllocations,
      nodeExcludeCodes: new Set([...requiredCodes, ...globalAllocated]),
    };
  };

  const REQUIREMENT_GROUPS: ReqGroup[] = [
    program.id             ? makeGroup(program.id,           program.major,       'major')        : null,
    program.doubleMajorId  ? makeGroup(program.doubleMajorId, program.doubleMajor!, 'double major') : null,
    program.minorId        ? makeGroup(program.minorId,       program.minor!,      'minor')        : null,
    ...program.extras.map(e => makeGroup(e.id, e.name, e.type)),
  ].filter((g): g is ReqGroup => g !== null);


  const coursesDone = completedCourses.length;
  const coursesLeft = Math.max(0, 40 - coursesDone);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '32px 48px 0', flexShrink: 0 }}>
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
                  borderRadius: '40px', padding: '0 24px', height: '58px', display: 'flex', alignItems: 'center',
                  cursor: 'pointer', background: view === v ? '#fff' : 'transparent',
                  color: view === v ? '#000' : '#858080', fontFamily: SANS, fontSize: '20px',
                  transition: 'background 0.15s', whiteSpace: 'nowrap',
                }}
              >
                {v}
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          {[{ v: String(coursesDone), l: 'COURSES DONE' }, { v: String(coursesLeft), l: 'COURSES LEFT' }, { v: gradTarget, l: 'GRAD TARGET' }].map((s) => (
            <div key={s.l} style={{ flex: 1, background: '#d9d9d9', borderRadius: '15px', padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ fontFamily: SANS, fontSize: '40px', color: '#000', lineHeight: 1, fontWeight: 400 }}>{s.v}</div>
              <div style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      {view === 'timeline' ? (
        <div style={{ flex: 1, display: 'flex', gap: '24px', padding: '0 48px 32px', overflow: 'hidden', minHeight: 0 }}>

          {/* Search panel */}
          <div style={{ width: '240px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
            <div style={{ border: '1px solid #000', borderRadius: '15px', padding: '10px 14px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: '18px', marginRight: '8px', color: '#858080' }}>⌕</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="search courses..."
                style={{ border: 'none', background: 'transparent', fontFamily: SANS, fontSize: '15px', color: '#000', outline: 'none', width: '100%' }}
              />
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {!search.trim() && <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>search and drag courses into a term</span>}
              {search.trim() && searchResults.length === 0 && <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>no results</span>}
              {searchResults.map(c => (
                <div
                  key={c.code}
                  draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setChipDragImage(e, c.code); setDragging({ code: c.code, fromTerm: null }); }}
                  onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                  style={{ background: '#d9d9d9', borderRadius: '40px', padding: '0 16px', height: '44px', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: MONO, fontSize: '14px', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}
                >
                  <span style={{ color: '#000', whiteSpace: 'nowrap' }}>{c.code}</span>
                  <span style={{ color: '#858080', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {terms.map(term => {
              const termCourses = semesterPlans[term] ?? [];
              const isCurrent = term === currentTerm;
              const isPast = termToNum(term) < termToNum(currentTerm);
              const isOver = dropTarget === term;

              return (
                <div
                  key={term}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(term); }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={() => handleDrop(term)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 16px', borderRadius: '15px', minHeight: '64px',
                    background: isOver ? '#f0f0f0' : isCurrent ? '#f8f8f8' : 'transparent',
                    border: isOver ? '1px dashed #000' : isCurrent ? '1px solid #e0e0e0' : '1px solid transparent',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                >
                  <div style={{ width: '110px', flexShrink: 0, fontFamily: MONO, fontSize: '14px', color: isPast ? '#c0c0c0' : isCurrent ? '#000' : '#858080', fontWeight: isCurrent ? 700 : 400 }}>
                    {term}{program.coopStream && program.startTerm ? (() => { const sl = getStudyLabel(term, program.startTerm, program.coopStream!); return sl ? ` (${sl})` : ''; })() : ''}
                  </div>
                  <div style={{ width: '1px', background: '#e0e0e0', alignSelf: 'stretch', flexShrink: 0 }} />
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                    {termCourses.map(code => {
                      const issue = planIssues.get(code);
                      const tooltipLines: string[] = [];
                      if (issue?.requiredLevel) tooltipLines.push(`level at least ${issue.requiredLevel} required`);
                      if (issue?.restricted) tooltipLines.push('not open to Math students');
                      if (issue?.prereqs.length) tooltipLines.push(`missing prereq: ${issue.prereqs.join(', ')}`);
                      if (issue?.antireqs.length) tooltipLines.push(`antireq conflict: ${issue.antireqs.join(', ')}`);
                      const chipKey = `${term}:${code}`;
                      return (
                      <div
                        key={code}
                        draggable
                        onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; setChipDragImage(e, code); setDragging({ code, fromTerm: term }); }}
                        onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                        onMouseEnter={() => issue && setHoveredChip(chipKey)}
                        onMouseLeave={() => setHoveredChip(null)}
                        style={{
                          position: 'relative',
                          background: issue ? '#c60078' : isPast ? '#858080' : '#000', color: '#fff', borderRadius: '40px', padding: '0 14px', height: '38px',
                          display: 'flex', alignItems: 'center', gap: '8px', fontFamily: MONO, fontSize: '14px',
                          cursor: isPast ? 'default' : 'grab', userSelect: 'none',
                          opacity: dragging?.code === code && dragging.fromTerm === term ? 0.3 : 1,
                          transition: 'opacity 0.1s',
                        }}
                      >
                        {code}
                        {!isPast && (
                          <span onClick={e => { e.stopPropagation(); removeCourseFromTerm(term, code); }} style={{ cursor: 'pointer', opacity: 0.5, fontSize: '16px', lineHeight: 1 }}>×</span>
                        )}
                        {hoveredChip === chipKey && tooltipLines.length > 0 && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, marginTop: '6px',
                            background: '#1a1a1a', color: '#fff', borderRadius: '10px',
                            padding: '8px 12px', zIndex: 50, pointerEvents: 'none',
                            display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 'max-content',
                          }}>
                            {tooltipLines.map((line, i) => (
                              <span key={i} style={{ fontFamily: SANS, fontSize: '13px', fontWeight: 400 }}>{line}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                    {termCourses.length === 0 && (
                      <span style={{ fontFamily: MONO, fontSize: '13px', color: '#d0d0d0' }}>drag courses here</span>
                    )}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', flexShrink: 0 }}>{termCourses.filter(c => !c.startsWith('PD') && c !== 'MTHEL99').length}/5</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 48px 32px' }}>
          {REQUIREMENT_GROUPS.map((g, i) => <RequirementGroup key={i} group={g} completedSet={completedSet} planSet={planSet} />)}
        </div>
      )}
    </div>
  );
}
