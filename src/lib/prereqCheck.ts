// Extracts course codes from a string, handling abbreviated lists like
// "MATH 106, 114, 115, 136" where the subject prefix is shared.
function extractCourseCodes(str: string): string[] {
  const codes: string[] = [];
  let lastSubject = '';
  // Match full "SUBJECT NUM" pairs, or standalone 3-digit numbers (abbreviated form)
  const re = /\b([A-Z]{2,8})\s+(\d{1,3}[A-Z]?)\b|\b(\d{3}[A-Z]?)\b/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m[1]) {
      lastSubject = m[1];
      codes.push(m[1] + m[2]);
    } else if (m[3] && lastSubject) {
      codes.push(lastSubject + m[3]);
    }
  }
  return codes;
}

// Programs clearly outside the Faculty of Mathematics. Matches both the "X students only"
// pattern (belt) and the implicit "Level at least XY X" pattern (suspenders).
const NON_MATH_FACULTY_RE = /\b(?:architect(?:ure|ural)|pharmacy|optometry|kinesiology|dental|electrical\s+engineering|computer\s+engineering|mechanical\s+engineering|civil\s+engineering|chemical\s+engineering|systems\s+design(?:\s+engineering)?|software\s+engineering|nanotechnology(?:\s+engineering)?|management\s+engineering|environmental\s+engineering|geological\s+engineering|biomedical\s+engineering|aerospace\s+engineering|engineering\s+students)\b/i;

// Returns true if the prereq string restricts general Honours Math faculty students.
// Three patterns detected:
//  1. "Not open to Math..." — explicit Math exclusion (not sub-programs/joint programs)
//  2. "X only" / "X students only" — positive restriction not accessible to Math
//  3. Implicit non-Math faculty program name (Architecture, Pharmacy, etc.)
export function isMathRestricted(prereqStr: string, userMajor?: string): boolean {
  const majorCore = userMajor?.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase() ?? '';

  const clauses = prereqStr.split(/[.;]/);
  for (const clause of clauses) {
    const isExclusion = /not open to/i.test(clause);

    // Pattern 1: explicit Math exclusion
    if (isExclusion && /math/i.test(clause)) {
      if (/credit\s+for|received\s+credit/i.test(clause)) continue;
      if (/gen\s*math|general\s+math/i.test(clause)) continue;
      if (/double\s+degree/i.test(clause)) continue;
      if (/math[a-z]*\s*\/|\/\s*[a-z]*math/i.test(clause)) continue;
      // "BMATH" appearing inside parens is a degree-type qualifier for a specific named program
      // e.g. "Not open to ... Data Science (BCS, BMATH), BCFM, BSE students"
      // — the BMATH here means the Data Science BMATH stream, not all Math faculty students.
      if (/\(.*\bBMATH\b.*\)/i.test(clause)) continue;
      return true;
    }

    // Pattern 2: positive restriction ("X only")
    if (/\bonly\b/i.test(clause)) {
      if (/double\s+degree|\bBBA\b/i.test(clause)) return true;
      if (/math/i.test(clause)) continue;
      if (/co-op|coop\b/i.test(clause)) continue;
      if (majorCore && clause.toLowerCase().includes(majorCore)) continue;
      return true;
    }

    // Pattern 3: implicit non-Math faculty program restriction
    // Catches "Level at least 1B Architecture students", "within the Faculty of Science", etc.
    // Skip if the same clause contains Math course codes — the non-Math program is just an OR alternative.
    if (!isExclusion && NON_MATH_FACULTY_RE.test(clause) && !/\bMATH\s+\d+/i.test(clause)) return true;
    if (!isExclusion && /\bfaculty\s+of\s+(?!math)/i.test(clause)) return true;
  }
  return false;
}

// Segments containing these phrases are exclusion conditions ("not open to students
// who have credit for X"), not actual prerequisites — skip them.
const EXCLUSION_RE = /not open|credit for|received credit|previously completed/i;

const LEVEL_ORDER = ['1A','1B','2A','2B','3A','3B','4A','4B'] as const;
type StudyLevel = typeof LEVEL_ORDER[number];

// Returns the minimum required level (e.g. "3A") found in a prereq string, or null.
export function parseRequiredLevel(prereqStr: string): StudyLevel | null {
  const m = prereqStr.match(/level\s+at\s+least\s+([1-4][AB])/i)
         ?? prereqStr.match(/minimum\s+([1-4][AB])\s+standing/i);
  if (!m) return null;
  const lvl = m[1].toUpperCase() as StudyLevel;
  return (LEVEL_ORDER as readonly string[]).includes(lvl) ? lvl : null;
}

// Returns numeric rank for a study level label (higher = more senior). -1 if unknown.
export function levelNum(lvl: string): number {
  return LEVEL_ORDER.indexOf(lvl.toUpperCase() as StudyLevel);
}

const LAB_PAIRS: Record<string, string> = {
  'CS136': 'CS136L',
  'CHEM120': 'CHEM120L',
  'CHEM121': 'CHEM121L',
  'CHEM123': 'CHEM123L',
  'CHEM125': 'CHEM125L',
  'EARTH121': 'EARTH121L',
  'EARTH122': 'EARTH122L',
};

