'use client';

import { useMemo, useRef, useState } from 'react';
import SlidingToggle from '@/src/components/SlidingToggle';
import { useApp } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';
import rawAntireqs from '@/src/data/antireqs.json';
import { satisfies, nodeProgress, courseCodes, type ReqNode, isMathUndergradCommBlock, nodeProgressMathUndergradComm, isStatActsciCommBlock, nodeProgressStatActsciComm, isCompMathAdditionalBlock, isCompMathNonMathBlock, nodeProgressCompMathNonMath, isAmathSubjectConcentration, nodeProgressAmathConcentration, parseConcentrationSubjects, extractSubjectsFromText } from '@/src/lib/requirementEvaluator';
import { patchCoreBmathRequirements, adjustUndergradCommList2ForPlanDisplay } from '@/src/lib/coreBmathCommPatch';
import { getMissingPrereqs, formatPrereqForDisplay, isMathRestricted, parseRequiredLevel, levelNum, expandWithLabCourses } from '@/src/lib/prereqCheck';
import { getCurrentTerm, termToNum } from '@/src/lib/termUtils';
import { getStudyLabel, computeGradTerm } from '@/src/data/coopSequences';
import { parseListSectionFromRawHtml } from '@/src/lib/parseRequirementListHtml';
import { computeDegreeHeadlineMetrics, isNonMathElective } from '@/src/lib/degreeHeadlineProgress';
import {
  effectivePlanEndTerm,
  effectivePlanTerms,
  inferredDefaultEndTerm,
  planEndTermSelectOptions,
} from '@/src/lib/planTerms';
import { useIsMobile } from '@/src/lib/useIsMobile';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

const programs = rawPrograms as Record<string, { name: string; requirements: ReqNode[]; rawHtml?: string | null; minCourses?: number; isMinor?: boolean; isSpecialization?: boolean }>;
const antireqs = rawAntireqs as Record<string, string[]>;

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
      const sat = completedSet.has(node.code) || planSet.has(node.code);
      return { done: sat ? w : 0, total: w };
    }
    case 'AND': {
      if (isStatActsciCommBlock(node)) {
        const combined = new Set([...completedSet, ...planSet]);
        return nodeProgressStatActsciComm(node, combined);
      }
      if (isMathUndergradCommBlock(node)) {
        const combined = new Set([...completedSet, ...planSet]);
        return nodeProgressMathUndergradComm(node, combined);
      }
      const children = node.children ?? [];
      const t = (node.text ?? '').trimStart();
      if (/^choose\s+any/i.test(t)) return { done: 0, total: 0 };
      if (/^complete\s+no\s+more\s+than/i.test(t)) return { done: 0, total: 0 };
      // AND wrapper with a leading descriptive ADDITIONAL ("Complete N courses/units from…")
      const leadingLabel = children.find(c => c.type === 'ADDITIONAL' && c.n == null && courseCodes(c).length === 0);
      if (leadingLabel) {
        const nMatch = (leadingLabel.text ?? '').match(/Complete\s+(\d+(?:\.\d+)?)\s+(courses?|units?)\s+from/i);
        if (nMatch) {
          const rawN = parseFloat(nMatch[1]);
          const n = /units?/i.test(nMatch[2]) ? Math.round(rawN / 0.5) : Math.round(rawN);
          const nonLabel = children.filter(c => c !== leadingLabel);
          // Single pool child → count individual courses done; multiple group children → count groups
          const groupsDone = nonLabel.length === 1
            ? courseCodes(nonLabel[0]).filter(code => completedSet.has(code) || planSet.has(code)).length
            : nonLabel.filter(c => courseCodes(c).some(code => completedSet.has(code) || planSet.has(code))).length;
          return { done: Math.min(groupsDone, n), total: n };
        }
      }
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
      const k = (node.children ?? []).filter(c => satisfies(c, completedSet) || satisfies(c, planSet)).length;
      return { done: Math.min(k, n), total: n };
    }
    case 'ADDITIONAL': {
      if (isCompMathNonMathBlock(node)) {
        const combined = new Set([...completedSet, ...planSet]);
        return nodeProgressCompMathNonMath(node, combined);
      }
      if (isAmathSubjectConcentration(node)) {
        const combined = new Set([...completedSet, ...planSet]);
        return nodeProgressAmathConcentration(node, combined);
      }
      return { done: 0, total: 0 };
    }
    default: return { done: 0, total: 0 };
  }
}

type ReqGroup = {
  pid: string;
  title: string; progress: string;
  nodes: ReqNode[]; additional: ReqNode[]; exclusions: ReqNode[];
  additionalAllocations: string[][];  // parallel to additional[], pre-computed
  nodeExcludeCodes: Set<string>;      // requiredCodes + all additional-allocated codes
  rawHtml?: string | null;
};

