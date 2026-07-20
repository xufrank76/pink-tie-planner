import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function toTermCode(season: string, year: string): string {
  const yy = year.slice(2);
  const s = season.toLowerCase();
  if (s === 'winter') return `W${yy}`;
  if (s === 'spring') return `S${yy}`;
  return `F${yy}`;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (!file.name.endsWith('.pdf')) return NextResponse.json({ error: 'Must be a PDF' }, { status: 400 });

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
    ({ text } = await pdfParse(buffer));
  } catch (err) {
    console.error('parse-transcript: pdf-parse failed', err);
    return NextResponse.json({ error: 'Could not read PDF' }, { status: 400 });
  }

  // UW Quest transcripts extract as column-spaced text, e.g. "CS      135          Introduction..."
  // The lookahead for [A-Z][a-z] would fail when spaces separate the catalog # from the title.
  // We rely on the client-side courseCodeSet filter to remove false positives.
  // Transcript text has no space between catalog# and title: "CS  115Introduction..."
  // [A-Z]? would greedily grab the first letter of the title, so only allow a letter suffix
  // if it's NOT followed by a lowercase letter (which would mean it starts a title word).
  const coursePattern = /\b([A-Z]{2,8})\s{1,8}(\d{1,3}(?:[A-Z](?![a-z]))?)(?!\d)/g;
  const termPattern = /\b(Fall|Winter|Spring)\s+(\d{4})\b/gi;

  const termMatches = [...text.matchAll(termPattern)];
  const termCourses: Record<string, string[]> = {};

  if (termMatches.length > 0) {
    for (let i = 0; i < termMatches.length; i++) {
      const m = termMatches[i];
      const code = toTermCode(m[1], m[2]);
      const start = m.index! + m[0].length;
      const end = i + 1 < termMatches.length ? termMatches[i + 1].index! : text.length;
      const section = text.slice(start, end);

      const seen = new Set<string>();
      let cm;
      coursePattern.lastIndex = 0;
      while ((cm = coursePattern.exec(section)) !== null) {
        const courseCode = `${cm[1]}${cm[2]}`;
        if (!courseCode.startsWith('COOP')) seen.add(courseCode);
      }
      if (seen.size > 0) termCourses[code] = [...seen].sort();
    }
  } else {
    // No term headers — fall back to flat list under 'unknown'
    const seen = new Set<string>();
    let cm;
    coursePattern.lastIndex = 0;
    while ((cm = coursePattern.exec(text)) !== null) {
      const courseCode = `${cm[1]}${cm[2]}`;
      if (!courseCode.startsWith('COOP')) seen.add(courseCode);
    }
    if (seen.size > 0) termCourses['unknown'] = [...seen].sort();
  }

  return NextResponse.json({ termCourses });
}
