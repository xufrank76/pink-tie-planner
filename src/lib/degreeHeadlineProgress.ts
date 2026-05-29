import type { UserProgram } from '@/src/types/program';
import { nodeProgress, courseCodes, extractSubjectsFromText, type ReqNode } from '@/src/lib/requirementEvaluator';
import { patchCoreBmathRequirements } from '@/src/lib/coreBmathCommPatch';

const MATH_FACULTY_SUBJECTS = new Set([
  'ACTSC', 'AMATH', 'CO', 'CS', 'MATBUS', 'MATH', 'PMATH', 'STAT',
]);

const ZERO_CREDIT_COURSES = new Set(['MTHEL99']);

function topLevelRequirementNodes(entry: { requirements: ReqNode[] }): ReqNode[] {
  const roots = entry.requirements;
  return roots.length === 1 && roots[0].type === 'AND' && roots[0].children ? roots[0].children : roots;
}

export function isNonMathElective(code: string): boolean {
  if (code.startsWith('PD')) return false;
  if (ZERO_CREDIT_COURSES.has(code)) return false;
  const subject = code.match(/^([A-Z]+)/)?.[1] ?? '';
  return !MATH_FACULTY_SUBJECTS.has(subject);
}

/** Collect all OR node code-sets by recursing into AND/N_OF (not into OR children). */
function collectOrCodeSets(nodes: ReqNode[]): Set<string>[] {
  const result: Set<string>[] = [];
  for (const n of nodes) {
    if (n.type === 'OR') {
      const codes = courseCodes(n);
      if (codes.length > 0) result.push(new Set(codes));
    } else if (n.type === 'AND' || n.type === 'N_OF') {
      result.push(...collectOrCodeSets(n.children ?? []));
    }
  }
  return result;
}

/** Collect course codes that are mandatory (inside AND nodes, not inside OR). */
function collectMandatoryCodes(nodes: ReqNode[]): Set<string> {
  const codes = new Set<string>();
  for (const n of nodes) {
    if (n.type === 'COURSE' && n.code) codes.add(n.code);
    else if (n.type === 'AND') {
      for (const c of collectMandatoryCodes(n.children ?? [])) codes.add(c);
    }
  }
  return codes;
}

/**
 * Count core OR slots that are automatically satisfied by a major requirement:
 * (a) a major OR whose options are a subset of a core OR — same course satisfies both;
 * (b) a mandatory course in the major that is also an option in a core OR.
 * Returns {deltaTotal, deltaDone} to subtract from the core row.
 */
function coreGroupRedundancy(
  coreOrSets: Set<string>[],
  majorNodes: ReqNode[],
  plannedOrCompleted: Set<string>,
): { deltaTotal: number; deltaDone: number } {
  const majorOrSets = collectOrCodeSets(majorNodes);
  const majorMandatory = collectMandatoryCodes(majorNodes);
  let deltaTotal = 0;
  let deltaDone = 0;
  const counted = new Set<number>();
  for (let i = 0; i < coreOrSets.length; i++) {
    const coreSet = coreOrSets[i];
    for (const mSet of majorOrSets) {
      if (mSet.size > 0 && mSet.size <= coreSet.size && [...mSet].every(c => coreSet.has(c))) {
        counted.add(i); break;
      }
    }
    if (!counted.has(i)) {
      for (const code of majorMandatory) {
        if (coreSet.has(code)) { counted.add(i); break; }
      }
    }
    if (counted.has(i)) {
      deltaTotal++;
      if ([...coreSet].some(c => plannedOrCompleted.has(c))) deltaDone++;
    }
  }
  return { deltaTotal, deltaDone };
}

