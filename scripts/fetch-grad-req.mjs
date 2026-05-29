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
const programs = Object.entries(data).filter(([id]) => !SKIP.has(id));

console.log(`Fetching graduationRequirementsHtml for ${programs.length} programs...`);
let updated = 0, noReq = 0;

for (let i = 0; i < programs.length; i++) {
  const [id, entry] = programs[i];
  try {
    const raw = execSync(`curl -s "${API_BASE}/${id}"`, { timeout: 15000 }).toString();
    const json = JSON.parse(raw);
    const gradHtml = json.graduationRequirements ?? '';
    const courseHtml = json.courseRequirementsNoUnits ?? '';

    if (gradHtml.trim()) {
      data[id].graduationRequirementsHtml = gradHtml;
    }

    // Fix programs with no course requirements (wrong rawHtml stored)
    if (!courseHtml.trim()) {
      data[id].rawHtml = '';
      data[id].requirements = [];
      console.log(`  ~ [${i+1}] ${entry.name}: cleared bad rawHtml (no course req)`);
      noReq++;
    }
    updated++;
  } catch (err) {
    console.log(`  ✗ [${i+1}] ${entry.name}: ${err.message?.slice(0,60)}`);
  }
}

writeFileSync(DATA, JSON.stringify(data, null, 2));
console.log(`\nDone. Updated ${updated}, no-course-req programs fixed: ${noReq}.`);
