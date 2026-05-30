import { NextResponse } from 'next/server';

export const revalidate = 86400;

export interface CourseInfo {
  code: string;
  name: string;
  description: string;
  prereqs: string;       // raw prereq text from requirementsDescription
  antireqs: string;      // raw antireq text
  offered: string[];     // e.g. ['F', 'W', 'S']
  offeredTerms?: string[] | null; // specific terms for biennial courses, e.g. ['W27','W29']; null = every year
}

let memCache: { courses: CourseInfo[]; at: number } | null = null;

const UW_API = 'https://openapi.data.uwaterloo.ca/v3';

interface UWCourse {
  subjectCode: string;
  catalogNumber: string;
  title: string;
  description: string;
  requirementsDescription: string | null;
  termCode: string;
}

// UW term code: last digit 9=Fall, 5=Spring, 1=Winter
function termSeason(termCode: number | string): 'F' | 'W' | 'S' {
  const d = Number(termCode) % 10;
  if (d === 9) return 'F';
  if (d === 5) return 'S';
  return 'W';
}

// UW term code: (year - 1900) * 10 + season_digit (1=Winter, 5=Spring, 9=Fall)
function currentTermCode(): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const d = month <= 4 ? 1 : month <= 8 ? 5 : 9;
  return (now.getFullYear() - 1900) * 10 + d;
}

function termCodesBefore(start: number, count: number): number[] {
  const codes: number[] = [];
  let cur = start;
  for (let i = 0; i < count; i++) {
    codes.push(cur);
    const d = cur % 10;
    if (d === 9) cur -= 4;
    else if (d === 5) cur -= 4;
    else cur -= 2;
  }
  return codes;
}

function termCodesAfter(start: number, count: number): number[] {
  const codes: number[] = [];
  let cur = start;
  for (let i = 0; i < count; i++) {
    const d = cur % 10;
    if (d === 9) cur += 2;
    else if (d === 5) cur += 4;
    else cur += 4;
    codes.push(cur);
  }
  return codes;
}

function parseSection(desc: string | null, label: 'Prereq' | 'Antireq'): string {
  if (!desc) return '';
  const m = desc.match(new RegExp(`${label}s?:\\s*([^.]+(?:\\.[^.]+)*)`, 'i'));
  if (!m) return '';
  // Trim at the next label boundary
  return m[1].replace(/\s*(Prereq|Antireq|Coreq|Note|Only)[s]?:[\s\S]*/i, '').trim();
}

export async function GET() {
  const key = process.env.UW_API_KEY;
  if (!key) return NextResponse.json({ error: 'Missing UW_API_KEY' }, { status: 500 });

  if (memCache && Date.now() - memCache.at < 3_600_000)
    return NextResponse.json(memCache.courses);

  const cur = currentTermCode();
  const terms = [...termCodesBefore(cur, 6), ...termCodesAfter(cur, 3)];

  const results = await Promise.allSettled(
    terms.map(term =>
      // UW returns ~9MB per term; Next fetch cache max is 2MB — skip Data Cache, rely on memCache below.
      fetch(`${UW_API}/Courses/${term}`, {
        headers: { 'x-api-key': key },
        cache: 'no-store',
      }).then(r => (r.ok ? (r.json() as Promise<UWCourse[]>) : [] as UWCourse[]))
        .catch(() => [] as UWCourse[])
    )
  );

  // code → accumulated data; track seasons across terms
  const seen = new Map<string, CourseInfo & { seasons: Set<'F' | 'W' | 'S'> }>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status !== 'fulfilled') continue;
    const season = termSeason(terms[i]);
    for (const c of result.value) {
      if (c.subjectCode === 'SEQ') continue;
      if (!/^[A-Z0-9]+$/.test(c.catalogNumber)) continue;
      const code = `${c.subjectCode}${c.catalogNumber}`;
      if (!seen.has(code)) {
        seen.set(code, {
          code,
          name: c.title,
          description: c.description ?? '',
          prereqs: parseSection(c.requirementsDescription, 'Prereq'),
          antireqs: parseSection(c.requirementsDescription, 'Antireq'),
          offered: [],
          seasons: new Set(),
        });
      }
      seen.get(code)!.seasons.add(season);
    }
  }

  const isStandard = (code: string) => /^[A-Z]+\d{3}[A-Z]?$/.test(code);
  const seasonOrder: Record<string, number> = { F: 0, W: 1, S: 2 };

  const courses: CourseInfo[] = [...seen.values()]
    .sort((a, b) => {
      const aStd = isStandard(a.code) ? 0 : 1;
      const bStd = isStandard(b.code) ? 0 : 1;
      return aStd - bStd || a.code.localeCompare(b.code);
    })
    .map(({ seasons, ...rest }) => ({
      ...rest,
      offered: [...seasons].sort((a, b) => seasonOrder[a] - seasonOrder[b]),
    }));

  if (courses.length > 0) memCache = { courses, at: Date.now() };
  return NextResponse.json(courses);
}
