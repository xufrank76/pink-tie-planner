import type { ReqNode } from '@/src/lib/requirementEvaluator';
import { isMathUndergradCommBlock, isStatActsciCommBlock } from '@/src/lib/requirementEvaluator';

export type ProgramLike = {
  major: string;
  doubleMajor: string | null;
  extras: { type: string; name: string }[];
};

/** Actuarial Science, Statistics, or Biostatistics plans use List 1 + ENGL 378 / MTHEL 300 (not the general List 2 menu). */
export function isStatActsciBiostatPlan(program: ProgramLike): boolean {
  const names = [
    program.major,
    program.doubleMajor,
    ...program.extras.filter(e => e.type === 'major' || e.type === 'joint').map(e => e.name),
  ].filter(Boolean) as string[];
  return names.some(n => {
    const x = n.toLowerCase();
    if (x.includes('actuarial')) return true;
    if (x.includes('biostat')) return true;
    if (x.includes('statistics')) return true;
    return false;
  });
}

/** Deep-clone core `requirements` and, for stat/actsci/biostat majors, replace the communication block’s second slot with ENGL378 / MTHEL300 only. */
export function patchCoreBmathRequirements(requirements: ReqNode[], program: ProgramLike): ReqNode[] {
  const out = JSON.parse(JSON.stringify(requirements)) as ReqNode[];
  if (!isStatActsciBiostatPlan(program)) return out;
  const root = out[0];
  if (!root?.children) return out;
  root.children = root.children.map(ch => {
    if (!/Undergraduate Communication Requirement/i.test(ch.text ?? '')) return ch;
    const list1 = ch.children?.[0];
    if (!list1 || list1.type !== 'OR') return ch;
    return {
      ...ch,
      children: [
        JSON.parse(JSON.stringify(list1)) as ReqNode,
        {
          type: 'OR' as const,
          text: 'Complete ENGL 378 or MTHEL 300 (required for Actuarial Science, Statistics, or Biostatistics plans)',
          children: [
            {
              type: 'COURSE' as const,
              code: 'ENGL378',
              text: 'ENGL378 - Professional Communications in Statistics and Actuarial Science (0.50)',
            },
            {
              type: 'COURSE' as const,
              code: 'MTHEL300',
              text: 'MTHEL300 - Professional Communications in Statistics and Actuarial Science (0.50)',
            },
          ],
        },
      ],
    };
  });
  return out;
}

const norm = (c: string) => c.replace(/\s+/g, '').toUpperCase();

/**
 * For Core BMath communication: List 2 OR always shows List 1 ∪ List 2 options for the second
 * course, deduped by code. Any List 1 course already planned/completed is omitted here so it
 * does not appear twice with two checkmarks.
 */
export function adjustUndergradCommList2ForPlanDisplay(node: ReqNode, planSet: Set<string>): ReqNode {
  if (!isMathUndergradCommBlock(node) || isStatActsciCommBlock(node)) return node;
  const ch = node.children ?? [];
  if (ch.length !== 2 || ch[0].type !== 'OR' || ch[1].type !== 'OR') return node;

  const plan = new Set([...planSet].map(norm));
  const clone = JSON.parse(JSON.stringify(node)) as ReqNode;
  const list1Or = clone.children![0];
  const list2Or = clone.children![1];
  const l1Kids = (list1Or.children ?? []) as ReqNode[];
  const l2Kids = (list2Or.children ?? []) as ReqNode[];

  const takenL1 = l1Kids.some(k => k.code && plan.has(norm(k.code)));

  const seen = new Set<string>();
  const merged: ReqNode[] = [];
  for (const k of l1Kids) {
    if (k.type !== 'COURSE' || !k.code) continue;
    const c = norm(k.code);
    if (plan.has(c)) continue;
    if (!seen.has(c)) {
      seen.add(c);
      merged.push(k);
    }
  }
  for (const k of l2Kids) {
    if (k.type !== 'COURSE' || !k.code) continue;
    const c = norm(k.code);
    if (!seen.has(c)) {
      seen.add(c);
      merged.push(k);
    }
  }
  list2Or.children = merged.length > 0 ? merged : [...l2Kids];
  list2Or.text = takenL1
    ? 'Complete 1 of the following (List 2 — other List 1 options and List 2 courses)'
    : 'Complete 1 of the following (List 2 — List 1 and List 2 options)';
  return clone;
}