function majorNonMathRedundancy(
  majorNodes: ReqNode[],
  plannedOrCompleted: Set<string>,
): { deltaTotal: number; deltaDone: number } {
  const mandatory = collectMandatoryCodes(majorNodes);
  const nonMathMandatory = [...mandatory].filter(isNonMathElective);

  // Also count OR slots where every option is non-math (e.g. BIOL239/HLTH101).
  let orSlots = 0;
  let orDone = 0;
  function countNonMathOrSlots(nodes: ReqNode[]) {
    for (const n of nodes) {
      if (n.type === 'OR') {
        const opts = courseCodes(n);
        if (opts.length > 0 && opts.every(isNonMathElective)) {
          orSlots++;
          if (opts.some(c => plannedOrCompleted.has(c))) orDone++;
        }
      } else if (n.type === 'AND' || n.type === 'N_OF') {
        countNonMathOrSlots(n.children ?? []);
      }
    }
  }
  countNonMathOrSlots(majorNodes);

  const deltaTotal = Math.min(nonMathMandatory.length + orSlots, 10);
  const deltaDone = Math.min(nonMathMandatory.filter(c => plannedOrCompleted.has(c)).length + orDone, 10);
  return { deltaTotal, deltaDone };
}

/**
 * Count slots in `secondaryNodes` already covered by `primaryNodes`.
 * Handles COURSE (mandatory↔mandatory), OR (any option in primary), and
 * N_OF (primary covers k of n options → deduct min(n, k) slots).
 *
 * Pass `coreOrSets` to skip OR slots already deducted by coreGroupRedundancy,
 * and non-Math COURSE slots already deducted by NonMathRedundancy — both prevent
 * triple-counting when a course satisfies three rows at once.
 */
function minorMajorRedundancy(
  primaryNodes: ReqNode[],
  secondaryNodes: ReqNode[],
  plannedOrCompleted: Set<string>,
  coreOrSets: Set<string>[] = [],
): { deltaTotal: number; deltaDone: number } {
  const primaryMandatory = collectMandatoryCodes(primaryNodes);
  const primaryOrSets = collectOrCodeSets(primaryNodes);

  function claimedByPrimary(code: string): boolean {
    if (primaryMandatory.has(code)) return true;
    return primaryOrSets.some(s => s.has(code));
  }

  /** True if this OR slot's codes are already a subset of a core OR set — meaning
   * coreGroupRedundancy already deducted it for this program. */
  function coreAlreadyHandles(options: string[]): boolean {
    const s = new Set(options);
    return coreOrSets.some(cs => s.size > 0 && s.size <= cs.size && [...s].every(c => cs.has(c)));
  }

  let deltaTotal = 0;
  let deltaDone = 0;

  function walk(node: ReqNode) {
    if (node.type === 'COURSE' && node.code) {
      // Non-math courses are handled by NonMathRedundancy — skip to avoid triple-count
      if (isNonMathElective(node.code)) return;
      if (claimedByPrimary(node.code)) {
        deltaTotal++;
        if (plannedOrCompleted.has(node.code)) deltaDone++;
      }
      return;
    }
    if (node.type === 'OR') {
      const options = courseCodes(node);
      // Core-covered OR slots are handled by coreGroupRedundancy — skip
      if (coreAlreadyHandles(options)) return;
      // All-non-math ORs are handled by majorNonMathRedundancy / minorNonMathRedundancy — skip
      if (options.length > 0 && options.every(isNonMathElective)) return;
      // Only deduct if a primary MANDATORY course appears as an option in this secondary OR.
      // Using primaryOrSets here would cause OR→OR false deductions: a primary OR claims
      // only one course, so it can't guarantee multiple secondary OR slots are covered.
      if (options.length > 0 && options.some(c => primaryMandatory.has(c))) {
        deltaTotal++;
        if (options.some(c => plannedOrCompleted.has(c))) deltaDone++;
      }
      return;
    }
    if (node.type === 'N_OF' && node.n != null) {
      const options = courseCodes(node);
      // Exclude non-math and core-OR options from coverage count
      const coveredOptions = options.filter(c => !isNonMathElective(c) && claimedByPrimary(c));
      const covered = Math.min(node.n, coveredOptions.length);
      deltaTotal += covered;
      deltaDone += Math.min(covered, coveredOptions.filter(c => plannedOrCompleted.has(c)).length);
      return;
    }
    for (const child of node.children ?? []) walk(child);
  }

  for (const node of secondaryNodes) walk(node);
  return { deltaTotal, deltaDone };
}

