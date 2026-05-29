import { NextRequest, NextResponse } from 'next/server';

const UW_API = 'https://openapi.data.uwaterloo.ca/v3';

// Subjects covered by the planner's course catalog
const SUBJECTS = [
  'ACTSC', 'AMATH', 'CO', 'CS', 'MATBUS', 'MATH', 'PMATH', 'STAT',
  'BIOL', 'CHEM', 'ECON', 'ENGL', 'PHYS', 'PSYCH', 'AFM', 'COMM',
];

function termLabelToCode(label: string): number {
  const season = label[0];
  const yy = parseInt(label.slice(1));
  const year = yy + (yy < 50 ? 2000 : 1900);
  const digit = season === 'F' ? 9 : season === 'W' ? 1 : 5;
  return (year - 1900) * 10 + digit;
}

function isOnline(schedData: unknown): boolean {
  const sched = (schedData as Array<Record<string, unknown>> | undefined)?.[0];
  if (!sched) return false;
  const t1 = sched.classMeetingStartTime as string | null | undefined;
  const t2 = sched.classMeetingEndTime as string | null | undefined;
  return !t1 || !t2 || t1 === t2;
}

const cache = new Map<string, { codes: string[]; at: number }>();
const TTL = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const key = process.env.UW_API_KEY;
  if (!key) return NextResponse.json({ error: 'Missing UW_API_KEY' }, { status: 500 });

  const term = req.nextUrl.searchParams.get('term');
  if (!term) return NextResponse.json({ error: 'Missing term' }, { status: 400 });

  const cached = cache.get(term);
  if (cached && Date.now() - cached.at < TTL) return NextResponse.json(cached.codes);

  const termCode = termLabelToCode(term);
  const onlineCodes = new Set<string>();

  await Promise.allSettled(
    SUBJECTS.map(async subject => {
      try {
        const res = await fetch(`${UW_API}/ClassSchedules/${termCode}/${subject}`, {
          headers: { 'x-api-key': key },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const sections = await res.json() as Array<Record<string, unknown>>;
        for (const sec of sections) {
          const subj = (sec.subjectCode as string | undefined)?.toUpperCase() ?? subject;
          const cat = (sec.catalogNumber as string | undefined)?.toUpperCase().replace(/\s+/g, '') ?? '';
          if (!cat) continue;
          if (isOnline(sec.scheduleData)) onlineCodes.add(`${subj}${cat}`);
        }
      } catch { /* skip subject on error */ }
    })
  );

  const codes = [...onlineCodes];
  cache.set(term, { codes, at: Date.now() });
  return NextResponse.json(codes);
}
