// Co-op streams: columns follow the UW Study/Work Sequences chart (calendar order).
// Regular (non–co-op): eight academic terms (Fall/Winter only, summers off), ~4 years from Fall 1A.
//
// startSeason: the season of the student's 1A term (co-op streams only; regular assumes Fall cohort codes Fyy).

const REGULAR_STUDY_LABELS = ['1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B'] as const;

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
};

/** Calendar codes for the eight in-class terms (summers skipped), given Fall cohort start `Fyy`. */
export function regularStudyCalendarTerms(startTerm: string): string[] {
  const m = startTerm.match(/^F(\d{2})$/);
  if (!m) return [];
  const y0 = parseInt(m[1], 10);
  const yy = (n: number) => String(((n % 100) + 100) % 100).padStart(2, '0');
  const out: string[] = [];
  for (let i = 0; i < 8; i++) {
    out.push(i % 2 === 0 ? `F${yy(y0 + Math.floor(i / 2))}` : `W${yy(y0 + Math.floor((i + 1) / 2))}`);
  }
  return out;
}

function termNum(t: string): number {
  const m = t.match(/^([WFS])(\d{2})$/);
  if (!m) return Infinity;
  // Within-year order: W (Jan-Apr) = 0, S (May-Aug) = 1, F (Sep-Dec) = 2
  return (2000 + parseInt(m[2])) * 3 + (m[1] === 'W' ? 0 : m[1] === 'S' ? 1 : 2);
}

/**
 * Calendar term of the final in-class term (4B). Co-op: from UW stream chart.
 * Regular (`stream === 'none'`): eight Fall/Winter terms, summers off (~4 years from Fall `Fyy` start).
 */
export function computeGradTerm(startTerm: string, stream: string): string | null {
  if (stream === 'none') {
    const cal = regularStudyCalendarTerms(startTerm);
    return cal.length ? cal[cal.length - 1]! : null;
  }
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

/**
 * Study level label for a calendar term (e.g. "1A", "WT2"). Co-op: stream chart offset from 1A.
 * Regular: labels only on Fall/Winter study terms; summers return null.
 * Spring-start co-op streams (1–3): 1A is the Spring of the same `yy` as the `Fyy` start code.
 */
export function getStudyLabel(
  calTerm: string,
  startTerm: string,
  stream: string,
): string | null {
  if (stream === 'none') {
    const cal = regularStudyCalendarTerms(startTerm);
    const idx = cal.indexOf(calTerm);
    if (idx < 0) return null;
    return REGULAR_STUDY_LABELS[idx];
  }

  const seq = SEQUENCES[stream];
  if (!seq) return null;

  const sm = startTerm.match(/^([WFS])(\d{2})$/);
  if (!sm) return null;

  const actual1A = seq.startSeason === 'S' ? `S${sm[2]}` : startTerm;
  const offset = termNum(calTerm) - termNum(actual1A);
  if (offset < 0 || offset >= seq.terms.length) return null;
  return seq.terms[offset];
}