// Returns unsatisfied AND-segments; each inner array is one segment where having
// any listed course satisfies that segment (alternatives joined as "or" in UI).
// Lab courses (e.g. CS136L) are always co-enrolled with their base course (CS136).
// Treat XYZnnnL as satisfied if XYZnnn is available, and vice versa for set expansion.
function has(available: Set<string>, code: string): boolean {
  if (available.has(code)) return true;
  const base = Object.entries(LAB_PAIRS).find(([, lab]) => lab === code)?.[0];
  if (base && available.has(base)) return true;
  return false;
}

// Expands a course set to implicitly include known lab courses when the base course is present.
export function expandWithLabCourses(courses: Set<string>): Set<string> {
  const expanded = new Set(courses);
  for (const [base, lab] of Object.entries(LAB_PAIRS)) {
    if (courses.has(base) && !courses.has(lab)) expanded.add(lab);
  }
  return expanded;
}

// Splits a prereq string on top-level " or " (depth-0, not inside parens).
function splitAtTopLevelOr(str: string): string[] {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') { depth++; continue; }
    if (str[i] === ')') { depth--; continue; }
    if (depth === 0 && /^or /i.test(str.slice(i))) {
      parts.push(str.slice(start, i).trim());
      i += 2; start = i + 1;
    }
  }
  parts.push(str.slice(start).trim());
  return parts.filter(Boolean);
}

// Returns missing course groups for a single AND-branch (may be wrapped in parens).
function getMissingFromBranch(branch: string, available: Set<string>): string[][] {
  const inner = branch.replace(/^\(|\)$/g, '').trim();
  const missing: string[][] = [];
  const segments = inner.split(/\band\b/i).map(s => s.trim()).filter(Boolean);
  for (const seg of segments) {
    if (EXCLUSION_RE.test(seg)) continue;
    const codes = extractCourseCodes(seg);
    if (codes.length === 0) continue;
    if (/\bor\b|\bone\s+of\b/i.test(seg)) {
      if (codes.some(c => has(available, c))) continue;
      missing.push(codes);
    } else {
      for (const code of codes) {
        if (has(available, code)) continue;
        missing.push([code]);
      }
    }
  }
  return missing;
}

export function getMissingPrereqs(prereqStr: string, available: Set<string>): string[][] {
  if (!prereqStr) return [];
  // Strip everything after the first semicolon (enrollment restrictions, notes)
  const main = prereqStr.split(';')[0].trim();

  const orBranches = splitAtTopLevelOr(main);

  if (orBranches.length > 1) {
    // Top-level OR: satisfied if any branch has zero missing
    const branchMissing = orBranches.map(b => getMissingFromBranch(b, available));
    const satisfied = branchMissing.find(m => m.length === 0);
    if (satisfied !== undefined) return [];
    // Return missing from the branch with fewest missing courses
    return branchMissing.reduce((best, cur) =>
      cur.flat().length < best.flat().length ? cur : best
    );
  }

  // Single branch (no top-level OR) — fall through to AND logic
  return getMissingFromBranch(main, available);
}

export function formatMissingPrereqGroups(groups: string[][]): string {
  return groups
    .filter(g => g.length > 0)
    .map(g => g.length > 1 ? `(${g.join(' or ')})` : g[0])
    .join(' and ');
}

export function formatMissingPrereqLines(groups: string[][]): string[] {
  return groups
    .filter(g => g.length > 0)
    .map(g => g.length > 1 ? g.join(' or ') : g[0]);
}

// Splits a prereq string into top-level OR branches (respecting parens depth)
// and formats each branch cleanly for display.
export function formatPrereqForDisplay(prereqStr: string): string[] {
  if (!prereqStr) return [];
  const main = prereqStr.split(';')[0].trim();

  // Split on top-level " or "
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < main.length; i++) {
    if (main[i] === '(') { depth++; continue; }
    if (main[i] === ')') { depth--; continue; }
    if (depth === 0 && main.slice(i).match(/^or /i)) {
      parts.push(main.slice(start, i).trim());
      i += 2; start = i + 1;
    }
  }
  parts.push(main.slice(start).trim());

  return parts.map(p => {
    // "CS 246" → "CS246"
    let s = p.replace(/\b([A-Z]{2,8})\s+(\d{1,3}[A-Z]?)\b/g, '$1$2');
    // "CS246/246E" → "CS246/CS246E"
    s = s.replace(/\b([A-Z]{2,8})(\d{1,3}[A-Z]?)\/(\d{1,3}[A-Z]?)\b/g, '$1$2/$1$3');
    // Resolve abbreviated numbers that trail a subject: "CS136 or 146" → "CS136 or CS146"
    s = s.replace(/\b([A-Z]{2,8})(\d{1,3}[A-Z]?)\b((?:\s+or\s+\d{1,3}[A-Z]?)+)/g, (_, subj, first, tail) => {
      const rest = tail.replace(/(\d{1,3}[A-Z]?)/g, subj + '$1');
      return subj + first + rest;
    });
    // grade phrasing → "85%+"
    s = s.replace(/a grade of\s+/gi, '');
    s = s.replace(/(\d+)%\s+or\s+higher\s+in\s+one\s+of\s*/gi, '$1%+ in ');
    s = s.replace(/(\d+)%\s+or\s+higher\s+in\s*/gi, '$1%+ in ');
    // "and" → "+"
    s = s.replace(/\band\b/gi, '+');
    return s.replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
}