/**
 * Count minor requirement slots that are non-Math and therefore already captured
 * by the Non-Math Electives row — those slots are double-counted in the headline.
 * Handles both specific COURSE nodes and subject-restricted ADDITIONAL nodes.
 */
function minorNonMathRedundancy(
  minorNodes: ReqNode[],
  plannedOrCompleted: Set<string>,
): { deltaTotal: number; deltaDone: number } {
  const nonMathPlanned = new Set([...plannedOrCompleted].filter(isNonMathElective));
  let deltaTotal = 0;
  let deltaDone = 0;

  function walk(node: ReqNode) {
    if (node.type === 'COURSE' && node.code) {
      if (isNonMathElective(node.code)) {
        deltaTotal++;
        if (plannedOrCompleted.has(node.code)) deltaDone++;
      }
      return;
    }
    if (node.type === 'OR') {
      // Count as 1 slot only if ALL options are non-math (avoids double-counting each child).
      const opts = courseCodes(node);
      if (opts.length > 0 && opts.every(isNonMathElective)) {
        deltaTotal++;
        if (opts.some(c => plannedOrCompleted.has(c))) deltaDone++;
      }
      return;
    }
    if (node.type === 'ADDITIONAL') {
      const subjects = extractSubjectsFromText(node.text ?? '');
      // Only deduct slots whose subjects are exclusively non-Math.
      if (subjects.size > 0 && [...subjects].every(s => !MATH_FACULTY_SUBJECTS.has(s))) {
        const p = nodeProgress(node, plannedOrCompleted);
        deltaTotal += p.total;
        deltaDone += nodeProgress(node, nonMathPlanned).done;
      }
      return;
    }
    for (const child of node.children ?? []) walk(child);
  }

  for (const node of minorNodes) walk(node);
  return { deltaTotal: Math.min(deltaTotal, 10), deltaDone: Math.min(deltaDone, 10) };
}

export type DegreeProgressRow = { name: string; current: number; max: number; tooltip?: { num: string; den: string } };

export type DegreeHeadlineOptions = {
  /** If set, requirement progress (core, majors, electives, PD row) uses this set instead of completed ∪ all planned terms. */
  plannedOrCompletedOverride?: ReadonlySet<string>;
};

/**
 * Same degree headline as the Dashboard “DEGREE PLANNED” fraction (numerator/denominator
 * and bar rows). PD coop row is included only in `progressRows`, not in the headline sum.
 */
