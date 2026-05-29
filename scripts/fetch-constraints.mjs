/**
 * One-time backfill: fetch additionalConstraints HTML for all programs.
 * Usage: node scripts/fetch-constraints.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../src/data/requirements-filtered.json');

const CATALOG_ID = '67e557ed6ed2fe2bd3a38956';
const API_BASE = `https://uwaterloocm.kuali.co/api/v1/catalog/program/${CATALOG_ID}`;
const SKIP_IDS = new Set(['core-bmath', 'core-bmath-mathstudies']);

const data = JSON.parse(readFileSync(DATA, 'utf8'));
const programs = Object.entries(data).filter(([id, entry]) => entry && !SKIP_IDS.has(id));

console.log(`Fetching additionalConstraints for ${programs.length} programs...`);
let updated = 0, failed = 0;

for (let i = 0; i < programs.length; i++) {
  const [id, entry] = programs[i];
  const label = `[${i + 1}/${programs.length}] ${entry.name ?? id}`;
  try {
    const raw = execSync(`curl -s "${API_BASE}/${id}"`, { timeout: 15000 }).toString();
    const json = JSON.parse(raw);
    const html = json.additionalConstraints ?? '';
    if (html.trim()) {
      data[id].additionalConstraintsHtml = html;
    } else {
      delete data[id].additionalConstraintsHtml;
    }
    updated++;
    console.log(`  ✓ ${label}${html.trim() ? '' : ' (none)'}`);
  } catch (err) {
    console.log(`  ✗ ${label} — ${err.message?.slice(0, 80)}`);
    failed++;
  }
}

writeFileSync(DATA, JSON.stringify(data, null, 2));
console.log(`\nDone. Processed ${updated}, failed ${failed}.`);
