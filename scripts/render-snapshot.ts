/**
 * Render-snapshot harness for degree plan display.
 *
 * For every program, renders ReqNodeView (the real component) in three states:
 *   EMPTY   — no completed/planned courses: must show the full calendar structure
 *   PLANNED — every course in the tree is planned: exercises the collapse/dim heuristics
 *   DONE    — every course completed: exercises the "collapse to chosen" paths
 *
 * Snapshots are written to scripts/plan-snapshots/<id>.txt. Commit them: any change
 * to the display heuristics in DegreePlan.tsx shows its full blast radius as a git diff.
 *
 * The EMPTY state is also verified against the calendar source (rawHtml): every course
 * code the calendar lists must appear in the render (WLU `…W` courses are exempt —
 * they are intentionally hidden until planned).
 *
 * Usage:
 *   npx tsx scripts/render-snapshot.ts            # write snapshots + verify
 *   npx tsx scripts/render-snapshot.ts --check    # verify only, exit 1 on mismatch
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { ReqNodeView } from '../src/components/DegreePlan';
import { courseCodes, type ReqNode } from '../src/lib/requirementEvaluator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../src/data/requirements-filtered.json');
const OUT_DIR = path.join(__dirname, 'plan-snapshots');
const checkOnly = process.argv.includes('--check');

type Entry = {
  name: string;
  requirements?: ReqNode[];
  rawHtml?: string;
};

const data = JSON.parse(readFileSync(DATA, 'utf8')) as Record<string, Entry>;

// ── outline extraction ────────────────────────────────────────────────────────

/** Convert rendered HTML into an indented text outline, one line per block element. */
function htmlToOutline(html: string): string {
  const root = parse(html);
  const lines: string[] = [];
  const walk = (node: ReturnType<typeof parse>, depth: number) => {
    for (const child of node.childNodes) {
      const el = child as unknown as { tagName?: string; text?: string; childNodes?: unknown[]; getAttribute?: (a: string) => string | undefined };
      if (!el.tagName) {
        const t = (el.text ?? '').replace(/\s+/g, ' ').trim();
        if (t) {
          if (lines.length && lines[lines.length - 1].endsWith('·')) lines[lines.length - 1] += ' ' + t;
          else lines.push('  '.repeat(depth) + t);
        }
        continue;
      }
      const tag = el.tagName.toLowerCase();
      if (tag === 'div' || tag === 'section' || tag === 'ul' || tag === 'li') {
        // block: children start fresh lines; indent one level for nested margin containers
        const style = el.getAttribute?.('style') ?? '';
        const indents = /margin-left/.test(style) ? 1 : 0;
        const before = lines.length;
        walk(child as never, depth + indents);
        // merge purely-inline blocks (a course row renders as one div with spans inside)
        const added = lines.length - before;
        if (added > 1 && !(child as never as { querySelector: (s: string) => unknown }).querySelector('div, ul, li, section')) {
          const merged = lines.splice(before).map(l => l.trim()).join(' ');
          lines.push('  '.repeat(depth + indents) + merged);
        }
      } else {
        // inline element: contribute text to current line
        const t = (el.text ?? '').replace(/\s+/g, ' ').trim();
        if (t) lines.push('  '.repeat(depth) + t);
      }
    }
  };
  walk(root as never, 0);
  return lines.join('\n');
}

const CODE_RE = /\b([A-Z]{2,8})(\d{3}[A-Z]?)\b/g;

/** Course codes the calendar lists, in order (from <a> course links). */
function calendarCodes(rawHtml: string): string[] {
  const root = parse(rawHtml.replace(/<!--.*?-->/g, ''));
  const out: string[] = [];
  for (const a of root.querySelectorAll('a')) {
    const m = a.text.replace(/\s+/g, ' ').trim().match(/^([A-Z]{2,8})\s?(\d{3}[A-Z]?)$/);
    if (m) out.push(m[1] + m[2]);
  }
  return out;
}

function renderedCodes(outline: string): Set<string> {
  const codes = new Set<string>();
  for (const m of outline.matchAll(CODE_RE)) codes.add(m[1] + m[2]);
  return codes;
}

// ── render one program in one state ──────────────────────────────────────────

function renderState(entry: Entry, completed: Set<string>, planned: Set<string>): string {
  const parts: string[] = [];
  for (const node of entry.requirements ?? []) {
    const html = renderToStaticMarkup(
      createElement(ReqNodeView, {
        node,
        completedSet: completed,
        planSet: planned,
        rawHtml: entry.rawHtml ?? null,
      }),
    );
    parts.push(htmlToOutline(html));
  }
  return parts.join('\n---\n');
}

// ── main ──────────────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });

const failures: { id: string; name: string; missing: string[] }[] = [];
const errors: { id: string; name: string; error: string }[] = [];
let written = 0;

for (const [id, entry] of Object.entries(data)) {
  if (!entry?.requirements?.length) continue;
  const allCodes = new Set(entry.requirements.flatMap(n => courseCodes(n)));
  const empty = new Set<string>();

  let emptyOutline = '';
  let plannedOutline = '';
  let doneOutline = '';
  try {
    emptyOutline = renderState(entry, empty, empty);
    plannedOutline = renderState(entry, empty, allCodes);
    doneOutline = renderState(entry, allCodes, allCodes);
  } catch (e) {
    errors.push({ id, name: entry.name, error: (e as Error).message });
    continue;
  }

  const snapshot = [
    `# ${entry.name} (${id})`,
    '', '## EMPTY (nothing completed or planned — must match the calendar)', '',
    emptyOutline,
    '', '## PLANNED (every course planned)', '',
    plannedOutline,
    '', '## DONE (every course completed)', '',
    doneOutline,
    '',
  ].join('\n');

  if (!checkOnly) {
    writeFileSync(path.join(OUT_DIR, `${id}.txt`), snapshot);
    written++;
  }

  // Verify EMPTY render covers everything the calendar lists (except WLU-only …W codes,
  // which are hidden until planned). Codes only in ADDITIONAL free-text count as shown.
  if (entry.rawHtml?.trim()) {
    const shown = renderedCodes(emptyOutline);
    const treeCodes = allCodes;
    const missing = [...new Set(calendarCodes(entry.rawHtml))].filter(
      c => !c.endsWith('W') && treeCodes.has(c) && !shown.has(c),
    );
    if (missing.length) failures.push({ id, name: entry.name, missing });
  }
}

if (!checkOnly) console.log(`Wrote ${written} snapshots to ${path.relative(process.cwd(), OUT_DIR)}/`);

if (errors.length) {
  console.log(`\n${errors.length} programs failed to render:`);
  for (const e of errors) console.log(`  ✗ ${e.name} (${e.id}): ${e.error}`);
}

if (failures.length) {
  console.log(`\n${failures.length} programs render incomplete EMPTY state (calendar courses not shown):`);
  for (const f of failures) {
    console.log(`  ✗ ${f.name} (${f.id})`);
    console.log(`      missing: ${f.missing.slice(0, 15).join(', ')}${f.missing.length > 15 ? ` … +${f.missing.length - 15}` : ''}`);
  }
} else if (!errors.length) {
  console.log('All programs render the full calendar structure in the EMPTY state.');
}

if (checkOnly && (failures.length || errors.length)) process.exit(1);