export function computeDegreeHeadlineMetrics(
  programs: Record<string, { name: string; requirements: ReqNode[]; minCourses?: number; isSpecialization?: boolean }>,
  program: UserProgram,
  completedCourses: string[],
  semesterPlans: Record<string, string[]>,
  options?: DegreeHeadlineOptions,
): {
  progressRows: DegreeProgressRow[];
  degreePlannedSum: number;
  degreeTotalSlots: number;
  degreePct: number;
  hasDegreeMetric: boolean;
} {
  const coursesPlanned = options?.plannedOrCompletedOverride != null
    ? [...options.plannedOrCompletedOverride]
    : [
        ...completedCourses,
        ...Object.values(semesterPlans).flat(),
      ];
  const plannedOrCompleted = new Set(coursesPlanned);

  function sumProgress(nodes: ReqNode[]) {
    let done = 0;
    let total = 0;
    for (const n of nodes) {
      const p = nodeProgress(n, plannedOrCompleted);
      done += p.done;
      total += p.total;
    }
    return { done, total: total || 1 };
  }

  const progEntry = program.id ? programs[program.id] : null;
  const isMathStudies = progEntry?.name.includes('Mathematical Studies') ?? false;
  const coreId = isMathStudies ? 'core-bmath-mathstudies' : 'core-bmath';
  const coreEntry = programs[coreId];
  const coreReqPatched = patchCoreBmathRequirements(coreEntry?.requirements ?? [], program);
  const allCoreNodes: ReqNode[] = coreReqPatched[0]?.children ?? [];
  // Exclude the comm requirement group — comm courses are already counted in non-math electives.
  const coreNodes = allCoreNodes.filter(n => !/communication/i.test(n.text ?? ''));
  const { done: coreDoneRaw, total: coreTotalRaw } = sumProgress(coreNodes);
  const coreOrSets = collectOrCodeSets(coreNodes);

  function entryProgress(id: string) {
    const entry = programs[id];
    if (!entry) return null;
    return sumProgress(topLevelRequirementNodes(entry));
  }

  const majorCandidates = [
    ...(program.id ? [{ id: program.id, name: program.major }] : []),
    ...(program.doubleMajorId ? [{ id: program.doubleMajorId, name: program.doubleMajor! }] : []),
    ...program.extras.filter(e => e.type === 'major' || e.type === 'joint').map(e => ({ id: e.id, name: e.name })),
  ];
  const multiMajor = majorCandidates.length > 1;

  let overlapDeltaTotal = 0;
  let overlapDeltaDone = 0;
  const processedMajorNodesList: ReqNode[][] = [];
  const majorRows: DegreeProgressRow[] = [];
  for (const { id, name } of majorCandidates) {
    const p = entryProgress(id);
    if (!p) continue;
    const entry = programs[id];
    const majorNodes = entry ? topLevelRequirementNodes(entry) : [];
    const core = entry ? coreGroupRedundancy(coreOrSets, majorNodes, plannedOrCompleted) : { deltaTotal: 0, deltaDone: 0 };
    const nonMath = entry ? majorNonMathRedundancy(majorNodes, plannedOrCompleted) : { deltaTotal: 0, deltaDone: 0 };
    overlapDeltaTotal += core.deltaTotal + nonMath.deltaTotal;
    overlapDeltaDone += core.deltaDone + nonMath.deltaDone;
    // Double-major inter-overlap: deduct slots of this major already covered by any prior major.
    // Skip non-math courses (handled by nonMath above) and core-covered OR slots (handled by core above).
    if (processedMajorNodesList.length > 0) {
      const priorNodes = processedMajorNodesList.flat();
      const interMajor = minorMajorRedundancy(priorNodes, majorNodes, plannedOrCompleted, coreOrSets);
      overlapDeltaTotal += interMajor.deltaTotal;
      overlapDeltaDone += interMajor.deltaDone;
    }
    processedMajorNodesList.push(majorNodes);
    majorRows.push({
      name: multiMajor ? name : 'Major',
      current: p.done,
      max: p.total,
      tooltip: {
        num: 'major requirement slots filled by planned courses',
        den: `${p.total} required slots`,
      },
    });
  }

  const minorEntry = program.minorId ? programs[program.minorId] : null;
  const minorProgress = minorEntry ? entryProgress(program.minorId!) : null;
  const minorFloor = minorEntry?.minCourses ?? 8;

  if (minorEntry) {
    const minorNodes = topLevelRequirementNodes(minorEntry);
    const allMajorNodes = majorCandidates.flatMap(({ id }) => {
      const e = programs[id];
      return e ? topLevelRequirementNodes(e) : [];
    });
    const minorCore = coreGroupRedundancy(coreOrSets, minorNodes, plannedOrCompleted);
    const minorMajor = minorMajorRedundancy(allMajorNodes, minorNodes, plannedOrCompleted, coreOrSets);
    const minorNonMath = minorNonMathRedundancy(minorNodes, plannedOrCompleted);
    overlapDeltaTotal += minorCore.deltaTotal + minorMajor.deltaTotal + minorNonMath.deltaTotal;
    overlapDeltaDone += minorCore.deltaDone + minorMajor.deltaDone + minorNonMath.deltaDone;
  }

  const allMajorAndMinorNodes = [
    ...majorCandidates.flatMap(({ id }) => { const e = programs[id]; return e ? topLevelRequirementNodes(e) : []; }),
    ...(minorEntry ? topLevelRequirementNodes(minorEntry) : []),
  ];

  const specRows = program.extras
    .filter(e => e.type === 'specialization')
    .map(e => {
      const p = entryProgress(e.id);
      if (!p) return null;
      const specEntry = programs[e.id];
      // Apply minCourses as floor only for standalone specializations (minCourses < 20).
      // BMath-component specializations have minCourses = full degree (26+) which would inflate.
      const specMin = (specEntry?.minCourses ?? 0) < 20 ? (specEntry?.minCourses ?? 0) : 0;
      const specNodes = specEntry ? topLevelRequirementNodes(specEntry) : [];
      // Deduct spec slots that overlap with core, major/minor, or non-math electives.
      const specCore = coreGroupRedundancy(coreOrSets, specNodes, plannedOrCompleted);
      const specMajorMinor = minorMajorRedundancy(allMajorAndMinorNodes, specNodes, plannedOrCompleted, coreOrSets);
      const specNonMath = minorNonMathRedundancy(specNodes, plannedOrCompleted);
      overlapDeltaTotal += specCore.deltaTotal + specMajorMinor.deltaTotal + specNonMath.deltaTotal;
      overlapDeltaDone += specCore.deltaDone + specMajorMinor.deltaDone + specNonMath.deltaDone;
      return { name: e.name, current: p.done, max: specMin > 0 ? Math.max(p.total, specMin) : p.total };
    })
    .filter((r): r is DegreeProgressRow => r !== null);

  const pdDone = [...plannedOrCompleted].filter(c => /^PD\d/i.test(c)).length;
  const isCoop = program.coopStream !== null && program.coopStream !== 'none';

  const nonMathElectiveCount = [...plannedOrCompleted].filter(isNonMathElective).length;

  const degreeRows: DegreeProgressRow[] = [
    ...(progEntry ? [{
      name: 'Core BMath', current: coreDoneRaw, max: coreTotalRaw,
      tooltip: { num: 'core math/CS requirement slots filled by planned courses', den: `${coreTotalRaw} core BMath slots required` },
    }] : []),
    ...majorRows,
    ...(minorProgress ? [{
      name: 'Minor',
      current: minorProgress.done,
      max: Math.max(minorProgress.total, minorFloor),
      tooltip: { num: 'minor requirement slots filled by planned courses', den: `${Math.max(minorProgress.total, minorFloor)} slots required by the minor` },
    }] : []),
    ...specRows,
    {
      name: 'Non-Math Electives', current: Math.min(nonMathElectiveCount, 10), max: 10,
      tooltip: { num: 'non-Math Faculty courses planned across all terms (incl. comm)', den: '10 required (incl. 2 comm)' },
    },
  ];
  const degreeTotalSlots = degreeRows.reduce((s, r) => s + r.max, 0) - overlapDeltaTotal;
  const degreePlannedSum = degreeRows.reduce((s, r) => s + r.current, 0) - overlapDeltaDone;
  const degreePct =
    degreeTotalSlots > 0 ? Math.min(100, Math.round((degreePlannedSum / degreeTotalSlots) * 100)) : 0;

  const progressRows: DegreeProgressRow[] = [
    ...degreeRows,
    ...(isCoop ? [{ name: 'PD courses', current: Math.min(pdDone, 5), max: 5, tooltip: { num: 'PD courses planned across all terms', den: '5 required for co-op' } }] : []),
  ];

  return {
    progressRows,
    degreePlannedSum,
    degreeTotalSlots,
    degreePct,
    hasDegreeMetric: degreeTotalSlots > 0,
  };
}
