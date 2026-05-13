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
const NON_MATH_FACULTY_RE = /\b(?:architect(?:ure|ural)|pharmacy|optometry|kinesiology|dental)\b/i;

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
    // Catches "Level at least 1B Architecture students" and "Level at least 1A Architectural Engineering"
    // Skip "Not open to Architecture students" (exclusion = course IS open to Math)
    if (!isExclusion && NON_MATH_FACULTY_RE.test(clause)) return true;
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

// Returns course codes from unsatisfied AND-segments of a prereq string.
// Each segment is treated as an OR group — if the available set contains ANY
// code from the segment, the segment is considered satisfied.
export function getMissingPrereqs(prereqStr: string, available: Set<string>): string[] {
  if (!prereqStr) return [];
  const segments = prereqStr.split(/\band\b|;/i).map(s => s.trim()).filter(Boolean);
  const missing: string[] = [];
  for (const seg of segments) {
    if (EXCLUSION_RE.test(seg)) continue;
    const codes = extractCourseCodes(seg);
    if (codes.length === 0 || codes.some(c => available.has(c))) continue;
    missing.push(...codes);
  }
  return missing;
}
