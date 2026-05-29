// Scrapes rawHtml for programs missing from requirements-filtered.json
// Uses Playwright to render the Kuali catalog SPA and extract requirements HTML
// Run with: node scripts/scrape-missing-programs.mjs

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../src/data/requirements-filtered.json');
const CATALOG_BASE = 'https://uwaterloo.ca/academic-calendar/undergraduate-studies/catalog';

const data = JSON.parse(readFileSync(DATA, 'utf8'));
const missing = Object.values(data).filter(e => e.id && (!e.rawHtml || e.rawHtml.trim() === ''));

if (missing.length === 0) {
  console.log('No missing programs to scrape.');
  process.exit(0);
}

console.log(`Scraping ${missing.length} programs...`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await context.newPage();

let updated = 0;

for (const entry of missing) {
  const url = `${CATALOG_BASE}#/programs/${entry.id}`;
  console.log(`\n[${updated + 1}/${missing.length}] ${entry.name}`);
  console.log(`  → ${url}`);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for requirements sections to appear
    await page.waitForSelector('section', { timeout: 15000 }).catch(() => null);

    // Give the SPA a moment to fully render
    await page.waitForTimeout(1500);

    // Extract the requirements container HTML
    // The requirements live inside the main catalog content area
    const html = await page.evaluate(() => {
      // Find the program requirements container - look for sections with requirement groupings
      const sections = document.querySelectorAll('section');
      if (sections.length === 0) return null;

      // Build a container with all sections
      const container = document.createElement('div');
      sections.forEach(s => container.appendChild(s.cloneNode(true)));
      return container.innerHTML;
    });

    if (html && html.trim().length > 50) {
      data[entry.id].rawHtml = html;
      updated++;
      console.log(`  ✓ got ${html.length} chars`);
    } else {
      console.log(`  ✗ no requirements found (page may not have rendered)`);

      // Try waiting longer
      await page.waitForTimeout(3000);
      const html2 = await page.evaluate(() => {
        const sections = document.querySelectorAll('section');
        if (sections.length === 0) return null;
        const container = document.createElement('div');
        sections.forEach(s => container.appendChild(s.cloneNode(true)));
        return container.innerHTML;
      });

      if (html2 && html2.trim().length > 50) {
        data[entry.id].rawHtml = html2;
        updated++;
        console.log(`  ✓ got ${html2.length} chars (after retry)`);
      } else {
        console.log(`  ✗ still empty after retry`);
      }
    }
  } catch (err) {
    console.log(`  ✗ error: ${err.message}`);
  }

  // Small delay between requests
  await page.waitForTimeout(500);
}

await browser.close();

writeFileSync(DATA, JSON.stringify(data, null, 2));
console.log(`\nDone. Updated ${updated}/${missing.length} programs.`);

if (updated > 0) {
  console.log('\nNow run: node scripts/reparse-requirements.mjs');
}
