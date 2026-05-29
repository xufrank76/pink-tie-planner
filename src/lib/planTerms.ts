import { computeGradTerm } from '@/src/data/coopSequences';
import { getCurrentTerm, nextTerm, termToNum } from '@/src/lib/termUtils';
import type { UserProgram } from '@/src/types/program';

const TERM_RE = /^[WFS]\d{2}$/;

export function isValidPlanTerm(t: string): boolean {
  return TERM_RE.test(t);
}

/** Inclusive range [start, end] in calendar order. */
export function buildTermRangeInclusive(start: string, end: string): string[] {
  if (!isValidPlanTerm(start) || !isValidPlanTerm(end)) return isValidPlanTerm(start) ? [start] : [];
  if (termToNum(end) < termToNum(start)) return [start];
  const terms: string[] = [];
  let t = start;
  while (termToNum(t) <= termToNum(end)) {
    terms.push(t);
    t = nextTerm(t);
  }
  return terms;
}

/** Co-op final study term (4B), or null if not computable. */
export function coopsDefaultGradTerm(program: UserProgram): string | null {
  if (!program.startTerm || !program.coopStream) return null;
  return computeGradTerm(program.startTerm, program.coopStream);
}

/** End term when the user has not set `planEndTerm`: co-op grad, else start + 11 terms. */
export function inferredDefaultEndTerm(program: UserProgram): string {
  const start = program.startTerm ?? getCurrentTerm();
  const grad = coopsDefaultGradTerm(program);
  if (grad) return grad;
  let t = start;
  for (let i = 0; i < 11; i++) t = nextTerm(t);
  return t;
}

/**
 * Effective last term on the plan timeline. User override wins when valid and ≥ start;
 * otherwise co-op / 12-term default.
 */
export function effectivePlanEndTerm(planEndTerm: string | null, program: UserProgram): string {
  const start = program.startTerm ?? getCurrentTerm();
  const fallback = inferredDefaultEndTerm(program);
  const raw = planEndTerm && isValidPlanTerm(planEndTerm) ? planEndTerm : fallback;
  return termToNum(raw) < termToNum(start) ? start : raw;
}

export function effectivePlanTerms(program: UserProgram, planEndTerm: string | null): string[] {
  const start = program.startTerm ?? getCurrentTerm();
  const end = effectivePlanEndTerm(planEndTerm, program);
  return buildTermRangeInclusive(start, end);
}

/** Terms from start through max(default end, pinned end, any term that has courses), plus buffer. */
export function planEndTermSelectOptions(
  program: UserProgram,
  semesterPlans: Record<string, string[]>,
  planEndTerm: string | null,
  extraTermsPastContent = 8,
): string[] {
  const start = program.startTerm ?? getCurrentTerm();
  let last = inferredDefaultEndTerm(program);
  const pinned = planEndTerm && isValidPlanTerm(planEndTerm) ? planEndTerm : null;
  if (pinned && termToNum(pinned) > termToNum(last)) last = pinned;
  for (const [t, codes] of Object.entries(semesterPlans)) {
    if (codes?.length && isValidPlanTerm(t) && termToNum(t) > termToNum(last)) last = t;
  }
  let t = last;
  for (let i = 0; i < extraTermsPastContent; i++) t = nextTerm(t);
  return buildTermRangeInclusive(start, t);
}

/** Drop planned courses in calendar terms after `lastInclusiveTerm`. */
export function pruneSemesterPlansBeyond(
  plans: Record<string, string[]>,
  lastInclusiveTerm: string,
): Record<string, string[]> {
  if (!isValidPlanTerm(lastInclusiveTerm)) return { ...plans };
  const endN = termToNum(lastInclusiveTerm);
  const next: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(plans)) {
    if (!isValidPlanTerm(k)) continue;
    if (termToNum(k) <= endN) next[k] = [...v];
  }
  return next;
}
