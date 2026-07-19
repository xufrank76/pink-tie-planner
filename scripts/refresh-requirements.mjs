/**
 * Refreshes rawHtml for all programs in requirements-filtered.json by fetching
 * directly from the Kuali catalog API. No browser/Playwright needed.
 *
 * Usage:
 *   node scripts/refresh-requirements.mjs            # refresh all programs
 *   node scripts/refresh-requirements.mjs --missing  # only programs without rawHtml
 *
 * After this, run:
 *   node scripts/reparse-requirements.mjs
 *
 * Or use the combined npm script:
 *   npm run refresh-data
 *
 * CATALOG_ID: the Kuali catalog ID for the current academic year.
 * Update this each year — find it in the network tab when loading
 * https://uwaterloo.ca/academic-calendar/undergraduate-studies/catalog
 * (look for requests to uwaterloocm.kuali.co/api/v1/catalog/program/...)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../src/data/requirements-filtered.json');

const CATALOG_ID = '67e557ed6ed2fe2bd3a38956'; // 2025-2026 academic year
const API_BASE = `https://uwaterloocm.kuali.co/api/v1/catalog/program/${CATALOG_ID}`;

// IDs that are synthetic (not real Kuali PIDs) — skip these
const SKIP_IDS = new Set(['core-bmath', 'core-bmath-mathstudies']);

const missingOnly = process.argv.includes('--missing');

const data = JSON.parse(readFileSync(DATA, 'utf8'));

const programs = Object.entries(data).filter(([id, entry]) => {
  if (!entry || SKIP_IDS.has(id)) return false;
  if (missingOnly && entry.rawHtml && entry.rawHtml.trim().length > 50) return false;
  return true;
});

console.log(`Refreshing ${programs.length} programs from Kuali API...`);
if (missingOnly) console.log('(--missing: only programs without rawHtml)');

let updated = 0;
let failed = 0;

for (let i = 0; i < programs.length; i++) {
  const [id, entry] = programs[i];
  const label = `[${i + 1}/${programs.length}] ${entry.name ?? id}`;

  try {
    // Theme entries (e.g. HkzBkkCCoh-t1) are synthetic splits of one Kuali program —
    // fetch the base pid; reparse-requirements.mjs narrows each to its theme via overlay.
    const pid = id.replace(/-t\d+$/, '');
    const raw = execSync(`curl -s "${API_BASE}/${pid}"`, { timeout: 15000 }).toString();
    const json = JSON.parse(raw);
    const html = json.courseRequirementsNoUnits ?? '';
    const gradHtml = json.graduationRequirements ?? '';
    const constraintsHtml = json.additionalConstraints ?? '';
    // Approved-course lists live in a separate field for some programs (e.g. Medieval
    // Studies) — without it, "from the course lists below" rows point at nothing.
    const listsHtml = json.courseListsNew ?? '';
    if (listsHtml.trim()) data[id].courseListsHtml = listsHtml;
    else delete data[id].courseListsHtml;

    // Always store graduation requirements and additional constraints for display.
    if (gradHtml.trim()) {
      data[id].graduationRequirementsHtml = gradHtml;
    }
    if (constraintsHtml.trim()) {
      data[id].additionalConstraintsHtml = constraintsHtml;
    }

    // Parse minimum unit count from graduation requirements.
    const unitMatch = gradHtml.match(/(\d+(?:\.\d+)?)\s+units?/i);
    if (unitMatch) {
      data[id].minCourses = Math.round(parseFloat(unitMatch[1]) * 2);
    }

    if (!html.trim()) {
      // No course requirements in Kuali — clear rawHtml so the display falls back
      // to graduationRequirementsHtml.
      data[id].rawHtml = '';
      data[id].requirements = [];
      console.log(`  ~ ${label} — no course req, stored grad req only`);
      updated++;
      continue;
    }
    data[id].rawHtml = html;
    updated++;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.log(`  ✗ ${label} — ${err.message?.slice(0, 80)}`);
    failed++;
  }
}

writeFileSync(DATA, JSON.stringify(data, null, 2));
console.log(`\nDone. Updated ${updated}, failed ${failed}.`);
if (updated > 0) {
  console.log('Run next: node scripts/reparse-requirements.mjs');
}
