// Columns in the UW Study/Work Sequences Chart cycle: S, F, W, S, F, W, ...
// startSeason: the season of the student's 1A term
// terms: ordered labels for each slot (null = off/gap, not a recognised term)

const SEQUENCES: Record<string, { startSeason: 'F' | 'S'; terms: string[] }> = {
  '1': {
    startSeason: 'F',
    terms: ['1A','1B','WT1','2A','WT2','2B','WT3','3A','WT4','3B','WT5','4A','WT6','4B'],
  },
  '2': {
    startSeason: 'F',
    terms: ['1A','1B','WT1','2A','2B','WT2','3A','WT3','3B','WT4','4A','WT5','WT6','4B'],
  },
  '3': {
    startSeason: 'F',
    terms: ['1A','1B','off','2A','WT1','2B','WT2','3A','WT3','3B','WT4','4A','WT5','WT6','4B'],
  },
  '4': {
    startSeason: 'F',
    terms: ['1A','1B','2A','WT1','2B','WT2','3A','WT3','3B','WT4','4A','WT5','WT6','4B'],
  },
  'none': {
    startSeason: 'F',
    terms: ['1A','1B','WT1','2A','WT2','2B','WT3','3A','WT4','3B','WT5','WT6','4A','4B'],
  },
};

function termNum(t: string): number {
  const m = t.match(/^([WFS])(\d{2})$/);
  if (!m) return Infinity;
  // Within-year order: W (Jan-Apr) = 0, S (May-Aug) = 1, F (Sep-Dec) = 2
  return (2000 + parseInt(m[2])) * 3 + (m[1] === 'W' ? 0 : m[1] === 'S' ? 1 : 2);
}

/**
 * Returns the study/work label (e.g. "1A", "WT2") for a given calendar term,
 * given the student's start term (their 1A year, always expressed as an F-term
 * code like "F24") and co-op stream.
 *
 * For Spring-start streams (1, 2, 3), the actual 1A falls in the Spring of the
 * same calendar year as the F-term code (e.g. F24 → 1A was in S24).
 */
/**
 * Returns the calendar term of the final study term (4B) for a given
 * start term and co-op stream.
 */
export function computeGradTerm(startTerm: string, stream: string): string | null {
  const seq = SEQUENCES[stream];
  if (!seq) return null;
  const sm = startTerm.match(/^([WFS])(\d{2})$/);
  if (!sm) return null;
  const actual1A = seq.startSeason === 'S' ? `S${sm[2]}` : startTerm;
  // Advance by (seq.terms.length - 1) calendar terms
  const n = termNum(actual1A) + (seq.terms.length - 1);
  const year = Math.floor(n / 3);
  const s = (['W', 'S', 'F'] as const)[n % 3];
  const yy = String(year % 100).padStart(2, '0');
  return `${s}${yy}`;
}

export function getStudyLabel(
  calTerm: string,
  startTerm: string,
  stream: string,
): string | null {
  const seq = SEQUENCES[stream];
  if (!seq) return null;

  const sm = startTerm.match(/^([WFS])(\d{2})$/);
  if (!sm) return null;

  const actual1A = seq.startSeason === 'S' ? `S${sm[2]}` : startTerm;
  const offset = termNum(calTerm) - termNum(actual1A);
  if (offset < 0 || offset >= seq.terms.length) return null;
  return seq.terms[offset];
}
