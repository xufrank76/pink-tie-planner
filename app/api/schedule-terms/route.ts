import { NextRequest, NextResponse } from 'next/server';

const UWFLOW_URL = 'https://uwflow.com/graphql';

function termIdToLabel(id: number): string {
  const d = id % 10;
  const season = d === 9 ? 'F' : d === 5 ? 'S' : 'W';
  const year = (Math.floor(id / 10) + 1900) % 100;
  return `${season}${String(year).padStart(2, '0')}`;
}

const cache = new Map<string, { terms: string[]; at: number }>();
const TTL = 6 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.toLowerCase();
  if (!code) return NextResponse.json([]);

  const cached = cache.get(code);
  if (cached && Date.now() - cached.at < TTL) return NextResponse.json(cached.terms);

  try {
    const res = await fetch(UWFLOW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{ course(where: {code: {_eq: "${code}"}}) { sections { term_id } } }`,
      }),
      cache: 'no-store',
    });
    const json = await res.json() as { data: { course: { sections: { term_id: number }[] }[] } };
    const course = json.data.course[0];
    if (!course) { cache.set(code, { terms: [], at: Date.now() }); return NextResponse.json([]); }

    const termIds = [...new Set(course.sections.map(s => s.term_id))].sort((a, b) => b - a);
    const terms = termIds.map(termIdToLabel).filter(Boolean);
    cache.set(code, { terms, at: Date.now() });
    return NextResponse.json(terms);
  } catch {
    return NextResponse.json([]);
  }
}
