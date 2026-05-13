// One-time scraper: fetch antirequisite data from UW Open Data API
// Run with: node scripts/scrape-antireqs.mjs
// Output: src/data/antireqs.json — map of courseCode -> string[]

import { writeFileSync } from 'fs';

const API_KEY = '46CED36A7BD5482187DA2E23EDACA4C1';
const BASE = 'https://openapi.data.uwaterloo.ca/v3';

// Recent terms: Spring 2026, Winter 2026, Fall 2025, Spring 2025, Winter 2025, Fall 2024
const TERMS = [1265, 1261, 1259, 1255, 1251, 1249];

// Math faculty + non-math subjects that commonly appear in math program requirements
const SUBJECTS = [
  'ACTSC','AMATH','CO','CS','MATBUS','MATH','PMATH','STAT',
  'AFM','ARBUS','BIOL','BUS','ECE','ECON','ENGL','HLTH',
  'LS','MGMT','MSE','MTHEL','PHYS','PSYCH','STV',
  'COMM','COMMST','PHIL','PD',
];

function parseAntireqs(desc) {
  if (!desc) return [];
  const match = desc.match(/Antireq[s]?:\s*([^.]+)/i);
  if (!match) return [];
  const codes = [];
  const pattern = /\b([A-Z]{2,8})\s+(\d{1,3}[A-Z]?)\b/g;
  let m;
  while ((m = pattern.exec(match[1])) !== null) {
    codes.push(m[1] + m[2]);
  }
  return codes;
}

// "AMATH 242/CS 371" means AMATH242 and CS371 are antireqs of each other
function parseSlashGroups(desc) {
  if (!desc) return [];
  const match = desc.match(/Antireq[s]?:\s*([^.]+)/i);
  if (!match) return [];
  const groups = [];
  const slashPattern = /[A-Z]{2,8}\s+\d{1,3}[A-Z]?(?:\s*\/\s*[A-Z]{2,8}\s+\d{1,3}[A-Z]?)+/g;
  const codePattern = /([A-Z]{2,8})\s+(\d{1,3}[A-Z]?)/g;
  let m;
  while ((m = slashPattern.exec(match[1])) !== null) {
    const groupCodes = [];
    let cm;
    codePattern.lastIndex = 0;
    while ((cm = codePattern.exec(m[0])) !== null) groupCodes.push(cm[1] + cm[2]);
    if (groupCodes.length >= 2) groups.push(groupCodes);
  }
  return groups;
}

async function fetchSubjectTerm(subject, term) {
  const url = `${BASE}/Courses/${term}/${subject}`;
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY } });
  if (!res.ok) return [];
  return res.json();
}

const seen = new Map(); // courseCode -> requirementsDescription (latest wins)

for (const term of TERMS) {
  process.stdout.write(`Fetching term ${term}...\n`);
  for (const subject of SUBJECTS) {
    try {
      const courses = await fetchSubjectTerm(subject, term);
      for (const c of courses) {
        const code = `${c.subjectCode}${c.catalogNumber}`;
        if (c.requirementsDescription && !seen.has(code)) {
          seen.set(code, c.requirementsDescription);
        }
      }
    } catch {
      // subject not offered this term — skip
    }
  }
}

// Build antireqs map: only include courses that have antireqs
const antireqs = {};
for (const [code, desc] of seen) {
  const reqs = parseAntireqs(desc);
  if (reqs.length > 0) antireqs[code] = reqs;
}

// Add slash-group mutual antireqs: "AMATH 242/CS 371" -> link AMATH242 <-> CS371
for (const [, desc] of seen) {
  for (const group of parseSlashGroups(desc)) {
    for (const a of group) {
      for (const b of group) {
        if (a === b) continue;
        if (!antireqs[a]) antireqs[a] = [];
        if (!antireqs[a].includes(b)) antireqs[a].push(b);
      }
    }
  }
}

// Make it symmetric: if A antireqs B, also add B antireqs A
for (const [code, reqs] of Object.entries(antireqs)) {
  for (const other of reqs) {
    if (!antireqs[other]) antireqs[other] = [];
    if (!antireqs[other].includes(code)) antireqs[other].push(code);
  }
}

const sorted = Object.fromEntries(
  Object.entries(antireqs).sort(([a], [b]) => a.localeCompare(b))
);

writeFileSync('src/data/antireqs.json', JSON.stringify(sorted, null, 2));
console.log(`Done. ${Object.keys(sorted).length} courses with antireqs.`);
