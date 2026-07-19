/**
 * Hand-maintained overlays applied AFTER parsing rawHtml (see reparse-requirements.mjs).
 *
 * The Kuali "course requirements" section is incomplete for some programs — e.g. most
 * minors state their total unit count only in the graduation-requirements prose, and the
 * Engineering Specialization is one Kuali program that we present as three theme entries.
 * Those gaps used to be patched by editing requirements-filtered.json directly, which
 * `npm run refresh-data` silently clobbered. Keeping the edits here makes a refresh safe:
 * reparse regenerates every tree from rawHtml, then re-applies these overlays.
 *
 * Overlay operations, applied in this order:
 *   append:  nodes added to the end of the parsed tree. Used for "Complete N additional
 *            <subject> courses" slots derived from each minor's graduation requirements.
 *   setN:    set `n` on the node whose `text` matches exactly (searched depth-first).
 *            Used where the calendar prose has a count the parser doesn't extract.
 *   subtree: replace the tree with the node at a child-index path into the parsed tree.
 *            `expectCode` is the first course code of that subtree — if it doesn't match,
 *            the calendar structure changed and the overlay refuses to apply.
 */

export const overlays = {
  // ── minors: total course count lives in graduationRequirements prose ────────
  'Sk4t6h_nJg': { // Business Economics Minor
    append: [{ type: 'ADDITIONAL', text: 'Complete 4 additional courses (subject codes: ECON, COMM, MSE, AFM, ACTSC, MATBUS)', n: 4, code: '' }],
  },
  'rkrro3Onye': { // Economic Policy Minor
    append: [{ type: 'ADDITIONAL', text: 'Complete 4 additional courses (subject codes: ECON, COMM, MSE)', n: 4, code: '' }],
  },
  'H1fgyRCon': { // Economic Theory Minor
    append: [{ type: 'ADDITIONAL', text: 'Complete 3 additional ECON courses', n: 3, code: '' }],
  },
  'HJNg100jh': { // Gender and Social Justice Minor
    append: [{ type: 'ADDITIONAL', text: 'Complete 7 additional GSJ courses', n: 7, code: '' }],
  },
  'BJeUl100on': { // Philosophy Minor
    append: [{ type: 'ADDITIONAL', text: 'Complete 7 additional PHIL courses', n: 7, code: '' }],
  },

  // ── Statistics: "Complete 2 STAT courses at the 400-level" has no parsed n ──
  'H1XegyCAin': { // Statistics (Bachelor of Mathematics - Honours)
    setN: [{ text: 'Complete 2 STAT courses at the 400-level', n: 2 }],
  },
  'BybggJARoh': { // Statistics (Joint Honours)
    setN: [{ text: 'Complete 2 STAT courses at the 400-level', n: 2 }],
  },

  // ── Engineering Specialization: one Kuali program split into 3 theme entries ─
  // rawHtml is the full specialization; each entry keeps only its theme's branch of
  // the top-level "Complete 1 of the following" OR.
  'HkzBkkCCoh-t1': { subtree: { path: [0, 0], expectCode: 'AMATH271' } }, // Fluids and Heat
  'HkzBkkCCoh-t2': { subtree: { path: [0, 1], expectCode: 'AMATH455' } }, // Communication and Control
  'HkzBkkCCoh-t3': { subtree: { path: [0, 2], expectCode: 'AMATH361' } }, // Heat and Mass Transfer
};

function firstCode(node) {
  if (!node) return null;
  if (node.code) return node.code;
  for (const c of node.children ?? []) {
    const got = firstCode(c);
    if (got) return got;
  }
  return null;
}

function setNByText(nodes, text, n) {
  for (const node of nodes) {
    if (node.text === text) { node.n = n; return true; }
    if (node.children && setNByText(node.children, text, n)) return true;
  }
  return false;
}

/**
 * Apply the overlay for `id` (if any) to a freshly parsed requirements tree.
 * Returns the tree to store. Warns and leaves the tree unpatched if an overlay
 * no longer matches the parsed structure (i.e. the calendar changed underneath it).
 */
export function applyOverlay(id, requirements) {
  const ov = overlays[id];
  if (!ov) return requirements;
  let out = requirements;

  if (ov.subtree) {
    let node = { children: out };
    for (const i of ov.subtree.path) node = (node.children ?? [])[i];
    if (!node || firstCode(node) !== ov.subtree.expectCode) {
      console.warn(`overlay ${id}: subtree at [${ov.subtree.path}] no longer starts with ${ov.subtree.expectCode} — calendar structure changed, overlay NOT applied`);
      return requirements;
    }
    out = [node];
  }

  if (ov.setN) {
    for (const { text, n } of ov.setN) {
      if (!setNByText(out, text, n)) {
        console.warn(`overlay ${id}: no node with text "${text}" — setN skipped`);
      }
    }
  }

  if (ov.append) {
    out = [...out, ...ov.append.map(n => ({ ...n }))];
  }

  return out;
}
