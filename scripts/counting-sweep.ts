/**
 * Counting invariant sweeps for the degree headline metrics.
 *
 *   npx tsx scripts/counting-sweep.ts single   # every major x minor: full-completion gap
 *   npx tsx scripts/counting-sweep.ts multi    # double majors & specs: single-course <= 1
 *
 * `single` plans every course a program's tree mentions (plus synthesized courses for
 * subject/level ADDITIONAL pools) and reports combos whose numerator can't reach the
 * denominator. Known data-class gaps (calendar floor exceeds published structure):
 * Digital Arts 3, East Asian 2, Spanish 2, Performance Creation 2, CS Minor 1, and a
 * CompMath artifact (the sweep's fillers lack 3 same-subject science courses).
 *
 * `multi` checks the "counting shared courses once" property: any single planned course
 * must credit the headline numerator at most 1. Remaining violations are the known
 * limitation of the pairwise redundancy heuristics (see degreeHeadlineProgress.ts) —
 * they shrink with each fix; a slot-allocation model is the durable cure.
 */
import { computeDegreeHeadlineMetrics } from '../src/lib/degreeHeadlineProgress';
import { courseCodes, extractSubjectsFromText, extractAdditionalN, type ReqNode } from '../src/lib/requirementEvaluator';
const d = require('../src/data/requirements-filtered.json');

const mode = process.argv[2] ?? 'single';
if (mode === 'single') {
const majors = Object.entries(d).filter(([, e]: any) => e?.isMathFaculty && !e.isMinor && !e.isSpecialization && e.requirements?.length);
const minors = Object.entries(d).filter(([, e]: any) => e?.isMinor && e.requirements?.length);

// Perfect-completion generator: tree codes + per-ADDITIONAL synthesized courses matching its subjects/levels.
function completionSet(entries: any[]): Set<string> {
  const out = new Set<string>();
  const addSynth = (node: ReqNode) => {
    if (node.type === 'ADDITIONAL') {
      const text = node.text ?? '';
      const n = node.n ?? extractAdditionalN(text) ?? 0;
      const subjects = extractSubjectsFromText(text);
      const levels = [...text.matchAll(/\b([1-4])00[-–]/g)].map(m => parseInt(m[1]));
      const lvl = levels.length ? Math.max(...levels) : 3;
      for (const s of subjects) for (let i = 0; i < n; i++) out.add(`${s}${lvl}${10 + i}`);
    }
    (node.children ?? []).forEach(addSynth);
  };
  for (const e of entries) {
    for (const c of (e.requirements as ReqNode[]).flatMap(n => courseCodes(n))) out.add(c);
    (e.requirements as ReqNode[]).forEach(addSynth);
  }
  // generic non-math electives to fill the 10-slot row
  for (const c of ['HIST201','MUSIC140','ENGL210','PHIL201','SOC101','ANTH101','GEOG101','FR151','SPAN101','RS100']) out.add(c);
  return out;
}

const results: {label: string; gap: number; frac: string}[] = [];
for (const [majId, maj] of majors as any) {
  for (const [minId, min] of [...minors, [null, null]] as any) {
    const program: any = { id: majId, major: maj.name, minorId: minId, doubleMajorId: null, doubleMajor: null, extras: [], coopStream: null };
    const everything = completionSet([d['core-bmath'], maj, ...(min ? [min] : [])]);
    const mf = computeDegreeHeadlineMetrics(d, program, [...everything], {});
    const gap = mf.degreeTotalSlots - mf.degreePlannedSum;
    if (gap !== 0) results.push({ label: maj.name.replace(/ \(Bachelor.*/,'') + ' + ' + (min?.name ?? '(none)'), gap, frac: mf.degreePlannedSum+'/'+mf.degreeTotalSlots });
  }
}
console.log('combos with gap != 0:', results.length, 'of', majors.length * (minors.length + 1));
const byMinor = new Map<string, number[]>();
for (const r of results) {
  const minor = r.label.split(' + ')[1];
  if (!byMinor.has(minor)) byMinor.set(minor, []);
  byMinor.get(minor)!.push(r.gap);
}
for (const [minor, gaps] of [...byMinor.entries()].sort((a,b)=>Math.abs(Math.max(...b[1]))-Math.abs(Math.max(...a[1])))) {
  const uniq = [...new Set(gaps)].sort((a,b)=>a-b);
  console.log(`  ${minor}: gaps ${uniq.join(',')} (${gaps.length} majors affected)`);
}
}
if (mode === 'multi') {

const majors = Object.entries(d).filter(([, e]: any) => e?.isMathFaculty && !e.isMinor && !e.isSpecialization && e.requirements?.length) as any[];
const specs = Object.entries(d).filter(([, e]: any) => e?.isSpecialization && e.requirements?.length) as any[];
const treeCodes = (e: any): string[] => (e.requirements as ReqNode[]).flatMap(n => courseCodes(n));

// Property: a single planned course credits the headline numerator at most once.
function checkSingles(label: string, program: any, entries: any[], report: string[]) {
  const m0 = computeDegreeHeadlineMetrics(d, program, [], {});
  if (m0.degreePlannedSum !== 0) report.push(`NONZERO-EMPTY ${label}: ${m0.degreePlannedSum}`);
  // sample: shared codes first (most likely to double count), then a few uniques
  const codeSets = entries.map(e => new Set(treeCodes(e)));
  const all = [...new Set(entries.flatMap(e => treeCodes(e)))];
  const shared = all.filter(c => codeSets.filter(s => s.has(c)).length >= 2);
  const sample = [...new Set([...shared.slice(0, 12), ...all.slice(0, 6)])];
  for (const c of sample) {
    const m = computeDegreeHeadlineMetrics(d, program, [c], {});
    if (m.degreePlannedSum > 1) report.push(`DOUBLE ${label}: ${c} credits ${m.degreePlannedSum}`);
  }
}

const report: string[] = [];
let combos = 0;

// double majors (all ordered pairs would be redundant; use unordered)
for (let i = 0; i < majors.length; i++) {
  for (let j = i + 1; j < majors.length; j++) {
    const [idA, a] = majors[i]; const [idB, b] = majors[j];
    combos++;
    const program: any = { id: idA, major: a.name, doubleMajorId: idB, doubleMajor: b.name, minorId: null, extras: [], coopStream: null };
    checkSingles(`${a.name.replace(/ \(Bach.*/,'')} × ${b.name.replace(/ \(Bach.*/,'')}`, program, [d['core-bmath'], a, b], report);
  }
}
// major + specialization
for (const [idA, a] of majors) {
  for (const [idS, s] of specs) {
    combos++;
    const program: any = { id: idA, major: a.name, doubleMajorId: null, minorId: null, extras: [{ id: idS, name: s.name, type: 'specialization' }], coopStream: null };
    checkSingles(`${a.name.replace(/ \(Bach.*/,'')} + spec:${s.name.slice(0,30)}`, program, [d['core-bmath'], a, s], report);
  }
}
console.log('combos:', combos, '| violations:', report.length);
const kinds = new Map<string, number>();
for (const r of report) kinds.set(r.split(' ')[0], (kinds.get(r.split(' ')[0]) ?? 0) + 1);
console.log('by kind:', [...kinds.entries()].map(([k,v])=>k+'='+v).join(', ') || 'none');
console.log(report.slice(0, 30).join('\n'));
}
