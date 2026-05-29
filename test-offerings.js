/**
 * test-offerings.js
 * Tests for biennial/specific-term course offering logic.
 *
 * Run with: node test-offerings.js
 */

'use strict';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`      ${e.message}`);
    failed++;
  }
}

function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg}\n      expected: ${b}\n      got:      ${a}`);
}

function ok(val, msg = '') {
  if (!val) throw new Error(msg || 'Expected truthy');
}

// ─── Replicate pure functions from the route/component files ──────────────────

// --- app/api/offerings/route.ts ---

function termSeason(termId) {
  const d = termId % 10;
  if (d === 1) return 'W';
  if (d === 5) return 'S';
  if (d === 9) return 'F';
  return null;
}

function termIdToLabel(termId) {
  const s = termSeason(termId);
  if (!s) return '';
  const year = Math.floor(termId / 10) + 1900;
  return `${s}${String(year).slice(2)}`;
}

/**
 * Core sparse-detection logic extracted from fetchOdyssey.
 * Takes a list of rows (same shape as Odyssey JSON) and returns the offering map.
 */
function computeOfferings(rows) {
  const allTermIds = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (/^\d+$/.test(k)) allTermIds.add(Number(k));
    }
  }

  const windowYears = { W: new Set(), S: new Set(), F: new Set() };
  for (const termId of allTermIds) {
    const s = termSeason(termId);
    if (s) windowYears[s].add(Math.floor(termId / 10) + 1900);
  }

  const out = {};
  for (const row of rows) {
    const code = ((row.subject_code ?? '') + (row.catalog ?? '')).toUpperCase().replace(/\s+/g, '');
    if (!code) continue;

    const courseSeasonYears = { W: new Set(), S: new Set(), F: new Set() };
    const offeredTermIds = [];

    for (const [k, v] of Object.entries(row)) {
      if (!/^\d+$/.test(k)) continue;
      if ((v || '').trim() === '') continue;
      const termId = Number(k);
      const s = termSeason(termId);
      if (s) {
        courseSeasonYears[s].add(Math.floor(termId / 10) + 1900);
        offeredTermIds.push(termId);
      }
    }

    const seasons = [];
    let isSparse = false;
    for (const s of ['F', 'W', 'S']) {
      if (courseSeasonYears[s].size > 0) {
        seasons.push(s);
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

// --- src/lib/termUtils.ts ---

function termToNum(t) {
  const m = t.match(/^([WFS])(\d{2})$/);
  if (!m) return Infinity;
  return (2000 + parseInt(m[2])) * 3 + (m[1] === 'W' ? 0 : m[1] === 'S' ? 1 : 2);
}

// --- notOffered logic (DegreePlan / SemesterPlanner) ---

/**
 * @param {{ offered: string[], offeredTerms: string[] | null }} info
 * @param {string} term  - e.g. 'W28'
 */
function isNotOffered(info, term) {
  const offered = info?.offered ?? [];
  const offeredTerms = info?.offeredTerms ?? null;
  const tSeason = term[0];  // 'W', 'S', or 'F'
  if (offeredTerms) {
    const maxN = Math.max(...offeredTerms.map(t => termToNum(t)));
    if (termToNum(term) > maxN) {
      // Beyond Odyssey window — fall back to season check
      return offered.length > 0 && !offered.includes(tSeason);
    }
    return !offeredTerms.includes(term);
  }
  return offered.length > 0 && !offered.includes(tSeason);
}

// --- nextTerms logic (CourseCatalog.CourseDetail) ---

function nextTerm(t) {
  const s = t[0];
  const yy = parseInt(t.slice(1));
  const pad = n => String(n).padStart(2, '0');
  if (s === 'W') return `S${pad(yy)}`;
  if (s === 'S') return `F${pad(yy)}`;
  return `W${pad(yy + 1)}`;
}

function computeNextTerms(course, currentTerm) {
  if (course.offeredTerms) {
    const currentN = termToNum(currentTerm);
    return [...course.offeredTerms]
      .sort((a, b) => termToNum(a) - termToNum(b))
      .filter(t => termToNum(t) > currentN)
      .slice(0, 6);
  }
  const seasons = course.offered.length > 0 ? course.offered : ['F', 'W', 'S'];
  const out = [];
  let t = currentTerm;
  for (let i = 0; i < 24 && out.length < 6; i++) {
    t = nextTerm(t);
    if (seasons.includes(t[0])) out.push(t);
  }
  return out;
}

// --- availableCourses filter (SemesterPlanner) ---

function isAvailable(course, selectedTerm, completedSet) {
  const selectedSeason = selectedTerm[0];
  if (!course.offered.includes(selectedSeason)) return false;
  if (course.offeredTerms && !course.offeredTerms.includes(selectedTerm)) return false;
  return !completedSet.has(course.code);
}

// ─── Build a realistic fake Odyssey window ────────────────────────────────────
//
// Window: W25 S25 F25 W26 S26 F26 W27 S27 F27 W28 S28 F28 W29 S29 F29
// Term IDs:
//   W25=1251 S25=1255 F25=1259  W26=1261 S26=1265 F26=1269
//   W27=1271 S27=1275 F27=1279  W28=1281 S28=1285 F28=1289
//   W29=1291 S29=1295 F29=1299

const ALL_TERMS = [1251,1255,1259, 1261,1265,1269, 1271,1275,1279, 1281,1285,1289, 1291,1295,1299];

function makeRow(subjectCode, catalog, termsOffered) {
  const row = { subject_code: subjectCode, catalog };
  for (const id of ALL_TERMS) {
    row[String(id)] = termsOffered.includes(id) ? 'O' : '';
  }
  return row;
}

// ─── Test suites ──────────────────────────────────────────────────────────────

console.log('\ntermSeason()');
test('W term → W',  () => eq(termSeason(1251), 'W'));
test('S term → S',  () => eq(termSeason(1255), 'S'));
test('F term → F',  () => eq(termSeason(1259), 'F'));
test('invalid last digit → null', () => eq(termSeason(1260), null));
test('arbitrary W: 1291 → W', () => eq(termSeason(1291), 'W'));

console.log('\ntermIdToLabel()');
test('1251 → W25', () => eq(termIdToLabel(1251), 'W25'));
test('1255 → S25', () => eq(termIdToLabel(1255), 'S25'));
test('1259 → F25', () => eq(termIdToLabel(1259), 'F25'));
test('1271 → W27', () => eq(termIdToLabel(1271), 'W27'));
test('1279 → F27', () => eq(termIdToLabel(1279), 'F27'));
test('1291 → W29', () => eq(termIdToLabel(1291), 'W29'));
test('invalid → empty string', () => eq(termIdToLabel(1260), ''));

console.log('\ntermToNum() ordering');
test('W25 < S25 < F25', () => {
  ok(termToNum('W25') < termToNum('S25') && termToNum('S25') < termToNum('F25'));
});
test('F25 < W26', () => ok(termToNum('F25') < termToNum('W26')));
test('W27 < W28', () => ok(termToNum('W27') < termToNum('W28')));
test('W29 > W27', () => ok(termToNum('W29') > termToNum('W27')));
test('invalid → Infinity', () => eq(termToNum('X27'), Infinity));

console.log('\ncomputeOfferings() — sparse detection');

test('annual Winter course → terms: null', () => {
  const rows = [makeRow('MATH', '237', [1251,1261,1271,1281,1291])];
  const result = computeOfferings(rows);
  eq(result['MATH237'], { seasons: ['W'], terms: null });
});

test('biennial Winter course (W27, W29 only) → specific terms', () => {
  const rows = [makeRow('AMATH', '383', [1271, 1291])];
  const result = computeOfferings(rows);
  eq(result['AMATH383'], { seasons: ['W'], terms: ['W27', 'W29'] });
});

test('biennial Spring course (S26, S28 only) → specific terms', () => {
  const rows = [makeRow('PMATH', '499', [1265, 1285])];
  const result = computeOfferings(rows);
  eq(result['PMATH499'], { seasons: ['S'], terms: ['S26', 'S28'] });
});

test('Fall+Winter every year → terms: null', () => {
  const rows = [makeRow('CS', '341', [1259,1269,1279,1289,1299, 1251,1261,1271,1281,1291])];
  const result = computeOfferings(rows);
  eq(result['CS341'], { seasons: ['F', 'W'], terms: null });
});

test('offered every season → terms: null', () => {
  const rows = [makeRow('STAT', '230', ALL_TERMS)];
  const result = computeOfferings(rows);
  eq(result['STAT230'], { seasons: ['F', 'W', 'S'], terms: null });
});

test('single-term course (new or being phased out) → specific terms', () => {
  const rows = [makeRow('AMATH', '499', [1285])]; // only S28
  const result = computeOfferings(rows);
  eq(result['AMATH499'], { seasons: ['S'], terms: ['S28'] });
});

test('course with no offerings → excluded', () => {
  const rows = [makeRow('MATH', '999', [])];
  const result = computeOfferings(rows);
  ok(!result['MATH999'], 'should be absent from output');
});

test('C/O cell value (non-empty) counts as offered', () => {
  const row = {
    subject_code: 'STAT', catalog: '230',
    '1251': 'C/O', '1261': 'O', '1271': 'C', '1281': '', '1291': '?',
  };
  for (const id of ALL_TERMS) {
    if (!row[String(id)]) row[String(id)] = '';
  }
  const result = computeOfferings([row]);
  // C/O, O, C, ? are all non-empty → W25, W26, W27, W29 → 4 of 5 Winters → sparse
  ok(result['STAT230'].terms !== null, 'C/O should be treated as offered');
});

test('whitespace-only cell counts as NOT offered', () => {
  const rows = [makeRow('MATH', '138', [1271, 1291])]; // biennial
  // inject a whitespace value for W26
  rows[0]['1261'] = '   ';
  const result = computeOfferings(rows);
  eq(result['MATH138'].terms, ['W27', 'W29'], 'whitespace should be skipped');
});

test('terms returned in chronological order', () => {
  // give F27 before W27 in the term list so we confirm numeric sort works
  const rows = [makeRow('CO', '485', [1279, 1271])]; // F27, W27 — scrambled
  const result = computeOfferings(rows);
  // Only F27 and W27 — both in 2027, only 1 of 5 Winters and 1 of 5 Falls → sparse
  const terms = result['CO485'].terms;
  // Sorted by term ID: 1271 (W27) < 1279 (F27)
  eq(terms, ['W27', 'F27']);
});

test('multiple rows in dataset — window terms aggregated correctly', () => {
  // MATH120 offered every Winter; PMATH340 only W27, W29
  const rows = [
    makeRow('MATH', '120', [1251,1261,1271,1281,1291]),
    makeRow('PMATH', '340', [1271, 1291]),
  ];
  const result = computeOfferings(rows);
  eq(result['MATH120'].terms, null);
  eq(result['PMATH340'].terms, ['W27', 'W29']);
});

test('partial Fall coverage: offered F25, F26, F27 (missing F28, F29) → sparse', () => {
  const rows = [makeRow('AMATH', '351', [1259,1269,1279])];
  const result = computeOfferings(rows);
  eq(result['AMATH351'].terms, ['F25', 'F26', 'F27']);
});

test('catalog code with space is normalized', () => {
  const row = { subject_code: 'MATH ', catalog: ' 237', '1271': 'O' };
  for (const id of ALL_TERMS) {
    if (!row[String(id)]) row[String(id)] = '';
  }
  const result = computeOfferings([row]);
  ok(result['MATH237'], 'normalized code should exist');
});

console.log('\nisNotOffered() — DegreePlan / SemesterPlanner');

test('season check: offered W, planning W27 → not notOffered', () => {
  ok(!isNotOffered({ offered: ['W'], offeredTerms: null }, 'W27'));
});
test('season check: offered W, planning S27 → notOffered', () => {
  ok(isNotOffered({ offered: ['W'], offeredTerms: null }, 'S27'));
});
test('season check: offered F+W, planning F26 → not notOffered', () => {
  ok(!isNotOffered({ offered: ['F', 'W'], offeredTerms: null }, 'F26'));
});
test('season check: empty offered → not notOffered (unknown)', () => {
  ok(!isNotOffered({ offered: [], offeredTerms: null }, 'S27'));
});

test('specific terms: planning in W27 → not notOffered', () => {
  ok(!isNotOffered({ offered: ['W'], offeredTerms: ['W27', 'W29'] }, 'W27'));
});
test('specific terms: planning in W29 → not notOffered', () => {
  ok(!isNotOffered({ offered: ['W'], offeredTerms: ['W27', 'W29'] }, 'W29'));
});
test('specific terms: planning in W28 (within window) → notOffered', () => {
  ok(isNotOffered({ offered: ['W'], offeredTerms: ['W27', 'W29'] }, 'W28'));
});
test('specific terms: planning in W26 (before first term) → notOffered', () => {
  ok(isNotOffered({ offered: ['W'], offeredTerms: ['W27', 'W29'] }, 'W26'));
});

test('beyond-window fallback: W31 > maxN W29, offered=[W] → NOT notOffered', () => {
  // Falls back to season check: W31 is a Winter, offered includes W → OK
  ok(!isNotOffered({ offered: ['W'], offeredTerms: ['W27', 'W29'] }, 'W31'));
});
test('beyond-window fallback: S31 > maxN W29, offered=[W] → notOffered', () => {
  // Falls back to season check: S31 is a Spring, offered is W-only → error
  ok(isNotOffered({ offered: ['W'], offeredTerms: ['W27', 'W29'] }, 'S31'));
});
test('beyond-window fallback: F31 > maxN S28, offered=[S] → notOffered', () => {
  ok(isNotOffered({ offered: ['S'], offeredTerms: ['S26', 'S28'] }, 'F31'));
});

test('null info → not notOffered', () => {
  ok(!isNotOffered(null, 'W27'));
});

console.log('\ncomputeNextTerms() — CourseCatalog');

test('annual Winter course, currentTerm W26 → next 6 Winters', () => {
  const result = computeNextTerms(
    { offered: ['W'], offeredTerms: null },
    'W26'
  );
  eq(result, ['W27', 'W28', 'W29', 'W30', 'W31', 'W32']);
});

test('biennial Winter: W27,W29 available, currentTerm W26 → [W27,W29]', () => {
  const result = computeNextTerms(
    { offered: ['W'], offeredTerms: ['W27', 'W29'] },
    'W26'
  );
  eq(result, ['W27', 'W29']);
});

test('biennial Winter: currentTerm W27 → only W29 left', () => {
  const result = computeNextTerms(
    { offered: ['W'], offeredTerms: ['W27', 'W29'] },
    'W27'
  );
  eq(result, ['W29']);
});

test('biennial Winter: currentTerm W29 → empty (past all terms)', () => {
  const result = computeNextTerms(
    { offered: ['W'], offeredTerms: ['W27', 'W29'] },
    'W29'
  );
  eq(result, []);
});

test('offeredTerms already past: [W25] with currentTerm W26 → empty', () => {
  const result = computeNextTerms(
    { offered: ['W'], offeredTerms: ['W25'] },
    'W26'
  );
  eq(result, []);
});

test('offeredTerms include out-of-order entries → sorted by termToNum', () => {
  // F27 < W28 chronologically
  const result = computeNextTerms(
    { offered: ['F', 'W'], offeredTerms: ['W28', 'F27'] },  // unsorted
    'W26'
  );
  eq(result, ['F27', 'W28']);
});

test('annual Fall+Winter, currentTerm W26 → F and W only, no S', () => {
  const result = computeNextTerms(
    { offered: ['F', 'W'], offeredTerms: null },
    'W26'
  );
  // S terms excluded because offered only has F and W
  eq(result, ['F26', 'W27', 'F27', 'W28', 'F28', 'W29']);
});

test('Fall-only course, currentTerm W26 → F26..F31', () => {
  const result = computeNextTerms(
    { offered: ['F'], offeredTerms: null },
    'W26'
  );
  eq(result, ['F26', 'F27', 'F28', 'F29', 'F30', 'F31']);
});

test('no offered info → all 3 seasons', () => {
  const result = computeNextTerms(
    { offered: [], offeredTerms: null },
    'W26'
  );
  eq(result, ['S26', 'F26', 'W27', 'S27', 'F27', 'W28']);
});

test('offeredTerms capped at 6', () => {
  const result = computeNextTerms(
    { offered: ['W'], offeredTerms: ['W27','W28','W29','W30','W31','W32','W33'] },
    'W26'
  );
  eq(result.length, 6);
  eq(result, ['W27','W28','W29','W30','W31','W32']);
});

// Fix the Fall+Winter test above — let's be precise
test('Fall+Winter annual: next terms only F and W (no S)', () => {
  const result = computeNextTerms({ offered: ['F', 'W'], offeredTerms: null }, 'W26');
  // starting from W26, iterate: S26(skip-S), F26(F✓), W27(W✓), S27(skip-S), F27(F✓), W28(W✓)...
  eq(result, ['F26', 'W27', 'F27', 'W28', 'F28', 'W29']);
});

console.log('\nisAvailable() — SemesterPlanner availableCourses filter');

const done = new Set(['MATH135']);

test('normal W course available in W27', () => {
  ok(isAvailable({ code: 'MATH137', offered: ['W'], offeredTerms: null }, 'W27', done));
});
test('normal W course not available in S27', () => {
  ok(!isAvailable({ code: 'MATH137', offered: ['W'], offeredTerms: null }, 'S27', done));
});
test('biennial W course: available in W27 (in offeredTerms)', () => {
  ok(isAvailable({ code: 'AMATH383', offered: ['W'], offeredTerms: ['W27','W29'] }, 'W27', done));
});
test('biennial W course: NOT available in W28 (not in offeredTerms)', () => {
  ok(!isAvailable({ code: 'AMATH383', offered: ['W'], offeredTerms: ['W27','W29'] }, 'W28', done));
});
test('biennial W course: NOT available in S28 (wrong season)', () => {
  ok(!isAvailable({ code: 'AMATH383', offered: ['W'], offeredTerms: ['W27','W29'] }, 'S28', done));
});
test('completed course not available', () => {
  ok(!isAvailable({ code: 'MATH135', offered: ['F','W','S'], offeredTerms: null }, 'W27', done));
});
test('course with no offered info available in any season', () => {
  // offered: [] means unknown; the filter requires offered.includes(season), so this is excluded
  ok(!isAvailable({ code: 'MATH999', offered: [], offeredTerms: null }, 'W27', done));
});
test('Fall+Winter course available in F27', () => {
  ok(isAvailable({ code: 'CS341', offered: ['F','W'], offeredTerms: null }, 'F27', done));
});
test('Fall+Winter course NOT available in S27', () => {
  ok(!isAvailable({ code: 'CS341', offered: ['F','W'], offeredTerms: null }, 'S27', done));
});

// ─── planIssues key-collision fix ────────────────────────────────────────────
//
// Simulates the DegreePlan planIssues computation with `${term}:${code}` keys.

console.log('\nplanIssues key-collision (same course in two terms)');

function computePlanIssues(semesterPlans, courseInfoMap) {
  const issues = new Map();
  const allPlanned = Object.values(semesterPlans).flat();

  // Store MINIMUM (earliest) term per code — fixes availableByThen and antireq-suppression
  const courseTermNum = new Map();
  for (const [term, codes] of Object.entries(semesterPlans)) {
    const termN = termToNum(term);
    for (const code of codes) {
      const cur = courseTermNum.get(code);
      if (cur === undefined || termN < cur) courseTermNum.set(code, termN);
    }
  }

  for (const [term, codes] of Object.entries(semesterPlans)) {
    const termN = termToNum(term);
    for (const code of codes) {
      const info = courseInfoMap.get(code);
      const offered = info?.offered ?? [];
      const offeredTerms = info?.offeredTerms ?? null;
      const tSeason = term[0];
      let notOffered;
      if (offeredTerms) {
        const maxN = Math.max(...offeredTerms.map(t => termToNum(t)));
        notOffered = termToNum(term) > maxN
          ? offered.length > 0 && !offered.includes(tSeason)
          : !offeredTerms.includes(term);
      } else {
        notOffered = offered.length > 0 && !offered.includes(tSeason);
      }
      if (notOffered) {
        issues.set(`${term}:${code}`, { notOffered });
      }
    }
  }
  return issues;
}

test('same course in two terms: each gets independent issue state', () => {
  const plans = {
    'S27': ['PMATH333'],  // not offered in Spring → notOffered: true
    'W28': ['PMATH333'],  // offered in Winter → notOffered: false
  };
  const infoMap = new Map([
    ['PMATH333', { offered: ['F', 'W'], offeredTerms: null }],
  ]);
  const issues = computePlanIssues(plans, infoMap);
  ok(issues.has('S27:PMATH333'), 'S27 entry should exist');
  ok(issues.get('S27:PMATH333').notOffered === true, 'S27 should be notOffered');
  ok(!issues.has('W28:PMATH333'), 'W28 should have no issue (offered in Winter)');
});

test('biennial course: wrong term flagged, right term not flagged', () => {
  const plans = {
    'W27': ['AMATH383'],  // in offeredTerms → OK
    'W28': ['AMATH383'],  // NOT in offeredTerms → notOffered
  };
  const infoMap = new Map([
    ['AMATH383', { offered: ['W'], offeredTerms: ['W27', 'W29'] }],
  ]);
  const issues = computePlanIssues(plans, infoMap);
  ok(!issues.has('W27:AMATH383'), 'W27 is offered — should have no issue');
  ok(issues.has('W28:AMATH383'), 'W28 is not offered — should be flagged');
  ok(issues.get('W28:AMATH383').notOffered === true);
});

test('courseTermNum uses minimum term when course appears twice', () => {
  const plans = { 'W26': ['MATH135'], 'W28': ['MATH135'] };
  const courseTermNum = new Map();
  for (const [term, codes] of Object.entries(plans)) {
    const termN = termToNum(term);
    for (const code of codes) {
      const cur = courseTermNum.get(code);
      if (cur === undefined || termN < cur) courseTermNum.set(code, termN);
    }
  }
  eq(courseTermNum.get('MATH135'), termToNum('W26'), 'should store earliest term');
});

// ─── Merge logic ──────────────────────────────────────────────────────────────

console.log('\nMerge logic (Odyssey wins over Flow)');

function merge(flowData, odysseyData) {
  return { ...flowData, ...odysseyData };
}

test('Odyssey wins when both have data', () => {
  const flow     = { AMATH383: { seasons: ['W'], terms: null } };
  const odyssey  = { AMATH383: { seasons: ['W'], terms: ['W27','W29'] } };
  const m = merge(flow, odyssey);
  eq(m['AMATH383'], { seasons: ['W'], terms: ['W27','W29'] });
});

test('Flow fills gap when Odyssey has no entry', () => {
  const flow    = { CS999: { seasons: ['F'], terms: null } };
  const odyssey = {};
  const m = merge(flow, odyssey);
  eq(m['CS999'], { seasons: ['F'], terms: null });
});

test('empty Odyssey → Flow data preserved as-is', () => {
  const flow    = { STAT230: { seasons: ['F','W','S'], terms: null } };
  const odyssey = {};
  eq(merge(flow, odyssey)['STAT230'], { seasons: ['F','W','S'], terms: null });
});

test('empty Flow → Odyssey data preserved as-is', () => {
  const flow    = {};
  const odyssey = { PMATH334: { seasons: ['S','F'], terms: null } };
  eq(merge(flow, odyssey)['PMATH334'], { seasons: ['S','F'], terms: null });
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