function CheckBox({ done, planned }: { done?: boolean; planned?: boolean }) {
  const bg = done ? '#000' : planned ? '#a0a0a0' : '#d9d9d9';
  return (
    <div style={{ width: '22px', height: '22px', borderRadius: '5px', background: bg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {(done || planned) && <span style={{ color: '#fff', fontSize: '13px', lineHeight: 1 }}>✓</span>}
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
  // "Complete N additional course(s) from the options in List M" — list is shown below; same rule, shorter copy.
  const fromListRef = text.match(/Complete\s+(\d+)\s+additional\s+courses?\s+from\s+the\s+options?\s+in\s+List\s*\d+/i);
  if (fromListRef) {
    const n = parseInt(fromListRef[1], 10);
    const unit = n === 1 ? 'course' : 'courses';
    return `Complete ${n} additional ${unit} from the following:`;
  }

  const subject = (text.match(/\b([A-Z]{2,8})\s+courses?/i)?.[1] ?? '').toUpperCase();
  const levelNums = [...text.matchAll(/\b([1-4])00[-–]/g)].map(m => m[1]);
  const levelStr = levelNums.map(l => `${l}XX`).join('/');

  const additionalMatch = text.match(/Complete\s+(\d+)\s+additional/i);
  if (additionalMatch) {
    const n = additionalMatch[1];
    const plural = parseInt(n) === 1 ? 'course' : 'courses';
    const subjects = extractSubjectsFromText(text);
    if (subjects.size > 1) {
      const subjectList = [...subjects].sort().join(', ');
      return `${n} additional ${plural} from: ${subjectList}`;
    }
    if (subject && levelStr) return `${n} additional ${subject} ${levelStr} ${plural}`;
    if (subject) return `${n} additional ${subject} ${plural}`;
    return text;
  }

  // "Complete N SUBJECT course at X-level" (no "additional") → just "SUBJECTXXX[+]"
  if (subject && levelStr) {
    const plus = /or\s+higher/i.test(text) ? '+' : '';
    return `${subject}${levelStr}${plus}`;
  }
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

function SectionLabel({ label, done, planned, dim }: { label: string; done: boolean; planned?: boolean; dim: boolean }) {
  return (
    <div style={{
      borderTop: '1px solid rgba(133,128,128,0.35)',
      paddingTop: '10px',
      marginTop: '4px',
      marginBottom: '2px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <span style={{
        fontFamily: MONO,
        fontSize: '11px',
        color: dim ? 'rgba(133,128,128,0.45)' : '#858080',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>{label}</span>
      {!dim && <CheckBox done={done} planned={planned} />}
    </div>
  );
}

function CollapsibleSection({ label, done, planned, dim, defaultOpen = true, children }: {
  label: string; done: boolean; planned?: boolean; dim: boolean; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: open ? '8px' : '0' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          borderTop: '1px solid rgba(133,128,128,0.35)',
          paddingTop: '10px',
          marginTop: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontFamily: MONO,
          fontSize: '11px',
          color: dim ? 'rgba(133,128,128,0.45)' : '#858080',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!dim && <CheckBox done={done} planned={planned} />}
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', color: '#858080', flexShrink: 0 }}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{children}</div>}
    </div>
  );
}

function ReqNodeView({ node, completedSet, planSet, dim = false, excludeCodes = new Set<string>(), preAllocated, rawHtml }: {
  node: ReqNode; completedSet: Set<string>; planSet: Set<string>; dim?: boolean; excludeCodes?: Set<string>; preAllocated?: string[];
  rawHtml?: string | null;
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
        {!dim && <CheckBox done={done} planned={inPlan} />}
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
          {children.map((c, i) => <ReqNodeView key={i} node={c} completedSet={completedSet} planSet={planSet} dim rawHtml={rawHtml} />)}
        </div>
      </div>
    );
  }

  if (node.type === 'ADDITIONAL') {
    // Non-math courses block: custom rendering
    if (isCompMathNonMathBlock(node)) {
      const NON_MATH_SUBJS = ['AE', 'BIOL', 'BME', 'CHE', 'CHEM', 'CIVE', 'EARTH', 'ECE', 'ECON', 'ENVE', 'GEOE', 'ME', 'MNS', 'MSE', 'MTE', 'NE', 'PHYS', 'SYDE'];
      const NON_MATH_SET = new Set(NON_MATH_SUBJS);
      const groups = new Map<string, string[]>();
      for (const code of planSet) {
        const subj = code.match(/^([A-Z]+)/)?.[1] ?? '';
        if (!NON_MATH_SET.has(subj)) continue;
        if (!groups.has(subj)) groups.set(subj, []);
        groups.get(subj)!.push(code);
      }
      let bestGroup: string[] = [];
      for (const g of groups.values()) if (g.length > bestGroup.length) bestGroup = g;
      const filledCodes = bestGroup.slice(0, 3);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            {!dim && <CheckBox done={done} planned={inPlan} />}
            {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontFamily: SANS, fontSize: '14px', color: fgDone }}>
                Complete 3 non-math courses (≥1 at 200-level or above, all same subject code)
              </span>
              <span style={{ fontFamily: SANS, fontSize: '12px', color: dim ? fgDone : '#858080' }}>
                {NON_MATH_SUBJS.join(', ')}
              </span>
            </div>
          </div>
          <div style={{ marginLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Array.from({ length: 3 }).map((_, i) => {
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

    if (isAmathSubjectConcentration(node)) {
      const subjects = parseConcentrationSubjects(node);
      const n = node.n ?? 4;
      const groups = new Map<string, string[]>();
      for (const code of planSet) {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            {!dim && <CheckBox done={done} planned={inPlan} />}
            {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontFamily: SANS, fontSize: '14px', color: fgDone }}>
                Subject concentration: 4 courses, all same subject code{bestSubj ? ` (${bestSubj})` : ''}
              </span>
              <span style={{ fontFamily: SANS, fontSize: '12px', color: dim ? fgDone : '#858080' }}>{SUBJS}</span>
            </div>
          </div>
          <div style={{ marginLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
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

    const text = node.text ?? '';
    const label = formatAdditional(text.trim());
    const subject = text.match(/\b([A-Z]{2,8})\s+courses?/i)?.[1]?.toUpperCase() ?? '';
    const levelNums = [...text.matchAll(/\b([1-4])00[-–]/g)].map(m => parseInt(m[1]));
    const nFromText = text.match(/Complete\s+(\d+)/i)?.[1];
    const n = node.n ?? (nFromText ? parseInt(nFromText) : null);
    const listMatch = text.match(/\bList\s*(\d+)\b/i);
    const listNum = listMatch ? parseInt(listMatch[1], 10) : NaN;
    const parsedListCourses =
      Number.isFinite(listNum) && rawHtml ? parseListSectionFromRawHtml(rawHtml, listNum) : [];
    const listRefNodes: ReqNode[] = parsedListCourses.map(({ code, title }) => ({
      type: 'COURSE',
      code,
      text: title ? `${code} - ${title} (0.50)` : `${code} (0.50)`,
    }));

    // If we can identify subject + count, show checkbox + pill per slot
    if (subject && n != null) {
      const orHigher = /or\s+higher/i.test(text);
      const matchesCriteria = (code: string) => {
        if (!code.startsWith(subject)) return false;
        if (levelNums.length === 0) return true;
        const d = parseInt(code.slice(subject.length)[0]);
        return orHigher ? d >= levelNums[0] : levelNums.includes(d);
      };
      const filledCodes = preAllocated ?? [...planSet].filter(c => matchesCriteria(c) && !excludeCodes.has(c)).slice(0, n);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontFamily: SANS, fontSize: '13px', color: dim ? fgDone : '#888', fontStyle: 'italic' }}>{label}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Array.from({ length: n }).map((_, i) => {
              const code = filledCodes[i];
              const isDone = code ? completedSet.has(code) : false;
              const isPlanned = code ? (!isDone && planSet.has(code)) : false;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckBox done={isDone} planned={isPlanned} />
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
          {listRefNodes.length > 0 && (
            <div style={{ marginLeft: dim ? 0 : '4px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {listRefNodes.map((c, i) => (
                <ReqNodeView key={i} node={c} completedSet={completedSet} planSet={planSet} excludeCodes={excludeCodes} dim={dim} rawHtml={rawHtml} />
              ))}
            </div>
          )}
        </div>
      );
    }

    // Multi-subject + count: "Complete N ... from: SUBJ1, SUBJ2, ..."
    if (!subject && n != null) {
      const subjects = extractSubjectsFromText(text);
      if (subjects.size > 0) {
        const matchesCriteria = (code: string) => {
          const subj = code.match(/^([A-Z]+)/)?.[1] ?? '';
          if (!subjects.has(subj)) return false;
          if (levelNums.length === 0) return true;
          const level = Math.floor(parseInt(code.replace(/^[A-Z]+/, '') || '0') / 100);
          return levelNums.includes(level);
        };
        const filledCodes = preAllocated ?? [...planSet].filter(c => matchesCriteria(c) && !excludeCodes.has(c)).slice(0, n);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontFamily: SANS, fontSize: '13px', color: dim ? fgDone : '#888', fontStyle: 'italic' }}>{label}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Array.from({ length: n }).map((_, i) => {
                const code = filledCodes[i];
                const isDone = code ? completedSet.has(code) : false;
                const isPlanned = code ? (!isDone && planSet.has(code)) : false;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckBox done={isDone} planned={isPlanned} />
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
    }

    // "no more than N from:" — render as checklist
    const noMoreMatch = text.match(/no\s+more\s+than\s+(\d+)\s+from/i);
    if (noMoreMatch) {
      const cap = parseInt(noMoreMatch[1]);
      const capCourses = [...text.matchAll(/\b([A-Z]{2,8}\d{3}[A-Z]?)\s*-\s*([^(,\n]+)/g)]
        .map(m => ({ code: m[1].trim(), name: m[2].trim() }));
      if (capCourses.length > 0) {
        const takenFromGroup = capCourses.filter(({ code }) => planSet.has(code));
        const overCap = takenFromGroup.length > cap;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontFamily: SANS, fontSize: '13px', color: dim ? fgDone : '#888', fontStyle: 'italic' }}>
              {`At most ${cap} of the following:`}
            </span>
            {capCourses.map(({ code, name }) => {
              const isDone = completedSet.has(code);
              const isInPlan = !isDone && planSet.has(code);
              return (
                <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {!dim && <CheckBox done={isDone} planned={isInPlan} />}
                  {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
                  <span style={{ fontFamily: MONO, fontSize: '14px', color: fgDone, flexShrink: 0 }}>{code}</span>
                  <span style={{ fontFamily: SANS, fontSize: '14px', color: dim ? fgDone : '#555' }}>{name}</span>
                  {!dim && overCap && (isDone || isInPlan) && (
                    <span style={{ fontFamily: SANS, fontSize: '11px', color: '#c60078', background: 'rgba(198,0,120,0.08)', borderRadius: '40px', padding: '2px 8px', flexShrink: 0 }}>cap exceeded</span>
                  )}
                  {!dim && !overCap && isInPlan && (
                    <span style={{ fontFamily: SANS, fontSize: '11px', color: '#858080', background: '#d9d9d9', borderRadius: '40px', padding: '2px 8px', flexShrink: 0 }}>planned</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      }
    }

    // Fallback for credit-based or unparseable requirements
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          {!dim && <CheckBox done={false} />}
          {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
          <span style={{ fontFamily: SANS, fontSize: '14px', color: dim ? fgDone : '#555', fontStyle: 'italic', paddingTop: '2px' }}>{label}</span>
        </div>
        {listRefNodes.length > 0 && (
          <div style={{ marginLeft: dim ? 0 : '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {listRefNodes.map((c, i) => (
              <ReqNodeView key={i} node={c} completedSet={completedSet} planSet={planSet} excludeCodes={excludeCodes} dim={dim} rawHtml={rawHtml} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const sharedChildProps = { completedSet, planSet, excludeCodes, rawHtml };
  const listSectionMatch = (node.text ?? '').match(/^(List\s*\d+):\s*/i);

  // AND: render children flat — no header, no AND-level checkbox
  if (node.type === 'AND') {
    const andText = node.text ?? '';

    // "Complete no more than N from the following:" AND — render as capped group using children
    const andNoMoreMatch = andText.match(/no\s+more\s+than\s+(\d+)\s+from/i);
    if (andNoMoreMatch && children.length > 0 && children.every(c => c.type === 'COURSE' && c.code)) {
      const cap = parseInt(andNoMoreMatch[1]);
      const takenFromGroup = children.filter(c => planSet.has(c.code!));
      const overCap = takenFromGroup.length > cap;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontFamily: SANS, fontSize: '13px', color: dim ? fgDone : '#888', fontStyle: 'italic' }}>
            {`At most ${cap} of the following:`}
          </span>
          {children.map((c, i) => {
            const code = c.code!;
            const name = (c.text ?? '').replace(/\s*\(\d+\.\d+\).*$/, '').replace(/^[A-Z]+\d+[A-Z]?\s*-\s*/, '').trim();
            const isDone = completedSet.has(code);
            const isInPlan = !isDone && planSet.has(code);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {!dim && <CheckBox done={isDone} planned={isInPlan} />}
                {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
                <span style={{ fontFamily: MONO, fontSize: '14px', color: fgDone, flexShrink: 0 }}>{code}</span>
                <span style={{ fontFamily: SANS, fontSize: '14px', color: dim ? fgDone : '#555' }}>{name}</span>
                {!dim && overCap && (isDone || isInPlan) && <span style={{ fontFamily: SANS, fontSize: '11px', color: '#c60078', background: 'rgba(198,0,120,0.08)', borderRadius: '40px', padding: '2px 8px', flexShrink: 0 }}>cap exceeded</span>}
                {!dim && !overCap && isInPlan && <span style={{ fontFamily: SANS, fontSize: '11px', color: '#858080', background: '#d9d9d9', borderRadius: '40px', padding: '2px 8px', flexShrink: 0 }}>planned</span>}
              </div>
            );
          })}
        </div>
      );
    }

    // "Choose any of the following:" AND — render as "Complete 1 of the following:" list
    if (/^choose\s+any/i.test(andText.trimStart()) && children.length > 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontFamily: SANS, fontSize: '13px', color: dim ? fgDone : '#888', fontStyle: 'italic' }}>Complete 1 of the following:</span>
          {children.map((c, i) => (
            <ReqNodeView key={i} node={c} {...sharedChildProps} dim={dim} />
          ))}
        </div>
      );
    }

    // Special case: ADDITIONAL "...from courses listed below" + OR sibling — merge into combined slots
    const addChild = children.find(c => c.type === 'ADDITIONAL' && /courses?\s+listed\s+below/i.test(c.text ?? ''));
    const orChild = addChild ? children.find(c => c !== addChild && (c.type === 'OR' || (c.type === 'AND' && /^choose\s+any/i.test(c.text ?? '')))) : undefined;
    if (addChild && orChild) {
      const listedCodes = new Set(courseCodes(orChild));
      const text = addChild.text ?? '';
      const n = addChild.n ?? 2;
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
      const filledCodes = [...planSet].filter(c => matchesCriteria(c) && !excludeCodes.has(c)).slice(0, n);
      const label = formatAdditional(text.trim());
      const addDone = filledCodes.filter(c => completedSet.has(c)).length >= n;
      const addInPlan = !addDone && filledCodes.length >= n;
      const otherChildren = children.filter(c => c !== addChild && c !== orChild);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              {!dim && <CheckBox done={addDone} planned={addInPlan} />}
              {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
              <span style={{ fontFamily: SANS, fontSize: '13px', color: dim ? fgDone : '#888', fontStyle: 'italic', paddingTop: '3px' }}>{label}</span>
            </div>
            <div style={{ marginLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Array.from({ length: n }).map((_, i) => {
                const code = filledCodes[i];
                const isDone = code ? completedSet.has(code) : false;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckBox done={isDone} />
                    {code ? (
                      <div style={{ background: isDone ? '#000' : '#858080', color: '#fff', borderRadius: '40px', padding: '0 12px', height: '30px', display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: '13px' }}>{code}</div>
                    ) : (
                      <div style={{ width: '80px', height: '30px', borderRadius: '40px', background: '#d9d9d9' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {(orChild.children ?? []).length > 0 && (
            <div style={{ marginLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em' }}>or from</span>
              {(orChild.children ?? []).map((c, i) => (
                <ReqNodeView key={i} node={c} completedSet={completedSet} planSet={planSet} dim={dim} excludeCodes={excludeCodes} rawHtml={rawHtml} />
              ))}
            </div>
          )}
          {otherChildren.map((c, i) => (
            <ReqNodeView key={i} node={unwrapSingle(c)} dim={dim} {...sharedChildProps} />
          ))}
        </div>
      );
    }
    if (listSectionMatch) {
      return (
        <CollapsibleSection label={listSectionMatch[1]} done={done} planned={inPlan} dim={dim}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {children.map((c, i) => (
              <ReqNodeView key={i} node={unwrapSingle(c)} dim={dim} {...sharedChildProps} />
            ))}
          </div>
        </CollapsibleSection>
      );
    }
    // Leading descriptive ADDITIONAL (no n, no courses) — use as header, indent siblings
    const leadingLabel = children[0]?.type === 'ADDITIONAL' && children[0].n == null && courseCodes(children[0]).length === 0 ? children[0] : null;
    if (leadingLabel && children.length > 1) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontFamily: SANS, fontSize: '13px', color: dim ? fgDone : '#888', fontStyle: 'italic' }}>{formatAdditional(leadingLabel.text ?? '')}</span>
          <div style={{ marginLeft: '22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {children.slice(1).map((c, i) => (
              <ReqNodeView key={i} node={unwrapSingle(c)} dim={dim} {...sharedChildProps} />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {children.map((c, i) => (
          <ReqNodeView key={i} node={unwrapSingle(c)} dim={dim} {...sharedChildProps} />
        ))}
      </div>
    );
  }

  // N_OF with list section header (e.g. "List 1: Complete 2 of the following...")
  if (node.type === 'N_OF' && listSectionMatch) {
    const n = node.n ?? 1;
    const visChildren = children.filter(c => !isWluOnly(c, planSet));
    const dispChildren = n > 1
      ? (done
        ? visChildren.filter(c => satisfies(c, completedSet))
        : inPlan
          ? visChildren.filter(c => satisfies(c, planSet)).slice(0, n)
          : visChildren)
      : visChildren;
    return (
      <CollapsibleSection label={listSectionMatch[1]} done={done} planned={inPlan} dim={dim}>
        {dispChildren.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ width: '22px', flexShrink: 0 }} />
              <span style={{ fontFamily: SANS, fontSize: '14px', fontWeight: 500, color: fgDone, paddingTop: '3px' }}>
                {`Complete ${n} of the following:`}
              </span>
            </div>
            <div style={{ marginLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {dispChildren.map((c, i) => {
                const childDim = dim
                  || (done && n === 1 && !satisfies(c, completedSet))
                  || (!done && satisfies(node, planSet) && !satisfies(c, planSet));
                const unwrapped = unwrapSingle(c);
                if (unwrapped.type === 'AND' && (unwrapped.children?.length ?? 0) > 1) {
                  const andDone = satisfies(unwrapped, completedSet);
                  const andInPlan = !andDone && satisfies(unwrapped, planSet);
                  const andFg = childDim ? 'rgba(133,128,128,0.55)' : '#000';
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        {!childDim && <CheckBox done={andDone} planned={andInPlan} />}
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
        )}
      </CollapsibleSection>
    );
  }

  // Comp Math 4-additional block: List 3 catalog + 4-slot constraint
  if (isCompMathAdditionalBlock(node)) {
    const pool = new Set(courseCodes(node));
    const n = node.n ?? 4;
    const filledCodes = [...planSet].filter(c => pool.has(c)).slice(0, n);
    // List 2 courses are handled by node[6]; everything else in the pool is List 3
    const list2 = new Set(['AMATH342', 'CS475', 'PMATH370', 'CO353', 'CO367', 'STAT340', 'STAT341']);
    const list3Nodes = (node.children ?? []).filter(c => c.code && !list2.has(c.code!));
    const list3Done = list3Nodes.some(c => planSet.has(c.code!));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* List 3 section — collapsed by default, compact chip grid */}
        <CollapsibleSection label="List 3" done={list3Done} dim={dim} defaultOpen={false}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {list3Nodes.map(c => {
              const isDone = completedSet.has(c.code!);
              const isPlanned = !isDone && planSet.has(c.code!);
              return (
                <div key={c.code} style={{
                  fontFamily: MONO, fontSize: '13px',
                  padding: '4px 10px', borderRadius: '40px',
                  background: isDone ? '#000' : isPlanned ? '#858080' : 'transparent',
                  color: isDone || isPlanned ? '#fff' : '#858080',
                  border: isDone || isPlanned ? 'none' : '1px solid #d9d9d9',
                }}>
                  {c.code}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
        {/* Additional constraint section */}
        <CollapsibleSection label="Additional" done={done} planned={inPlan} dim={dim}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontFamily: SANS, fontSize: '13px', color: dim ? fgDone : '#555', fontStyle: 'italic' }}>
              {`Complete ${n} additional courses from List 2 or List 3`}
            </span>
            <span style={{ fontFamily: SANS, fontSize: '12px', color: '#858080' }}>
              at least 2 subject codes (AMATH/CO/CS/PMATH/STAT) · at least 2 at 400-level
            </span>
          </div>
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
        </CollapsibleSection>
      </div>
    );
  }

  // OR / N_OF: filter non-visible (WLU) children
  // n>1: collapse to only the chosen n; n=1 / OR: show all options, dim unselected
  const visibleChildren = children.filter(c => !isWluOnly(c, planSet));
  const nOf = node.type === 'N_OF' ? (node.n ?? 1) : 1;
  const shouldCollapse = nOf > 1;
  const displayChildren = !shouldCollapse
    ? visibleChildren
    : done
      ? visibleChildren.filter(c => satisfies(c, completedSet))
      : inPlan
        ? visibleChildren.filter(c => satisfies(c, planSet)).slice(0, nOf)
        : visibleChildren;

  // For OR nodes with all-course children: group advanced/enriched variants by matching base name.
  // Only courses whose names differ solely by "(Advanced Level)" or "(Enriched)" are collapsed together.
  // Courses with different base names remain as separate options.
  if (node.type === 'OR' && displayChildren.length >= 2 && displayChildren.every(c => c.type === 'COURSE' && c.code)) {
    const getBaseName = (n: ReqNode) => {
      const raw = (n.text ?? '').replace(/ \(0\.\d+\)/g, '').trim();
      const name = raw.includes(' - ') ? raw.split(' - ').slice(1).join(' - ').trim() : raw;
      return name
        .replace(/\s*\(Advanced Level\)\s*$/i, '')
        .replace(/\s*\(Enriched\)\s*$/i, '')
        .replace(/\s+for Honours Mathematics\s*$/i, '')
        .trim();
    };
    const groupMap = new Map<string, ReqNode[]>();
    const groupOrder: string[] = [];
    for (const child of displayChildren) {
      const key = getBaseName(child);
      if (!groupMap.has(key)) { groupMap.set(key, []); groupOrder.push(key); }
      groupMap.get(key)!.push(child);
    }
    const hasCollapsiblePair = [...groupMap.values()].some(g => g.length > 1);
    if (hasCollapsiblePair) {
      const renderGroup = (key: string, idx: number) => {
        const gNodes = groupMap.get(key)!;
        const anyDone = gNodes.some(c => completedSet.has(c.code!));
        const anyInPlan = !anyDone && gNodes.some(c => planSet.has(c.code!));
        const gDim = dim
          || (done && !anyDone)
          || (!done && satisfies(node, planSet) && !anyDone && !anyInPlan);
        const gFg = gDim ? 'rgba(133,128,128,0.55)' : '#000';
        if (gNodes.length === 1) {
          return <ReqNodeView key={idx} node={gNodes[0]} completedSet={completedSet} planSet={planSet} dim={gDim} excludeCodes={excludeCodes} rawHtml={rawHtml} />;
        }
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!gDim && <CheckBox done={anyDone} planned={anyInPlan} />}
            {gDim && <div style={{ width: '22px', flexShrink: 0 }} />}
            <span style={{ fontFamily: MONO, fontSize: '14px', color: gFg, flexShrink: 0 }}>{gNodes.map(c => c.code).join('/')}</span>
            <span style={{ fontFamily: SANS, fontSize: '14px', color: gDim ? gFg : '#555' }}>{key}</span>
            {!gDim && anyInPlan && <span style={{ fontFamily: SANS, fontSize: '11px', color: '#858080', background: '#d9d9d9', borderRadius: '40px', padding: '2px 8px', flexShrink: 0 }}>planned</span>}
          </div>
        );
      };
      if (groupOrder.length === 1) return renderGroup(groupOrder[0], 0);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            {!dim && <CheckBox done={done} planned={inPlan} />}
            {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
            <span style={{ fontFamily: SANS, fontSize: '14px', fontWeight: 500, color: fgDone, paddingTop: '3px' }}>Complete 1 of the following:</span>
          </div>
          <div style={{ marginLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {groupOrder.map((key, idx) => renderGroup(key, idx))}
          </div>
        </div>
      );
    }
  }

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
        {!dim && <CheckBox done={done} planned={inPlan} />}
        {dim && <div style={{ width: '22px', flexShrink: 0 }} />}
        <span style={{ fontFamily: SANS, fontSize: '14px', fontWeight: 500, color: fgDone, paddingTop: '3px' }}>{header}</span>
      </div>
      <div style={{ marginLeft: '32px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {displayChildren.map((c, i) => {
          const childDim = dim
            || (done && !satisfies(c, completedSet))
            || (!done && satisfies(node, planSet) && !satisfies(c, planSet));
          const unwrapped = unwrapSingle(c);
          // AND with multiple courses inside an OR — render with "Complete all the following:" header
          if (unwrapped.type === 'AND' && (unwrapped.children?.length ?? 0) > 1) {
            const andDone = satisfies(unwrapped, completedSet);
            const andInPlan = !andDone && satisfies(unwrapped, planSet);
            const andFg = childDim ? 'rgba(133,128,128,0.55)' : '#000';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  {!childDim && <CheckBox done={andDone} planned={andInPlan} />}
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

type PlanIssue = { antireqs: string[]; prereqs: string[][]; restricted: boolean; requiredLevel: string | null; notOffered: boolean; retaking: boolean; capViolation: string | null; duplicate: boolean };

function ValidatePanel({ groups, planIssues, completedSet, planSet, onClose }: {
  groups: ReqGroup[];
  planIssues: Map<string, PlanIssue>;
  completedSet: Set<string>;
  planSet: Set<string>;
  onClose: () => void;
}) {
  const issueList = useMemo(() => {
    const out: { term: string; code: string; descriptions: string[] }[] = [];
    for (const [key, v] of planIssues.entries()) {
      const [term, code] = key.split(':');
      const descriptions: string[] = [];
      if (v.prereqs.length > 0) {
        const groups = v.prereqs.map(g => g.length > 1 ? g.join(' or ') : g[0]);
        descriptions.push(`missing prereq: ${groups.join(', ')}`);
      }
      if (v.antireqs.length > 0) descriptions.push(`antireq conflict: ${v.antireqs.join(', ')}`);
      if (v.capViolation) descriptions.push(`cap exceeded: at most ${v.capViolation}`);
      if (v.notOffered) descriptions.push(`not typically offered in ${term[0] === 'W' ? 'Winter' : term[0] === 'S' ? 'Spring' : 'Fall'}`);
      if (v.restricted) descriptions.push('restricted to another faculty');
      if (v.requiredLevel) descriptions.push(`requires level ${v.requiredLevel}`);
      if (v.retaking || v.duplicate) descriptions.push('already in plan');
      if (descriptions.length > 0) out.push({ term, code, descriptions });
    }
    return out.sort((a, b) => termToNum(a.term) - termToNum(b.term));
  }, [planIssues]);

  const reqSummary = (() => {
    const items = groups.map(g => {
      const [doneStr, totalStr] = g.progress.split('/');
      const done = parseFloat(doneStr ?? '0');
      const total = parseFloat(totalStr ?? '0');
      return { title: g.title, done, total, ok: done >= total };
    });
    const nonMathDone = Math.min([...planSet].filter(isNonMathElective).length, NON_MATH_TOTAL);
    items.push({ title: 'Non-Math Electives', done: nonMathDone, total: NON_MATH_TOTAL, ok: nonMathDone >= NON_MATH_TOTAL });
    return items;
  })();

  const reqIssues = reqSummary.filter(r => !r.ok).length;
  const allGood = issueList.length === 0 && reqIssues === 0;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '380px', background: '#fff', boxShadow: '-4px 0 32px rgba(0,0,0,0.12)', zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '28px 28px 20px', flexShrink: 0, borderBottom: '1px solid #ececec' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: SANS, fontSize: '26px', color: '#000' }}>plan check</div>
            <div onClick={onClose} style={{ fontFamily: MONO, fontSize: '20px', color: '#858080', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</div>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: allGood ? '#22c55e' : '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>
              {allGood
                ? 'plan looks complete'
                : [reqIssues > 0 && `${reqIssues} req${reqIssues > 1 ? 's' : ''} incomplete`, issueList.length > 0 && `${issueList.length} scheduling issue${issueList.length > 1 ? 's' : ''}`].filter(Boolean).join(' · ')
              }
            </span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 32px' }}>

          {/* Requirements */}
          <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Requirements</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
            {reqSummary.map(r => (
              <div key={r.title} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: r.ok ? '#000' : '#ececec', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {r.ok && <span style={{ color: '#fff', fontSize: '11px' }}>✓</span>}
                </div>
                <span style={{ fontFamily: SANS, fontSize: '14px', color: '#000', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                <span style={{ fontFamily: MONO, fontSize: '12px', color: r.ok ? '#858080' : '#000', flexShrink: 0 }}>{Math.round(r.done)}/{Math.round(r.total)}</span>
              </div>
            ))}
          </div>

          {/* Scheduling issues */}
          <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            Scheduling issues{issueList.length > 0 ? ` (${issueList.length})` : ''}
          </div>
          {issueList.length === 0 ? (
            <div style={{ fontFamily: SANS, fontSize: '14px', color: '#858080' }}>no issues found</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {issueList.map(({ term, code, descriptions }) => (
                <div key={`${term}:${code}`} style={{ borderLeft: '2px solid rgba(133,128,128,0.25)', paddingLeft: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', marginBottom: '3px' }}>
                    <span style={{ fontFamily: MONO, fontSize: '13px', color: '#000' }}>{code}</span>
                    <span style={{ fontFamily: MONO, fontSize: '11px', color: '#858080' }}>{term}</span>
                  </div>
                  {descriptions.map((d, i) => (
                    <div key={i} style={{ fontFamily: SANS, fontSize: '13px', color: '#858080' }}>{d}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const NON_MATH_TOTAL = 10;

function NonMathElectivesGroup({ completedSet, planSet }: { completedSet: Set<string>; planSet: Set<string> }) {
  const filled = [...planSet].filter(isNonMathElective);
  const doneCnt = Math.min(filled.filter(c => completedSet.has(c)).length, NON_MATH_TOTAL);
  return (
    <div style={{ background: '#ececec', borderRadius: '15px', padding: '16px 20px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontFamily: SANS, fontSize: '20px', color: '#000' }}>Non-Math Electives</div>
        <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '6px 16px', fontFamily: SANS, fontSize: '18px', flexShrink: 0, marginLeft: '12px' }}>
          {doneCnt}/{NON_MATH_TOTAL}
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(133,128,128,0.4)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {Array.from({ length: NON_MATH_TOTAL }).map((_, i) => {
          const code = filled[i];
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

function RequirementGroup({ group, completedSet, planSet }: { group: ReqGroup; completedSet: Set<string>; planSet: Set<string> }) {
  const firstListIdx = group.nodes.findIndex(n => /^List\s*\d+:/i.test(n.text ?? ''));
  const hasRequiredSection = firstListIdx > 0;
  return (
    <div style={{ background: '#ececec', borderRadius: '15px', padding: '16px 20px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontFamily: SANS, fontSize: '20px', color: '#000' }}>{group.title}</div>
        <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '6px 16px', fontFamily: SANS, fontSize: '18px', flexShrink: 0, marginLeft: '12px' }}>
          {group.progress}
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(133,128,128,0.4)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {hasRequiredSection && (
          <div style={{ marginBottom: '2px' }}>
            <span style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Required Courses</span>
          </div>
        )}
        {group.nodes.map((n, i) => <ReqNodeView key={i} node={n} completedSet={completedSet} planSet={planSet} excludeCodes={group.nodeExcludeCodes} rawHtml={group.rawHtml} />)}
        {group.additional.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(133,128,128,0.2)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {group.additional.map((n, i) => (
              <ReqNodeView
                key={i}
                node={n}
                completedSet={completedSet}
                planSet={planSet}
                preAllocated={group.additionalAllocations[i]}
                rawHtml={group.rawHtml}
              />
            ))}
          </div>
        )}
        {group.exclusions.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(133,128,128,0.2)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {group.exclusions.map((n, i) => <ReqNodeView key={i} node={n} completedSet={completedSet} planSet={planSet} rawHtml={group.rawHtml} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCardTooltipBtn({ num, den, tooltip }: { num: number; den: number; tooltip: { num: string; den: string } }) {
  const [pos, setPos] = useState<{ left: number; right: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        onMouseEnter={() => {
          if (!ref.current) return;
          const r = ref.current.getBoundingClientRect();
          setPos({ left: r.left, right: r.right, y: r.bottom });
        }}
        onMouseLeave={() => setPos(null)}
        style={{
          width: '16px', height: '16px', borderRadius: '50%',
          background: '#c8c8c8', border: 'none', cursor: 'pointer',
          fontFamily: MONO, fontSize: '10px', color: '#858080',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, lineHeight: 1, padding: 0,
        }}
      >?</button>
      {pos && (
        <div style={{
          position: 'fixed',
          ...(pos.right > window.innerWidth / 2
            ? { right: window.innerWidth - pos.right }
            : { left: pos.left }),
          top: pos.y + 6,
          background: '#000', color: '#fff', borderRadius: '10px',
          padding: '10px 14px', zIndex: 9999, whiteSpace: 'nowrap',
          fontFamily: SANS, fontSize: '12px', lineHeight: 1.8,
          pointerEvents: 'none', textTransform: 'none',
        }}>
          <div><span style={{ color: '#858080' }}>numerator: </span>{num} — {tooltip.num}</div>
          <div><span style={{ color: '#858080' }}>denominator: </span>{den} — {tooltip.den}</div>
        </div>
      )}
    </>
  );
}

function StatCard({ num, den, label, plain, tooltip }: {
  num?: number; den?: number; label: string; plain?: string;
  tooltip?: { num: string; den: string };
}) {
  return (
    <div style={{ flex: 1, background: '#d9d9d9', borderRadius: '15px', padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      {num != null ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
          <span style={{ fontFamily: SANS, fontSize: '40px', color: '#000', lineHeight: 1, fontWeight: 400 }}>{num}</span>
          <span style={{ fontFamily: MONO, fontSize: '18px', color: '#858080', lineHeight: 1 }}>/{den}</span>
        </div>
      ) : (
        <div style={{ fontFamily: SANS, fontSize: '40px', color: '#000', lineHeight: 1, fontWeight: 400 }}>{plain}</div>
      )}
      <div style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '5px' }}>
        {label}
        {tooltip && num != null && den != null && <StatCardTooltipBtn num={num} den={den} tooltip={tooltip} />}
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export default function DegreePlan({ onNavigate: _onNavigate }: { onNavigate: (id: import('./Sidebar').PageId) => void }) {
  const [view, setView] = useState<'timeline' | 'requirements'>('timeline');
  const [showValidate, setShowValidate] = useState(false);
  const { completedCourses, semesterPlans, addCourseToTerm, removeCourseFromTerm, effectiveProgram: program, planEndTerm, setPlanEndTerm, savedPlans, activePlanId, switchPlan, courseOverrides, flowRatings, showDifficultyScore, favoriteCourses, termLabelOverrides, setTermLabelOverride } = useApp();
  const activePlanName = savedPlans.find(p => p.id === activePlanId)?.name ?? 'My Plan';
  const isMobile = useIsMobile();

  const getEffectiveLabel = (term: string): string | null => {
    if (termLabelOverrides[term]) return termLabelOverrides[term];
    if (!program.startTerm || !program.coopStream) return null;
    return getStudyLabel(term, program.startTerm, program.coopStream) ?? null;
  };

  // timeline state
  const [search, setSearch] = useState('');
  const [showFavs, setShowFavs] = useState(false);
  const [dragging, setDragging] = useState<{ code: string; fromTerm: string | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);
  const [hoveredDiffTerm, setHoveredDiffTerm] = useState<string | null>(null);
  const [labelPopoverTerm, setLabelPopoverTerm] = useState<string | null>(null);

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

  const { degreePlannedSum, degreeTotalSlots } = useMemo(
    () => computeDegreeHeadlineMetrics(programs, program, completedCourses, semesterPlans),
    [program, completedCourses, semesterPlans],
  );

  const terms = useMemo(
    () => effectivePlanTerms(program, planEndTerm),
    [program, planEndTerm],
  );

  const termEasyScores = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const term of terms) {
      const scores = (semesterPlans[term] ?? [])
        .map(code => { const r = flowRatings[code]; return r && r.filled_count >= 10 && r.easy !== null ? r.easy : null; })
        .filter((e): e is number => e !== null);
      out[term] = scores.length >= 2 ? scores.reduce((s, v) => s + v, 0) / scores.length : null;
    }
    return out;
  }, [terms, semesterPlans, flowRatings]);

  const planEndOptions = useMemo(
    () => planEndTermSelectOptions(program, semesterPlans, planEndTerm),
    [program, semesterPlans, planEndTerm],
  );

  const defaultPlanEnd = useMemo(() => inferredDefaultEndTerm(program), [program]);
  const effectivePlanEnd = useMemo(
    () => effectivePlanEndTerm(planEndTerm, program),
    [planEndTerm, program],
  );
  const allCourses = useApp().courses;
  const courseInfoMap = useMemo(() => new Map(allCourses.map(c => [c.code, c])), [allCourses]);

  function handleDrop(term: string) {
    if (!dragging) return;
    if (dragging.fromTerm && dragging.fromTerm !== term) removeCourseFromTerm(dragging.fromTerm, dragging.code);
    if (!(semesterPlans[term] ?? []).includes(dragging.code)) addCourseToTerm(term, dragging.code);
    setDragging(null);
    setDropTarget(null);
  }

  // requirements state
  // A course is "completed" only if it's NOT assigned to a future term.
  const completedSet = useMemo(
    () => expandWithLabCourses(new Set(completedCourses)),
    [completedCourses]
  );
  const planSet = expandWithLabCourses(new Set([...completedCourses, ...Object.values(semesterPlans).flat()]));

  const searchResults = useMemo(() => {
    const raw = search.trim();
    if (!raw) return [];
    const q = raw.toUpperCase().replace(/\s+/g, '');
    const qSpaced = q.replace(/([A-Z]+)(\d)/g, '$1 $2');
    const qWords = raw.toLowerCase().split(/\s+/).filter(Boolean);
    type Scored = { c: typeof allCourses[0]; score: number };
    const scored: Scored[] = [];
    for (const c of allCourses) {
      if (c.code.replace(/([A-Z]+)(\d)/g, '$1 $2').startsWith(qSpaced) || c.code.startsWith(q)) {
        scored.push({ c, score: 0 });
      } else if (qWords.length > 1 && qWords.every(w => c.name.toLowerCase().includes(w))) {
        scored.push({ c, score: 1 });
      } else if (q.length >= 3 && c.name.toUpperCase().includes(q)) {
        scored.push({ c, score: 1 });
      }
    }
    return scored
      .sort((a, b) => a.score - b.score || a.c.code.localeCompare(b.c.code))
      .slice(0, 30)
      .map(x => x.c);
  }, [search, allCourses]);

  const planIssues = useMemo(() => {
    const issues = new Map<string, PlanIssue>();
    const allPlanned = Object.values(semesterPlans).flat();
    const allTaken = new Set([...completedCourses, ...allPlanned]);
    const courseTermNum = new Map<string, number>();
    for (const [term, codes] of Object.entries(semesterPlans)) {
      const termN = termToNum(term);
      for (const code of codes) {
        const cur = courseTermNum.get(code);
        if (cur === undefined || termN < cur) courseTermNum.set(code, termN);
      }
    }
    for (const [term, codes] of Object.entries(semesterPlans)) {
      const termN = termToNum(term);
      const studentLevel = (() => { const l = getEffectiveLabel(term); return l?.startsWith('WT') ? null : l ?? null; })();
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
        const offered = courseInfoMap.get(code)?.offered ?? [];
        const offeredTerms = courseInfoMap.get(code)?.offeredTerms ?? null;
        const tSeason = term[0] as 'W' | 'S' | 'F';
        let notOffered: boolean;
        if (offeredTerms) {
          const maxN = Math.max(...offeredTerms.map(t => termToNum(t)));
          notOffered = termToNum(term) > maxN
            ? offered.length > 0 && !offered.includes(tSeason)
            : !offeredTerms.includes(term);
        } else {
          notOffered = offered.length > 0 && !offered.includes(tSeason);
        }
        const retaking = completedCourses.includes(code) && termToNum(term) >= termToNum(currentTerm) && (courseTermNum.get(code) ?? termToNum(term)) < termToNum(term);
        if (antireqList.length > 0 || missingPrereqs.length > 0 || restricted || requiredLevel || notOffered || retaking) {
          issues.set(`${term}:${code}`, { antireqs: antireqList, prereqs: missingPrereqs, restricted, requiredLevel, notOffered, retaking, capViolation: null, duplicate: false });
        }
      }
    }

    // Cap violation pass: flag courses that exceed "no more than N from" constraints
    const capGroupsInline: { codes: Set<string>; cap: number; label: string }[] = [];
    function extractCaps(node: ReqNode) {
      if (node.type === 'ADDITIONAL') {
        const m = (node.text ?? '').match(/no\s+more\s+than\s+(\d+)\s+from/i);
        if (m) {
          const cap = parseInt(m[1]);
          const codes = new Set([...(node.text ?? '').matchAll(/\b([A-Z]{2,8}\d{3}[A-Z]?)\b/g)].map(x => x[1]));
          if (codes.size > 0) capGroupsInline.push({ codes, cap, label: `${cap} from: ${[...codes].join('/')}` });
        }
      }
      for (const child of node.children ?? []) extractCaps(child);
    }
    const isMathStudiesInline = (rawPrograms as Record<string, { name: string }>)[program.id ?? '']?.name.includes('Mathematical Studies') ?? false;
    const coreIdInline = isMathStudiesInline ? 'core-bmath-mathstudies' : 'core-bmath';
    const scanIds = [coreIdInline, program.id, program.doubleMajorId, program.minorId, ...program.extras.map(e => e.id)].filter(Boolean) as string[];
    for (const id of scanIds) {
      for (const node of (rawPrograms as Record<string, { requirements?: ReqNode[] }>)[id]?.requirements ?? []) extractCaps(node);
    }
    const courseTermMap = new Map<string, string>();
    for (const [term, codes] of Object.entries(semesterPlans)) {
      for (const code of codes) if (!courseTermMap.has(code)) courseTermMap.set(code, term);
    }
    for (const { codes, cap, label } of capGroupsInline) {
      const completedInGroup = completedCourses.filter(c => codes.has(c)).length;
      const planInGroup = [...courseTermMap.entries()]
        .filter(([c]) => codes.has(c))
        .sort((a, b) => termToNum(a[1]) - termToNum(b[1]));
      const allowedInPlan = Math.max(0, cap - completedInGroup);
      const excess = planInGroup.slice(allowedInPlan);
      for (const [code, term] of excess) {
        const key = `${term}:${code}`;
        const existing = issues.get(key) ?? { antireqs: [], prereqs: [], restricted: false, requiredLevel: null, notOffered: false, retaking: false, capViolation: null, duplicate: false };
        issues.set(key, { ...existing, capViolation: label });
      }
    }

    // Duplicate detection: same course in multiple terms → flag all but the earliest
    const codeToTerms = new Map<string, string[]>();
    for (const [term, codes] of Object.entries(semesterPlans)) {
      for (const code of codes) {
        if (!codeToTerms.has(code)) codeToTerms.set(code, []);
        codeToTerms.get(code)!.push(term);
      }
    }
    for (const [code, terms] of codeToTerms) {
      if (terms.length < 2) continue;
      const sorted = [...terms].sort((a, b) => termToNum(a) - termToNum(b));
      for (const term of sorted.slice(1)) {
        const key = `${term}:${code}`;
        const existing = issues.get(key) ?? { antireqs: [], prereqs: [], restricted: false, requiredLevel: null, notOffered: false, retaking: false, capViolation: null, duplicate: false };
        issues.set(key, { ...existing, duplicate: true });
      }
    }

    return issues;
  }, [semesterPlans, completedCourses, courseInfoMap, program.id, program.doubleMajorId, program.minorId, program.extras, termLabelOverrides, program.startTerm, program.coopStream]);
  const shortName = (name: string) =>
    name.replace(' (Bachelor of Mathematics - Honours)', '')
        .replace(' (Bachelor of Mathematics)', '')
        .replace(' (Joint Honours)', ' (Joint)')
        .replace(' (Honours)', '');

  const makeGroup = (id: string, name: string, label: string, requirementsOverride?: ReqNode[], extraExclude?: ReadonlySet<string>): ReqGroup | null => {
    const entry = programs[id];
    if (!entry) return null;
    const r = requirementsOverride ?? entry.requirements ?? [];
    const top: ReqNode[] = r.length === 1 && r[0].children ? r[0].children : r;
    const isExclusion = (n: ReqNode) => n.type === 'COURSE' && !n.code && (n.children?.length ?? 0) > 0;
    const hasListSections = top.some(n => /^List\s*\d+:/i.test(n.text ?? ''));
    const sortRank = (n: ReqNode): 0 | 1 | 2 => {
      if (n.type === 'AND' || n.type === 'COURSE' || n.type === 'ADDITIONAL') return 0;
      const visible = (n.children ?? []).filter(c => !isWluOnly(c, planSet));
      if (visible.length === 0) return 0;
      if (visible.length === 1) return sortRank(unwrapSingle(visible[0]));
      return satisfies(n, planSet) ? 1 : 2;
    };
    const nodesFiltered = top.filter(n => (n.type !== 'ADDITIONAL' || isCompMathNonMathBlock(n) || isAmathSubjectConcentration(n)) && !isExclusion(n));
    const nodes = (hasListSections ? nodesFiltered : nodesFiltered.sort((a, b) => sortRank(a) - sortRank(b)))
      .map(n => adjustUndergradCommList2ForPlanDisplay(n, planSet));
    const additional = top.filter(n => n.type === 'ADDITIONAL' && !isCompMathNonMathBlock(n) && !isAmathSubjectConcentration(n));
    const exclusions = top.filter(isExclusion);

    let totalDone = 0, totalCount = 0;
    for (const n of top) {
      if (n.type === 'ADDITIONAL' && !isCompMathNonMathBlock(n) && !isAmathSubjectConcentration(n)) {
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

    // Sort most-restrictive first (level-constrained before unconstrained) so specific slots
    // claim their courses before the generic pool grabs them.
    const sorted = additional
      .map((node, idx) => ({ node, idx, levels: [...(node.text ?? '').matchAll(/\b[1-4]00[-–]/g)].length }))
      .sort((a, b) => b.levels - a.levels);

    const allocationByIdx = new Map<number, string[]>();
    for (const { node, idx } of sorted) {
      const subjects = extractSubjectsFromText(node.text ?? '');
      const levelNums = [...(node.text ?? '').matchAll(/\b([1-4])00[-–]/g)].map(m => parseInt(m[1]));
      const orHigher = /or\s+higher/i.test(node.text ?? '');
      const nFromText = (node.text ?? '').match(/Complete\s+(\d+)/i)?.[1];
      const n = node.n ?? (nFromText ? parseInt(nFromText) : 1);
      const codes = subjects.size === 0 ? [] : [...planSet].filter(c => {
        const subj = c.match(/^([A-Z]+)/)?.[1] ?? '';
        if (!subjects.has(subj) || requiredCodes.has(c) || globalAllocated.has(c) || extraExclude?.has(c)) return false;
        if (levelNums.length === 0) return true;
        const d = parseInt(c.slice(subj.length)[0]);
        return orHigher ? d >= levelNums[0] : levelNums.includes(d);
      }).slice(0, n);
      codes.forEach(c => globalAllocated.add(c));
      allocationByIdx.set(idx, codes);
    }
    const additionalAllocations = additional.map((_, i) => allocationByIdx.get(i) ?? []);
    for (const allocated of additionalAllocations) totalDone += allocated.length;

    return {
      pid: id,
      title: label.trim() ? `${label}: ${shortName(name)}` : shortName(name),
      progress: `${Math.round(totalDone)}/${totalCount}`,
      nodes,
      additional,
      exclusions,
      additionalAllocations,
      nodeExcludeCodes: new Set([...requiredCodes, ...globalAllocated, ...(extraExclude ?? [])]),
      rawHtml: entry.rawHtml ?? null,
    };
  };

  const progEntryForCore = program.id ? programs[program.id] : null;
  const isMathStudies = progEntryForCore?.name.includes('Mathematical Studies') ?? false;

  const makePdCoopGroup = (): ReqGroup | null => {
    const isCoop = program.coopStream !== null && program.coopStream !== 'none';
    if (!isCoop) return null;
    const names = new Map(allCourses.map(c => [c.code, c.name]));
    const staticPd = ['PD1', 'PD8', 'PD9', 'PD10', 'PD11', 'PD12', 'PD19', 'PD20', 'PD21', 'PD22'] as const;
    const fromApi = allCourses.filter(c => /^PD\d/i.test(c.code)).map(c => c.code);
    const merged = [...new Set([...staticPd, ...fromApi])].sort();
    const children: ReqNode[] = merged.map(code => ({
      type: 'COURSE' as const,
      code,
      text: `${code} - ${names.get(code) ?? 'Professional development'} (0.50)`,
    }));
    const pdRoot: ReqNode = {
      text: 'Complete 5 PD courses',
      type: 'N_OF',
      n: 5,
      children,
    };
    const p = nodeProgressAware(pdRoot, completedSet, planSet);
    return {
      pid: '',
      title: 'Professional Development (Co-op)',
      progress: `${Math.round(p.done)}/${p.total}`,
      nodes: [pdRoot],
      additional: [],
      exclusions: [],
      additionalAllocations: [],
      nodeExcludeCodes: new Set(courseCodes(pdRoot)),
    };
  };

  const coreId = isMathStudies ? 'core-bmath-mathstudies' : 'core-bmath';
  const coreName = programs[coreId]?.name ?? 'Core BMath';
  const extrasKey = program.extras.map(e => `${e.type}:${e.id}`).join('|');

  const patchedCoreRequirements = useMemo(
    () => patchCoreBmathRequirements(programs[coreId]?.requirements ?? [], program),
    [coreId, program.id, program.major, program.doubleMajor, program.doubleMajorId, extrasKey],
  );

  const coreRequiredCodes: ReadonlySet<string> = useMemo(() => {
    const top: ReqNode[] = patchedCoreRequirements.length === 1 && patchedCoreRequirements[0].children
      ? patchedCoreRequirements[0].children
      : patchedCoreRequirements;
    return new Set(top.flatMap(n => courseCodes(n)));
  }, [patchedCoreRequirements]);

  const REQUIREMENT_GROUPS: ReqGroup[] = [
    makeGroup(coreId, coreName, '', patchedCoreRequirements),
    program.id             ? makeGroup(program.id,           program.major,       'major',        undefined, coreRequiredCodes) : null,
    program.doubleMajorId  ? makeGroup(program.doubleMajorId, program.doubleMajor!, 'double major', undefined, coreRequiredCodes) : null,
    program.minorId        ? makeGroup(program.minorId,       program.minor!,      'minor',         undefined, coreRequiredCodes) : null,
    ...program.extras.map(e => makeGroup(e.id, e.name, e.type, undefined, coreRequiredCodes)),
    makePdCoopGroup(),
  ].filter((g): g is ReqGroup => g !== null);


  /**
   * Same “degree planned” numerator as the dashboard, but only courses that count as finished
   * before the current term: past-term placements plus onboarding completions not slotted in
   * the current or a future term.
   */
  const requirementsMetBeforeCurrent = useMemo(() => {
    const currentN = termToNum(currentTerm);
    const inCurrentOrFuture = new Set(
      Object.entries(semesterPlans)
        .filter(([t]) => termToNum(t) >= currentN)
        .flatMap(([, cs]) => cs),
    );
    const beforeCurrent = new Set<string>();
    for (const [term, codes] of Object.entries(semesterPlans)) {
      if (termToNum(term) >= currentN) continue;
      for (const c of codes) beforeCurrent.add(c);
    }
    for (const c of completedCourses) {
      if (!inCurrentOrFuture.has(c)) beforeCurrent.add(c);
    }
    return computeDegreeHeadlineMetrics(programs, program, completedCourses, semesterPlans, {
      plannedOrCompletedOverride: beforeCurrent,
    }).degreePlannedSum;
  }, [programs, program, completedCourses, semesterPlans, currentTerm]);

  const coursesLeft = Math.max(0, degreeTotalSlots - degreePlannedSum);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: isMobile ? '20px 16px 0' : '32px 48px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-start', gap: isMobile ? '16px' : 0, marginBottom: '20px' }}>
          <h1 style={{ fontFamily: SANS, fontSize: isMobile ? '36px' : '60px', color: '#000', lineHeight: 1, margin: 0, fontWeight: 400, animation: 'headingReveal 0.5s ease forwards' }}>
            your full<br />degree plan...
          </h1>
          <SlidingToggle
            options={[{ value: 'timeline', label: 'timeline' }, { value: 'requirements', label: 'requirements' }]}
            value={view}
            onChange={setView}
            height={isMobile ? 44 : 58}
            fontSize={isMobile ? 16 : 20}
            paddingX={isMobile ? 18 : 24}
          />
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[
            { num: Math.round(requirementsMetBeforeCurrent), den: degreeTotalSlots, l: 'COURSES DONE', tooltip: { num: 'unique requirement slots filled by completed courses, counting shared courses once, not including pd or labs', den: 'core bmath + major + non-math electives, counting shared courses once, not including pd or labs' } },
            { num: degreePlannedSum, den: degreeTotalSlots, l: 'COURSES PLANNED', tooltip: { num: 'unique requirement slots filled, counting shared courses once, not including pd or labs', den: 'core bmath + major + non-math electives, counting shared courses once, not including pd or labs' } },
            { num: null, den: null, l: 'GRAD TARGET', plain: gradTarget, tooltip: null },
          ].map((s) => (
            <div key={s.l} style={{ flex: 1, background: '#d9d9d9', borderRadius: '15px', padding: isMobile ? '12px 10px' : '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              {s.num != null ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                  <span style={{ fontFamily: SANS, fontSize: isMobile ? '28px' : '40px', color: '#000', lineHeight: 1, fontWeight: 400 }}>{s.num}</span>
                  <span style={{ fontFamily: MONO, fontSize: isMobile ? '13px' : '18px', color: '#858080', lineHeight: 1 }}>/{s.den}</span>
                </div>
              ) : (
                <div style={{ fontFamily: SANS, fontSize: isMobile ? '28px' : '40px', color: '#000', lineHeight: 1, fontWeight: 400 }}>{s.plain}</div>
              )}
              <div style={{ fontFamily: MONO, fontSize: isMobile ? '9px' : '12px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {s.l}
                {s.tooltip && s.num != null && s.den != null && <StatCardTooltipBtn num={s.num} den={s.den} tooltip={s.tooltip} />}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '8px' : '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>end term</span>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                value={effectivePlanEnd}
                onChange={e => {
                  const v = e.target.value;
                  if (v === defaultPlanEnd) setPlanEndTerm(null);
                  else setPlanEndTerm(v);
                }}
                style={{ appearance: 'none', background: '#ececec', border: 'none', borderRadius: '15px', padding: '10px 36px 10px 16px', fontFamily: SANS, fontSize: '15px', color: '#000', cursor: 'pointer', outline: 'none', minWidth: '88px' }}
              >
                {planEndOptions.map(t => (
                  <option key={t} value={t}>{t}{t === defaultPlanEnd ? ' (default)' : ''}</option>
                ))}
              </select>
              <svg width="12" height="12" viewBox="0 0 12 12" style={{ position: 'absolute', right: '14px', pointerEvents: 'none', color: '#858080' }}>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', flex: 1 }}>
            <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', letterSpacing: '0.06em' }}>plan</span>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flex: isMobile ? 1 : undefined }}>
              <select
                value={activePlanId}
                onChange={e => switchPlan(e.target.value)}
                style={{ appearance: 'none', background: '#ececec', border: 'none', borderRadius: '15px', padding: '10px 36px 10px 16px', fontFamily: SANS, fontSize: '15px', color: '#000', cursor: 'pointer', outline: 'none', width: isMobile ? '100%' : undefined }}
              >
                {savedPlans.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <svg width="12" height="12" viewBox="0 0 12 12" style={{ position: 'absolute', right: '14px', pointerEvents: 'none', color: '#858080' }}>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <button
              onClick={() => setShowValidate(v => !v)}
              style={{ background: showValidate ? '#000' : '#ececec', color: showValidate ? '#fff' : '#000', border: 'none', borderRadius: '15px', padding: '10px 16px', fontFamily: SANS, fontSize: '15px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: isMobile ? 0 : 'auto' }}
            >
              check plan
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
        <div style={{ flex: 1, display: view === 'timeline' ? 'flex' : 'none', gap: '24px', padding: isMobile ? '0 16px 24px' : '0 48px 32px', overflow: 'hidden', minHeight: 0 }}>

          {/* Search panel — hidden on mobile */}
          <div style={{ width: '240px', flexShrink: 0, display: isMobile ? 'none' : 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              <div style={{ border: '1px solid #000', borderRadius: '15px', padding: '10px 14px', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <span style={{ fontFamily: MONO, fontSize: '18px', marginRight: '8px', color: '#858080' }}>⌕</span>
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); if (e.target.value) setShowFavs(false); }}
                  placeholder="search courses..."
                  style={{ border: 'none', background: 'transparent', fontFamily: SANS, fontSize: '15px', color: '#000', outline: 'none', width: '100%' }}
                />
              </div>
              <svg
                onClick={() => { setShowFavs(f => !f); setSearch(''); }}
                viewBox="0 0 24 24" fill="currentColor"
                style={{ width: '22px', height: '22px', cursor: 'pointer', flexShrink: 0, color: showFavs ? '#e91e8c' : '#c0c0c0' }}
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {!search.trim() && !showFavs && <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>search and drag courses into a term</span>}
              {showFavs && !search.trim() && favoriteCourses.length === 0 && <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>no favourites yet</span>}
              {search.trim() && searchResults.length === 0 && <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>no results</span>}
              {(search.trim() ? searchResults : showFavs ? allCourses.filter(c => favoriteCourses.includes(c.code)) : []).map(c => (
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
          <div onClick={() => setLabelPopoverTerm(null)} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                    display: 'flex', alignItems: 'stretch', gap: '16px', padding: '10px 16px', borderRadius: '15px',
                    background: isOver ? '#f0f0f0' : isCurrent ? '#f8f8f8' : 'transparent',
                    border: isOver ? '1px dashed #000' : isCurrent ? '1px solid #e0e0e0' : '1px solid transparent',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                >
                  <div style={{ width: '110px', flexShrink: 0, display: 'flex', alignItems: 'center', paddingRight: '16px', borderRight: '1px solid #e0e0e0', fontFamily: MONO, fontSize: '14px', color: isPast ? '#c0c0c0' : isCurrent ? '#000' : '#858080', fontWeight: isCurrent ? 700 : 400, position: 'relative' }}>
                    {term}
                    {(() => {
                      const sl = getEffectiveLabel(term);
                      if (!sl) return null;
                      const isOpen = labelPopoverTerm === term;
                      return (
                        <>
                          <span
                            onClick={e => { e.stopPropagation(); setLabelPopoverTerm(isOpen ? null : term); }}
                            style={{ marginLeft: '2px', cursor: 'pointer', borderRadius: '4px', padding: '1px 3px', background: isOpen ? '#e0e0e0' : 'transparent', transition: 'background 0.1s' }}
                          >({sl})</span>
                          {isOpen && (
                            <div
                              onClick={e => e.stopPropagation()}
                              style={{ position: 'absolute', top: '100%', left: 0, marginTop: '6px', background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '10px 12px', zIndex: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '8px' }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontFamily: SANS, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.05em' }}>study</span>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  {(['1A','1B','2A','2B','3A','3B','4A','4B'] as const).map(lbl => (
                                    <button key={lbl} onClick={() => { setTermLabelOverride(term, lbl === getStudyLabel(term, program.startTerm ?? '', program.coopStream ?? '1') && !termLabelOverrides[term] ? null : lbl); setLabelPopoverTerm(null); }}
                                      style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 400, border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', background: sl === lbl ? '#000' : '#ececec', color: sl === lbl ? '#fff' : '#000', transition: 'background 0.1s' }}>
                                      {lbl}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontFamily: SANS, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.05em' }}>work</span>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  {(['WT1','WT2','WT3','WT4','WT5','WT6'] as const).map(lbl => (
                                    <button key={lbl} onClick={() => { setTermLabelOverride(term, lbl); setLabelPopoverTerm(null); }}
                                      style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 400, border: 'none', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', background: sl === lbl ? '#000' : '#ececec', color: sl === lbl ? '#fff' : '#000', transition: 'background 0.1s' }}>
                                      {lbl}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {termLabelOverrides[term] && (
                                <button onClick={() => { setTermLabelOverride(term, null); setLabelPopoverTerm(null); }}
                                  style={{ fontFamily: SANS, fontSize: '12px', fontWeight: 400, color: '#858080', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0' }}>
                                  reset to default
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, alignItems: 'flex-start', alignContent: 'flex-start', padding: '13px 0' }}>
                    {termCourses.map(code => {
                      const issue = planIssues.get(`${term}:${code}`);
                      const tooltipLines: string[] = [];
                      if (issue?.notOffered) tooltipLines.push(`not offered in ${term[0] === 'F' ? 'Fall' : term[0] === 'W' ? 'Winter' : 'Spring'}`);
                      if (issue?.requiredLevel) tooltipLines.push(`level at least ${issue.requiredLevel} required`);
                      if (issue?.restricted) tooltipLines.push('not open to Math students');
                      if (issue?.prereqs.length) {
                        const missingText = issue.prereqs
                          .map(g => g.length > 1 ? `One of ${g.join(', ')}` : g[0])
                          .join(' and ');
                        tooltipLines.push(`missing prereq: ${missingText}`);
                      }
                      if (issue?.antireqs.length) tooltipLines.push(`antireq conflict: ${issue.antireqs.join(', ')}`);
                      if (issue?.capViolation) tooltipLines.push(`cap exceeded: at most ${issue.capViolation}`);
                      if (issue?.retaking || issue?.duplicate) tooltipLines.push('already in plan');
                      const chipKey = `${term}:${code}`;
                      const isOverridden = courseOverrides.has(code);
                      const showTooltip = hoveredChip === chipKey;
                      return (
                      <div
                        key={code}
                        draggable
                        onDragStart={e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; setChipDragImage(e, code); setDragging({ code, fromTerm: term }); }}
                        onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                        onMouseEnter={() => (issue || isOverridden) && setHoveredChip(chipKey)}
                        onMouseLeave={() => setHoveredChip(null)}
                        style={{
                          position: 'relative',
                          background: issue && !isOverridden ? '#c60078' : isPast ? '#858080' : '#000', color: '#fff', borderRadius: '40px', padding: '0 14px', height: '38px',
                          display: 'flex', alignItems: 'center', gap: '8px', fontFamily: MONO, fontSize: '14px',
                          cursor: isPast ? 'default' : 'grab', userSelect: 'none', flexShrink: 0,
                          opacity: dragging?.code === code && dragging.fromTerm === term ? 0.3 : 1,
                          transition: 'background 0.15s, opacity 0.1s',
                        }}
                      >
                        {code}
                        <span onClick={e => { e.stopPropagation(); removeCourseFromTerm(term, code); }} style={{ cursor: 'pointer', opacity: 0.5, fontSize: '16px', lineHeight: 1 }}>×</span>
                        {showTooltip && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, marginTop: '6px',
                            background: '#1a1a1a', color: '#fff', borderRadius: '10px',
                            padding: '8px 12px', zIndex: 50, pointerEvents: 'none',
                            display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 'max-content',
                          }}>
                            {isOverridden
                              ? <span style={{ fontFamily: SANS, fontSize: '13px', fontWeight: 400 }}>override submitted</span>
                              : tooltipLines.map((line, i) => (
                                  <span key={i} style={{ fontFamily: SANS, fontSize: '13px', fontWeight: 400 }}>{line}</span>
                                ))
                            }
                          </div>
                        )}
                      </div>
                      );
                    })}
                    {termCourses.length === 0 && (
                      <span style={{ fontFamily: MONO, fontSize: '13px', color: '#d0d0d0' }}>{isMobile ? 'empty' : 'drag courses here'}</span>
                    )}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', flexShrink: 0, display: 'flex', alignItems: 'center' }}>{termCourses.filter(c => !c.startsWith('PD') && c !== 'MTHEL99').length}/5</div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '0 16px 24px' : '0 48px 32px', display: view === 'requirements' ? 'block' : 'none' }}>
          {REQUIREMENT_GROUPS.map((g, i) => <RequirementGroup key={i} group={g} completedSet={completedSet} planSet={planSet} />)}
          <NonMathElectivesGroup completedSet={completedSet} planSet={planSet} />
        </div>

      {showValidate && <ValidatePanel groups={REQUIREMENT_GROUPS} planIssues={planIssues} completedSet={completedSet} planSet={planSet} onClose={() => setShowValidate(false)} />}
    </div>
  );
}
