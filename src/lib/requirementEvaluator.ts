export interface ReqNode {
  text: string;
  type: 'AND' | 'OR' | 'N_OF' | 'COURSE' | 'ADDITIONAL';
  code?: string;
  n?: number;
  children?: ReqNode[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function courseSubject(code: string): string {
  return code.match(/^([A-Z]+)/)?.[1] ?? '';
}

function courseLevel(code: string): number {
  const m = code.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

export function unitsToCoursesFromText(text: string): number | null {
  const m = text.match(/\b(\d+(?:\.\d+)?)\s+(?:additional\s+)?units?\b/i);
  return m ? Math.round(parseFloat(m[1]) * 2) : null;
}

export function extractAdditionalN(text: string): number | null {
  const fromUnits = unitsToCoursesFromText(text);
  if (fromUnits != null) return fromUnits;
  // Check for explicit "Complete N courses" BEFORE checking for "no more than" —
  // some texts say "Complete 8 courses... with no more than 4 from X" and the primary count
  // should win over the secondary constraint phrase.
  const m = text.match(/Complete\s+(\d+)\b/i);
  if (m && /\bcourses?\b/i.test(text)) return parseInt(m[1]);
  if (/no\s+more\s+than/i.test(text)) return null;
  return null;
}

export function extractSubjectsFromText(text: string): Set<string> {
  const tryParse = (raw: string): Set<string> | null => {
    const codes = raw.split(/[,\s/]+/).map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{2,8}$/.test(s));
    return codes.length > 0 ? new Set(codes) : null;
  };
  // "subject codes (...): X, Y, Z" — list follows colon after optional parenthetical
  const afterParen = text.match(/subject\s+codes?\s*(?:\([^)]*\))?\s*:\s*([A-Z][A-Z0-9,\s/]+?)(?:[;.\n]|$)/i);
  if (afterParen) { const r = tryParse(afterParen[1]); if (r) return r; }
  // "from: X, Y, Z" or "subject codes (X, Y, Z)" — list is inline or parenthesized; semicolon ends the list
  const inline = text.match(/(?:from:|subject\s+codes?\s*\()\s*([A-Z][A-Z0-9,\s/]+?)(?:[);.\n]|$)/i);
  if (inline) { const r = tryParse(inline[1]); if (r) return r; }
  // Single subject: "X courses" — only when no "from:" list was found above
  const single = text.match(/\b([A-Z]{2,8})\s+courses?/i)?.[1]?.toUpperCase();
  if (single) return new Set([single]);
  return new Set();
}

function nodeProgressAdditionalGeneral(node: ReqNode, completed: Set<string>): { done: number; total: number } {
  const text = node.text ?? '';
  const n = node.n != null ? node.n : extractAdditionalN(text);
  if (n == null) return { done: 0, total: 0 };
  const subjects = extractSubjectsFromText(text);
  // "Complete N courses from the options in List X" — this is a stub pointer to a sibling N_OF
  // node that already counts these slots; return 0 to avoid double-counting.
  if (subjects.size === 0 && /\bList\s+\d+\b/i.test(text)) return { done: 0, total: 0 };
  if (subjects.size === 0) return { done: 0, total: n };
  const levels = [...text.matchAll(/\b([1-4])00[-–]/g)].map(m => parseInt(m[1]));
  const orHigher = /or\s+higher/i.test(text);
  const done = [...completed].filter(code => {
    const subj = courseSubject(code);
    if (!subjects.has(subj)) return false;
    if (levels.length === 0) return true;
    const lvl = Math.floor(courseLevel(code) / 100);
    return orHigher ? lvl >= levels[0] : levels.includes(lvl);
  }).length;
  return { done: Math.min(done, n), total: n };
}

// ── BMath Undergrad Communication Requirement ─────────────────────────────────

export function isMathUndergradCommBlock(node: ReqNode): boolean {
  return node.type === 'AND' && /Undergraduate Communication Requirement/i.test(node.text ?? '');
}

export function satisfiesMathUndergradComm(node: ReqNode, completed: Set<string>): boolean {
  const ch = node.children ?? [];
  if (ch.length !== 2 || ch[0].type !== 'OR' || ch[1].type !== 'OR') return false;
  const L1 = new Set(courseCodes(ch[0]));
  const L2e = new Set(courseCodes(ch[1]));
  const U = new Set([...L1, ...L2e]);
  const hasL1 = [...L1].some(c => completed.has(c));
  const distinctInU = [...U].filter(c => completed.has(c));
  if (distinctInU.length < 2) return false;
  return hasL1;
}

export function nodeProgressMathUndergradComm(node: ReqNode, completed: Set<string>): { done: number; total: number } {
  const ch = node.children ?? [];
  if (ch.length !== 2 || ch[0].type !== 'OR' || ch[1].type !== 'OR') return { done: 0, total: 2 };
  const L1 = new Set(courseCodes(ch[0]));
  const L2e = new Set(courseCodes(ch[1]));
  const U = new Set([...L1, ...L2e]);
  const hasL1 = [...L1].some(c => completed.has(c));
  const k = [...U].filter(c => completed.has(c)).length;
  if (satisfiesMathUndergradComm(node, completed)) return { done: 2, total: 2 };
  if (hasL1 && k >= 2) return { done: 2, total: 2 };
  if (hasL1) return { done: 1, total: 2 };
  if (k >= 2) return { done: 1, total: 2 };
  return { done: Math.min(1, k), total: 2 };
}

/** Second slot is only ENGL378 / MTHEL300 (Statistics, Actuarial Science, or Biostatistics core patch). */
export function isStatActsciCommBlock(node: ReqNode): boolean {
  if (!isMathUndergradCommBlock(node)) return false;
  const ch = node.children ?? [];
  if (ch.length !== 2 || ch[1].type !== 'OR') return false;
  const codes = courseCodes(ch[1]);
  if (codes.length === 0) return false;
  return codes.every(c => c === 'ENGL378' || c === 'MTHEL300');
}

export function satisfiesStatActsciComm(node: ReqNode, completed: Set<string>): boolean {
  const ch = node.children ?? [];
  if (ch.length !== 2 || ch[0].type !== 'OR') return false;
  const L1 = new Set(courseCodes(ch[0]));
  const hasL1 = [...L1].some(c => completed.has(c));
  const has378 = completed.has('ENGL378') || completed.has('MTHEL300');
  return hasL1 && has378;
}

export function nodeProgressStatActsciComm(node: ReqNode, completed: Set<string>): { done: number; total: number } {
  if (satisfiesStatActsciComm(node, completed)) return { done: 2, total: 2 };
  const ch = node.children ?? [];
  if (ch.length < 2) return { done: 0, total: 2 };
  const L1 = new Set(courseCodes(ch[0]));
  const hasL1 = [...L1].some(c => completed.has(c));
  const has378 = completed.has('ENGL378') || completed.has('MTHEL300');
  if (hasL1 && has378) return { done: 2, total: 2 };
  if (hasL1) return { done: 1, total: 2 };
  if (has378) return { done: 1, total: 2 };
  return { done: 0, total: 2 };
}

// ── Applied Mathematics: subject concentration (4 courses, one subject code) ──

const AMATH_CONCENTRATION_SUBJECTS = new Set([
  'AE', 'BIOL', 'BME', 'CHE', 'CHEM', 'CIVE', 'EARTH', 'ECE',
  'ECON', 'ENVE', 'GEOE', 'GEOG', 'ME', 'MNS', 'MSE', 'MTE', 'NE', 'PHYS', 'SYDE',
]);

export { AMATH_CONCENTRATION_SUBJECTS };

export function isAmathSubjectConcentration(node: ReqNode): boolean {
  return node.type === 'ADDITIONAL' && /subject\s+concentration/i.test(node.text ?? '');
}

export function parseConcentrationSubjects(node: ReqNode): Set<string> {
  const text = node.text ?? '';
  const m = text.match(/subject\s+codes?:\s*([A-Z/,\s]+)/i);
  if (!m) return AMATH_CONCENTRATION_SUBJECTS;
  const raw = m[1].split(/[,\s]+/).flatMap(s => s.split('/'));
  return new Set(raw.map(s => s.trim().toUpperCase()).filter(Boolean));
}

export function satisfiesAmathSubjectConcentration(node: ReqNode, completed: Set<string>): boolean {
  const subjects = parseConcentrationSubjects(node);
  const n = node.n ?? 4;
  const groups = new Map<string, number>();
  for (const code of completed) {
    const subj = courseSubject(code);
    if (!subjects.has(subj)) continue;
    groups.set(subj, (groups.get(subj) ?? 0) + 1);
  }
  for (const count of groups.values()) if (count >= n) return true;
  return false;
}

export function nodeProgressAmathConcentration(node: ReqNode, completed: Set<string>): { done: number; total: number } {
  const subjects = parseConcentrationSubjects(node);
  const n = node.n ?? 4;
  const groups = new Map<string, number>();
  for (const code of completed) {
    const subj = courseSubject(code);
    if (!subjects.has(subj)) continue;
    groups.set(subj, (groups.get(subj) ?? 0) + 1);
  }
  let best = 0;
  for (const count of groups.values()) best = Math.max(best, count);
  return { done: Math.min(best, n), total: n };
}

// ── Computational Mathematics: 3 non-math courses ────────────────────────────

const COMP_MATH_NON_MATH_SUBJECTS = new Set([
  'AE', 'BIOL', 'BME', 'CHE', 'CHEM', 'CIVE', 'EARTH', 'ECE',
  'ECON', 'ENVE', 'GEOE', 'ME', 'MNS', 'MSE', 'MTE', 'NE', 'PHYS', 'SYDE',
]);

export function isCompMathNonMathBlock(node: ReqNode): boolean {
  return node.type === 'ADDITIONAL' && /non-math courses/i.test(node.text ?? '');
}

export function satisfiesCompMathNonMath(_node: ReqNode, completed: Set<string>): boolean {
  const groups = new Map<string, string[]>();
  for (const code of completed) {
    const subj = courseSubject(code);
    if (!COMP_MATH_NON_MATH_SUBJECTS.has(subj)) continue;
    if (!groups.has(subj)) groups.set(subj, []);
    groups.get(subj)!.push(code);
  }
  for (const courses of groups.values()) {
    if (courses.length >= 3 && courses.some(c => courseLevel(c) >= 200)) return true;
  }
  return false;
}

export function nodeProgressCompMathNonMath(node: ReqNode, completed: Set<string>): { done: number; total: number } {
  if (satisfiesCompMathNonMath(node, completed)) return { done: 3, total: 3 };
  const groups = new Map<string, string[]>();
  for (const code of completed) {
    const subj = courseSubject(code);
    if (!COMP_MATH_NON_MATH_SUBJECTS.has(subj)) continue;
    if (!groups.has(subj)) groups.set(subj, []);
    groups.get(subj)!.push(code);
  }
  let best = 0;
  for (const courses of groups.values()) best = Math.max(best, courses.length);
  return { done: Math.min(best, 3), total: 3 };
}

// ── Computational Mathematics: 4 additional (400-level + 2 subject codes) ────

export function isCompMathAdditionalBlock(node: ReqNode): boolean {
  return node.type === 'N_OF' && node.n === 4 && /400-level/i.test(node.text ?? '');
}

export function satisfiesCompMathAdditional(node: ReqNode, completed: Set<string>): boolean {
  const pool = new Set(courseCodes(node));
  const taken = [...completed].filter(c => pool.has(c));
  if (taken.length < 4) return false;
  if (taken.filter(c => courseLevel(c) >= 400).length < 2) return false;
  return new Set(taken.map(courseSubject)).size >= 2;
}

export function nodeProgressCompMathAdditional(node: ReqNode, completed: Set<string>): { done: number; total: number } {
  if (satisfiesCompMathAdditional(node, completed)) return { done: 4, total: 4 };
  const pool = new Set(courseCodes(node));
  const taken = [...completed].filter(c => pool.has(c));
  return { done: Math.min(taken.length, 4), total: 4 };
}

// ── Core evaluator ────────────────────────────────────────────────────────────

export function satisfies(node: ReqNode, completed: Set<string>): boolean {
  switch (node.type) {
    case 'COURSE':
      return !!node.code && completed.has(node.code);
    case 'AND': {
      if (isStatActsciCommBlock(node)) return satisfiesStatActsciComm(node, completed);
      if (isMathUndergradCommBlock(node)) return satisfiesMathUndergradComm(node, completed);
      return (node.children ?? []).every(c => satisfies(c, completed));
    }
    case 'OR':
      return (node.children ?? []).some(c => satisfiesOrBranch(c, completed));
    case 'N_OF': {
      if (isCompMathAdditionalBlock(node)) return satisfiesCompMathAdditional(node, completed);
      const done = (node.children ?? []).filter(c => satisfies(c, completed)).length;
      return done >= (node.n ?? 1);
    }
    case 'ADDITIONAL':
      if (isCompMathNonMathBlock(node)) return satisfiesCompMathNonMath(node, completed);
      if (isAmathSubjectConcentration(node)) return satisfiesAmathSubjectConcentration(node, completed);
      // "If COURSE is taken, ..." — conditional guard; only satisfied if that course is in the set
      { const m = (node.text ?? '').match(/^If\s+([A-Z]{2,8}\d{3}[A-Z]?)\s+is\s+taken/i);
        if (m) return completed.has(m[1]); }
      return true; // informational — doesn't block parent AND satisfaction
    default:
      return false;
  }
}

// How an OR evaluates a child branch. Generic ADDITIONAL nodes return true from
// satisfies() so they don't block parent ANDs — but as an OR branch that would make
// the OR trivially satisfied (hiding real choices like MATH239/249 in PMATH Joint).
export function satisfiesOrBranch(node: ReqNode, completed: Set<string>): boolean {
  if (node.type !== 'ADDITIONAL' || isCompMathNonMathBlock(node) || isAmathSubjectConcentration(node))
    return satisfies(node, completed);
  const mentioned = [...(node.text ?? '').matchAll(/\b([A-Z]{2,8}\d{3}[A-Z]?)\b/g)].map(m => m[1]);
  // Explicit course codes (e.g. WLU alternates "Complete all the following: BUS127W")
  if (mentioned.length > 0) return mentioned.every(c => completed.has(c));
  // Subject pools ("1 additional PMATH course") / free-form — not verifiable from a set
  return false;
}

export function nodeProgress(node: ReqNode, completed: Set<string>): { done: number; total: number } {
  switch (node.type) {
    case 'COURSE':
      if (!node.code) return { done: 0, total: 0 };
      return { done: completed.has(node.code) ? 1 : 0, total: 1 };
    case 'OR':
      return { done: satisfies(node, completed) ? 1 : 0, total: 1 };
    case 'AND': {
      if (isStatActsciCommBlock(node)) return nodeProgressStatActsciComm(node, completed);
      if (isMathUndergradCommBlock(node)) return nodeProgressMathUndergradComm(node, completed);
      const t = (node.text ?? '').trimStart();
      if (/^choose\s+any/i.test(t)) return { done: 0, total: 0 };
      if (/^complete\s+no\s+more\s+than/i.test(t)) return { done: 0, total: 0 };
      // Special: ADDITIONAL "courses listed below" + "Choose any" sibling — the sibling is a pool
      // definition, not a separate slot; count only the ADDITIONAL's n slots
      const listedBelowAdd = (node.children ?? []).find(c => c.type === 'ADDITIONAL' && /courses?\s+listed\s+below/i.test(c.text ?? ''));
      const chooseAnySibling = listedBelowAdd ? (node.children ?? []).find(c => c !== listedBelowAdd && (c.type === 'OR' || (c.type === 'AND' && /^choose\s+any/i.test(c.text ?? '')))) : undefined;
      if (listedBelowAdd && chooseAnySibling) {
        const listedCodes = new Set(courseCodes(chooseAnySibling));
        const text = listedBelowAdd.text ?? '';
        const n = listedBelowAdd.n ?? extractAdditionalN(text) ?? 1;
        const subjects = extractSubjectsFromText(text);
        const levels = [...text.matchAll(/\b([1-4])00[-–]/g)].map(m => parseInt(m[1]));
        const done = [...completed].filter(code => {
          if (listedCodes.has(code)) return true;
          const subj = courseSubject(code);
          if (!subjects.has(subj)) return false;
          if (levels.length === 0) return true;
          return levels.includes(Math.floor(courseLevel(code) / 100));
        }).length;
        return { done: Math.min(done, n), total: n };
      }
      // AND wrapper with a leading descriptive ADDITIONAL ("Complete N courses/units from the following choices:")
      const leadingLabel = (node.children ?? []).find(c => c.type === 'ADDITIONAL' && c.n == null && courseCodes(c).length === 0);
      if (leadingLabel) {
        const nMatch = (leadingLabel.text ?? '').match(/Complete\s+(\d+(?:\.\d+)?)\s+(courses?|units?)\s+from/i);
        if (nMatch) {
          const rawN = parseFloat(nMatch[1]);
          const n = /units?/i.test(nMatch[2]) ? Math.round(rawN / 0.5) : Math.round(rawN);
          const nonLabel = (node.children ?? []).filter(c => c !== leadingLabel);
          const groupsDone = nonLabel.length === 1
            ? courseCodes(nonLabel[0]).filter(code => completed.has(code)).length
            : nonLabel.filter(c => courseCodes(c).some(code => completed.has(code))).length;
          return { done: Math.min(groupsDone, n), total: n };
        }
      }
      const nonAdditional = (node.children ?? []).filter(c => c.type !== 'ADDITIONAL');
      const additional = (node.children ?? []).filter(c => c.type === 'ADDITIONAL');
      // Nested AND children (required course blocks) must be recursed — counting as 1 slot
      // would under-count. Pool/constraint ANDs (choose any / no more than) still count as 1.
      let nonAddDone = 0;
      let nonAddTotal = 0;
      for (const c of nonAdditional) {
        if (c.type === 'AND') {
          const ct = (c.text ?? '').trimStart();
          const isPool = /^choose\s+any/i.test(ct) || /^complete\s+no\s+more\s+than/i.test(ct);
          if (!isPool) {
            const p = nodeProgress(c, completed);
            nonAddDone += p.done;
            nonAddTotal += p.total;
            continue;
          }
        }
        nonAddDone += satisfies(c, completed) ? 1 : 0;
        nonAddTotal += 1;
      }
      const addProgress = additional.reduce(
        (acc, c) => { const p = nodeProgress(c, completed); return { done: acc.done + p.done, total: acc.total + p.total }; },
        { done: 0, total: 0 }
      );
      return { done: nonAddDone + addProgress.done, total: nonAddTotal + addProgress.total };
    }
    case 'N_OF': {
      if (isCompMathAdditionalBlock(node)) return nodeProgressCompMathAdditional(node, completed);
      const n = node.n ?? 1;
      return {
        done: Math.min((node.children ?? []).filter(c => satisfies(c, completed)).length, n),
        total: n,
      };
    }
    case 'ADDITIONAL':
      if (isCompMathNonMathBlock(node)) return nodeProgressCompMathNonMath(node, completed);
      if (isAmathSubjectConcentration(node)) return nodeProgressAmathConcentration(node, completed);
      return nodeProgressAdditionalGeneral(node, completed);
    default:
      return { done: 0, total: 0 };
  }
}

export function courseCodes(node: ReqNode): string[] {
  if (node.type === 'COURSE' && node.code) return [node.code];
  return (node.children ?? []).flatMap(courseCodes);
}
