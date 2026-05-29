// Reparses the `rawHtml` field in requirements-filtered.json and regenerates
// the `requirements` tree for every program.
import { parse } from 'node-html-parser';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '../src/data/requirements-filtered.json');

// ── helpers ──────────────────────────────────────────────────────────────────

function stripComments(html) {
  return html.replace(/<!--.*?-->/g, '');
}

function courseText(li) {
  // <a>CODE</a> - Name <span>(credits)</span>
  const a = li.querySelector('a');
  const code = a ? a.text.trim() : '';
  const raw = li.text.replace(/\s+/g, ' ').trim();
  return { code, text: raw };
}

// Recursively parse a <ul> of rule items into ReqNode[]
// The HTML sometimes wraps <li> elements in <div> siblings of other <li>s.
function parseUl(ul) {
  const nodes = [];
  for (const child of ul.childNodes) {
    const tag = child.tagName?.toLowerCase();
    if (tag === 'li') {
      const node = parseLi(child);
      if (node) nodes.push(node);
    } else if (tag === 'div') {
      // div wrapper — find direct li children inside
      for (const li of child.querySelectorAll(':scope > li')) {
        const node = parseLi(li);
        if (node) nodes.push(node);
      }
    }
  }
  return nodes;
}

function parseLi(li) {
  // ── group wrapper: <span>Complete N…</span><ul>…</ul>
  //    Check this FIRST — the nested ul may contain ruleView divs that would
  //    fool the ruleDiv check below if we don't short-circuit here.
  const span = li.querySelector(':scope > span');
  const childUl = li.querySelector(':scope > ul');
  if (span && childUl) {
    const spanText = span.text.replace(/\s+/g, ' ').trim();
    const children = parseUl(childUl);
    return groupNode(spanText, children);
  }

  // ── concrete rule: immediate child div with data-test="ruleView-X-result" ─
  const ruleDiv = li.querySelector(':scope > div[data-test$="-result"]')
               ?? li.querySelector(':scope > div[data-test^="ruleView-"]');
  if (ruleDiv) {
    return parseRuleDiv(ruleDiv);
  }

  // ── plain <div> wrapper (rare) ────────────────────────────────────────────
  const div = li.querySelector(':scope > div');
  if (div) return parseRuleDiv(div);

  return null;
}

function parseRuleDiv(div) {
  const rawText = div.text.replace(/\s+/g, ' ').trim();

  // Does this div contain an inner course list?
  const courseUl = div.querySelector('ul');

  if (courseUl) {
    const courseItems = courseUl.querySelectorAll(':scope > li');
    const header = div.text.split('\n')[0].replace(/\s+/g, ' ').trim();

    // Exclusion ("The following cannot be used…")
    if (/cannot be used/i.test(header)) {
      const children = courseItems.map(li => {
        const { code, text } = courseText(li);
        return { type: 'COURSE', code, text };
      });
      return { type: 'COURSE', code: '', text: header, children };
    }

    // "Complete N of the following:" / "Complete all the following:"
    const children = courseItems.map(li => {
      // A course item may itself contain nested rules (AND sub-group)
      const nestedRuleDiv = li.querySelector('[data-test^="ruleView-"]');
      if (nestedRuleDiv) return parseRuleDiv(nestedRuleDiv);
      const { code, text } = courseText(li);
      return { type: 'COURSE', code, text };
    });

    return groupNode(header, children);
  }

  // Text-only rule — ADDITIONAL or open-ended description
  const innerText = rawText;
  const nMatch = innerText.match(/Complete\s+(\d+)\s+additional/i);
  const n = nMatch ? parseInt(nMatch[1]) : undefined;
  return { type: 'ADDITIONAL', code: '', text: innerText, ...(n != null ? { n } : {}) };
}

function groupNode(headerText, children) {
  const allMatch = /complete\s+all/i.test(headerText);
  const nMatch = headerText.match(/complete\s+(\d+)\s+of/i);
  const n = nMatch ? parseInt(nMatch[1]) : null;

  const fullText = headerText + ' ' + children.map(c => c.text).join('');

  if (allMatch) {
    return { type: 'AND', code: '', text: fullText, children };
  }
  if (n === 1) {
    return { type: 'OR', code: '', text: fullText, children };
  }
  if (n != null) {
    return { type: 'N_OF', n, code: '', text: fullText, children };
  }
  // Fallback: treat as AND
  return { type: 'AND', code: '', text: fullText, children };
}

// ── top-level parse ──────────────────────────────────────────────────────────

function parseProgram(rawHtml) {
  if (!rawHtml) return [];
  const root = parse(stripComments(rawHtml));
  const nodes = [];

  // Each top-level <section> is a grouping (e.g. "Required Courses", "Approved Courses List").
  // Nested sections (list sub-groups like "List 1", "List A") have their <header> wrapped in a
  // <div> rather than being a direct child — skip them here; they're handled below.
  for (const section of root.querySelectorAll('section')) {
    const directHeader = section.querySelector(':scope > header');
    if (!directHeader) continue; // nested section — skip

    const sectionLabel = section.querySelector('[data-testid="grouping-label"]')?.text?.trim()
                      ?? section.querySelector('.style__itemHeaderH2___2f-ov')?.text?.trim()
                      ?? '';

    // Main rule list for this section
    const ul = section.querySelector(':scope > div > div > ul');
    const children = ul ? parseUl(ul) : [];

    // Some sections (e.g. "Approved Courses List") have a second inner div that contains
    // nested sub-sections (List 1/2/3, List A/B). Process them and append to children.
    const innerDivs = section.querySelectorAll(':scope > div > div');
    if (innerDivs.length >= 2) {
      const subSections = innerDivs[1].querySelectorAll(':scope > section');
      for (const subSect of subSections) {
        // Sub-section ul is one level deeper: section > div > header + div > div > ul
        const subUl = subSect.querySelector('ul');
        if (!subUl) continue;
        const subChildren = parseUl(subUl);
        children.push(...subChildren);
      }
    }

    if (children.length === 0) continue;
    if (children.length === 1 && !sectionLabel) {
      nodes.push(children[0]);
    } else if (sectionLabel && children.length > 0) {
      // Flatten single AND wrapper — avoid double-nesting
      if (children.length === 1 && children[0].type === 'AND') {
        nodes.push(...(children[0].children ?? children));
      } else {
        nodes.push(...children);
      }
    } else {
      nodes.push(...children);
    }
  }

  return nodes;
}

// ── main ─────────────────────────────────────────────────────────────────────

const data = JSON.parse(readFileSync(DATA, 'utf8'));
let updated = 0;

for (const [id, entry] of Object.entries(data)) {
  if (!entry.rawHtml) continue;
  try {
    const requirements = parseProgram(entry.rawHtml);
    if (requirements.length > 0) {
      entry.requirements = requirements;
      updated++;
    }
  } catch (e) {
    console.warn(`Failed to parse ${entry.name}: ${e.message}`);
  }
}

writeFileSync(DATA, JSON.stringify(data, null, 2));
console.log(`Updated ${updated} programs.`);
