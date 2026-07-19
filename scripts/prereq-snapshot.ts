/**
 * Snapshot harness for the prerequisite-string parser (src/lib/prereqCheck.ts).
 *
 * Fetches every course's requirementsDescription from the UW Open Data API, extracts
 * the Prereq section exactly the way app/api/courses/route.ts does, runs the parser,
 * and writes one line per course to scripts/prereq-snapshots/parsed.txt:
 *
 *   CODE :: groups=[[A|B],[C]] :: level=2A :: mathRestricted :: <raw prereq text>
 *
 * Commit the snapshot: any change to the parser regexes shows its blast radius across
 * all ~4k prereq strings as a git diff. The run also flags suspicious parses — strings
 * that mention course codes but parse to nothing.
 *
 * Usage:  npx tsx scripts/prereq-snapshot.ts          (needs UW_API_KEY in .env.local)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMissingPrereqs, parseRequiredLevel, isMathRestricted } from '../src/lib/prereqCheck';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'prereq-snapshots');

function apiKey(): string {
  if (process.env.UW_API_KEY) return process.env.UW_API_KEY;
  const env = readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
  const m = env.match(/^UW_API_KEY=(.+)$/m);
  if (!m) throw new Error('UW_API_KEY not found in env or .env.local');
  return m[1].trim();
}

function currentTermCode(): number {
  const now = new Date();
  const month = now.getMonth() + 1;
  const d = month <= 4 ? 1 : month <= 8 ? 5 : 9;
  return (now.getFullYear() - 1900) * 10 + d;
}

// Same extraction as app/api/courses/route.ts
function parseSection(desc: string | null, label: 'Prereq' | 'Antireq'): string {
  if (!desc) return '';
  const m = desc.match(new RegExp(`${label}s?:\\s*([^.]+(?:\\.[^.]+)*)`, 'i'));
  if (!m) return '';
  return m[1].replace(/\s*(Prereq|Antireq|Coreq|Note|Only)[s]?:[\s\S]*/i, '').trim();
}

const CODE_RE = /\b[A-Z]{2,8}\s?\d{3}[A-Z]?\b/;

async function main() {
  const term = currentTermCode();
  const res = await fetch(`https://openapi.data.uwaterloo.ca/v3/Courses/${term}`, {
    headers: { 'x-api-key': apiKey() },
  });
  if (!res.ok) throw new Error(`UW API ${res.status}`);
  const courses = (await res.json()) as { subjectCode: string; catalogNumber: string; requirementsDescription: string | null }[];

  const lines: string[] = [];
  const suspicious: string[] = [];
  const empty = new Set<string>();

  const seen = new Set<string>();
  for (const c of courses) {
    const code = `${c.subjectCode}${c.catalogNumber}`;
    if (seen.has(code)) continue;
    seen.add(code);
    const prereq = parseSection(c.requirementsDescription, 'Prereq');
    if (!prereq) continue;

    const groups = getMissingPrereqs(prereq, empty);
    const level = parseRequiredLevel(prereq);
    const restricted = isMathRestricted(prereq);
    const parsed = `groups=[${groups.map(g => `[${g.join('|')}]`).join(',')}] :: level=${level ?? '-'} :: ${restricted ? 'mathRestricted' : 'open'}`;
    lines.push(`${code} :: ${parsed} :: ${prereq.replace(/\s+/g, ' ')}`);

    // Suspicious: the string names at least one course, but nothing was parsed out of it.
    if (groups.length === 0 && !level && !restricted && CODE_RE.test(prereq)) {
      suspicious.push(`${code}: ${prereq.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
  }

  lines.sort();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, 'parsed.txt'), lines.join('\n') + '\n');
  console.log(`Snapshotted ${lines.length} prereq strings to scripts/prereq-snapshots/parsed.txt`);
  console.log(`${suspicious.length} suspicious (course codes present, nothing parsed):`);
  console.log(suspicious.slice(0, 25).join('\n'));
  if (suspicious.length > 25) console.log(`… +${suspicious.length - 25} more`);
}

main();
