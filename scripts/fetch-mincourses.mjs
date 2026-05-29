import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../src/data/requirements-filtered.json');
const CATALOG_ID = '67e557ed6ed2fe2bd3a38956';
const API_BASE = `https://uwaterloocm.kuali.co/api/v1/catalog/program/${CATALOG_ID}`;
const SKIP = new Set(['core-bmath', 'core-bmath-mathstudies']);

const data = JSON.parse(readFileSync(DATA, 'utf8'));
const programs = Object.entries(data).filter(([id, e]) => !SKIP.has(id) && (e.isMinor || e.isMathFaculty) && e.minCourses == null);

console.log(`Fetching minCourses for ${programs.length} programs...`);
let updated = 0, skipped = 0;

for (let i = 0; i < programs.length; i++) {
  const [id, entry] = programs[i];
  try {
    const raw = execSync(`curl -s "${API_BASE}/${id}"`, { timeout: 15000 }).toString();
    const json = JSON.parse(raw);
    const gradHtml = json.graduationRequirements ?? '';
    const unitMatch = gradHtml.match(/(\d+(?:\.\d+)?)\s+units?/i);
    if (unitMatch) {
      data[id].minCourses = Math.round(parseFloat(unitMatch[1]) * 2);
      console.log(`  ✓ [${i+1}/${programs.length}] ${entry.name}: ${data[id].minCourses} courses`);
      updated++;
    } else {
      console.log(`  - [${i+1}/${programs.length}] ${entry.name}: no grad req`);
      skipped++;
    }
  } catch (err) {
    console.log(`  ✗ [${i+1}/${programs.length}] ${entry.name}: ${err.message?.slice(0,60)}`);
    skipped++;
  }
}

writeFileSync(DATA, JSON.stringify(data, null, 2));
console.log(`\nDone. Updated ${updated}, skipped ${skipped}.`);
