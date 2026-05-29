import { NextRequest, NextResponse } from 'next/server';

const UW_API = 'https://openapi.data.uwaterloo.ca/v3';

export interface ScheduleEntry {
  classMeetingStartTime: string | null;
  classMeetingEndTime: string | null;
  classMeetingDayPatternCode: string | null;
  locationName: string | null;
  [key: string]: unknown;
}

export interface SectionInfo {
  classSection: number;
  courseComponent: string;
  classNumber: number;
  enrolledStudents: number;
  maxEnrollmentCapacity: number;
  scheduleData: ScheduleEntry[] | undefined;
  [key: string]: unknown;
}

function termLabelToCode(label: string): number {
  // "F25" → 1259, "W26" → 1261, "S26" → 1265
  const season = label[0];
  const yy = parseInt(label.slice(1));
  const year = yy + (yy < 50 ? 2000 : 1900);
  const digit = season === 'F' ? 9 : season === 'W' ? 1 : 5;
  return (year - 1900) * 10 + digit;
}

const cache = new Map<string, { data: SectionInfo[]; at: number }>();
const TTL = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const key = process.env.UW_API_KEY;
  if (!key) return NextResponse.json({ error: 'Missing UW_API_KEY' }, { status: 500 });

  const { searchParams } = req.nextUrl;
  const term = searchParams.get('term');
  const subject = searchParams.get('subject');
  const number = searchParams.get('number');

  if (!term || !subject || !number)
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  const cacheKey = `${term}:${subject}:${number}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL) return NextResponse.json(cached.data);

  const termCode = termLabelToCode(term);
  const url = `${UW_API}/ClassSchedules/${termCode}/${subject.toUpperCase()}/${number}`;

  try {
    const res = await fetch(url, { headers: { 'x-api-key': key }, cache: 'no-store' });
    if (!res.ok) { cache.set(cacheKey, { data: [], at: Date.now() }); return NextResponse.json([]); }
    const data = await res.json() as SectionInfo[];
    cache.set(cacheKey, { data, at: Date.now() });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([]);
  }
}
