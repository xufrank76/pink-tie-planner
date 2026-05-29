// Returns Record<COURSE_CODE, { seasons: string[]; terms: string[] | null }>
// seasons: season letters the course is offered (['F','W','S'])
// terms: specific term labels like ['W27','W29'] for biennial/sparse courses; null means offered every year in those seasons
// Primary source: Odyssey 5-year projected offerings (authoritative for Math faculty)
// Fallback: UW Flow recent section history (last ~2 years) for courses not in Odyssey

export type OfferingInfo = { seasons: string[]; terms: string[] | null };

const ODYSSEY_URL = 'https://odyssey.uwaterloo.ca/ofcourse/app/data';
const UWFLOW_URL = 'https://uwflow.com/graphql';
const CACHE_TTL = 24 * 60 * 60 * 1000;

function termSeason(termId: number): 'W' | 'S' | 'F' | null {
  const d = termId % 10;
  if (d === 1) return 'W';
  if (d === 5) return 'S';
  if (d === 9) return 'F';
  return null;
}

function termIdToLabel(termId: number): string {
  const s = termSeason(termId);
  if (!s) return '';
  const year = Math.floor(termId / 10) + 1900;
  return `${s}${String(year).slice(2)}`;
}

async function fetchOdyssey(): Promise<Record<string, OfferingInfo>> {
  const res = await fetch(ODYSSEY_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Odyssey ${res.status}`);
  const rows: Record<string, string>[] = (await res.json() as string[]).map(s => JSON.parse(s));

  // Collect all term IDs present in the data window
  const allTermIds = new Set<number>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (/^\d+$/.test(k)) allTermIds.add(Number(k));
    }
  }

  // How many distinct calendar years each season appears across the full window
  const windowYears: Record<string, Set<number>> = { W: new Set(), S: new Set(), F: new Set() };
  for (const termId of allTermIds) {
    const s = termSeason(termId);
    if (s) windowYears[s].add(Math.floor(termId / 10) + 1900);
  }

  const out: Record<string, OfferingInfo> = {};
  for (const row of rows) {
    const code = ((row.subject_code ?? '') + (row.catalog ?? '')).toUpperCase().replace(/\s+/g, '');
    if (!code) continue;

    const courseSeasonYears: Record<string, Set<number>> = { W: new Set(), S: new Set(), F: new Set() };
    const offeredTermIds: number[] = [];

    for (const [k, v] of Object.entries(row)) {
      if (!/^\d+$/.test(k)) continue;
      if ((v as string).trim() === '') continue;
      const termId = Number(k);
      const s = termSeason(termId);
      if (s) {
        courseSeasonYears[s].add(Math.floor(termId / 10) + 1900);
        offeredTermIds.push(termId);
      }
    }

    const seasons: string[] = [];
    let isSparse = false;
    for (const s of ['F', 'W', 'S'] as const) {
      if (courseSeasonYears[s].size > 0) {
        seasons.push(s);
        // Sparse: course doesn't appear in every year that season exists in the window
        if (courseSeasonYears[s].size < windowYears[s].size) isSparse = true;
      }
    }

    if (seasons.length === 0) continue;

    out[code] = isSparse
      ? { seasons, terms: offeredTermIds.sort((a, b) => a - b).map(termIdToLabel).filter(Boolean) }
      : { seasons, terms: null };
  }
  return out;
}

const RECENT_TERM = 1241; // W24

// No subject filter — covers all courses including non-Math electives (HLTH, BIOL, ECON, etc.)
// Filtered to courses that have at least one section since RECENT_TERM to keep response size down.
const FLOW_QUERY_LITERAL = `{
  course(where: {sections: {term_id: {_gte: ${RECENT_TERM}}}}) {
    code
    sections(where: {term_id: {_gte: ${RECENT_TERM}}}) { term_id }
  }
}`;

async function fetchFlowOfferings(): Promise<Record<string, OfferingInfo>> {
  const res = await fetch(UWFLOW_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: FLOW_QUERY_LITERAL }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`UW Flow ${res.status}`);
  const json = await res.json();
  const courses: { code: string; sections: { term_id: number }[] }[] = json.data.course;
  const out: Record<string, OfferingInfo> = {};
  for (const c of courses) {
    const code = c.code.toUpperCase().replace(/\s+/g, '');
    const seasons = new Set<string>();
    for (const s of c.sections) {
      const season = termSeason(s.term_id);
      if (season) seasons.add(season);
    }
    // Flow gives us historical seasons only — no specific-term info
    if (seasons.size > 0) out[code] = { seasons: [...seasons].sort(), terms: null };
  }
  return out;
}

let memCache: { data: Record<string, OfferingInfo>; at: number } | null = null;

export async function GET() {
  if (memCache && Date.now() - memCache.at < CACHE_TTL) {
    return Response.json(memCache.data);
  }

  try {
    const [odyssey, flow] = await Promise.allSettled([fetchOdyssey(), fetchFlowOfferings()]);
    const odysseyData = odyssey.status === 'fulfilled' ? odyssey.value : {};
    const flowData = flow.status === 'fulfilled' ? flow.value : {};

    // Merge: Odyssey wins (projected future); Flow fills gaps
    const merged: Record<string, OfferingInfo> = { ...flowData, ...odysseyData };

    memCache = { data: merged, at: Date.now() };
    return Response.json(merged);
  } catch {
    return Response.json({}, { status: 502 });
  }
}
