import type { UserProgram } from '@/src/types/program';
import { nodeProgress, courseCodes, requiredCourseCodes, extractSubjectsFromText, extractAdditionalN, type ReqNode } from '@/src/lib/requirementEvaluator';
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
  if (code.startsWith('COOP')) return false;
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

/** Collect N_OF option sets (pick-n pools) by recursing into AND (not OR/N_OF children). */
function collectNofCodeSets(nodes: ReqNode[]): Set<string>[] {
  const result: Set<string>[] = [];
  for (const n of nodes) {
    if (n.type === 'N_OF') {
      const codes = courseCodes(n);
      if (codes.length > 0) result.push(new Set(codes));
    } else if (n.type === 'AND') {
      result.push(...collectNofCodeSets(n.children ?? []));
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
export function coreGroupRedundancy(
  coreOrSets: Set<string>[],
  majorNodes: ReqNode[],
  plannedOrCompleted: Set<string>,
): { deltaTotal: number; deltaDone: number } {
  const majorOrSets = collectOrCodeSets(majorNodes);
  const majorNofSets = collectNofCodeSets(majorNodes);
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
      // A major pick-n pool overlapping this core choice ("2 of CS115/CS135/…" vs the
      // core intro-CS slot): the same course can fill both.
      for (const mSet of majorNofSets) {
        if ([...coreSet].some(c => mSet.has(c))) { counted.add(i); break; }
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

export function majorNonMathRedundancy(
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
export function minorMajorRedundancy(
  primaryNodes: ReqNode[],
  secondaryNodes: ReqNode[],
  plannedOrCompleted: Set<string>,
  coreOrSets: Set<string>[] = [],
): { deltaTotal: number; deltaDone: number } {
  const primaryMandatory = collectMandatoryCodes(primaryNodes);
  const primaryOrSets = collectOrCodeSets(primaryNodes);
  // Choice sets for OR↔OR pairing: ORs plus N_OF pools (each usable once).
  const primaryChoiceSets = [...primaryOrSets, ...collectNofCodeSets(primaryNodes)];
  const usedPrimaryChoiceSets = new Set<number>();

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
      // Deduct if a primary MANDATORY course appears as an option in this secondary OR.
      if (options.length > 0 && options.some(c => primaryMandatory.has(c))) {
        deltaTotal++;
        if (options.some(c => plannedOrCompleted.has(c))) deltaDone++;
        return;
      }
      // OR↔OR overlap ("1 of AMATH250/251" in both majors): one course satisfies both
      // slots. Pair each secondary OR with at most one unused primary choice set so a
      // single primary OR can't be claimed by several secondary ORs.
      const optSet = new Set(options);
      for (let i = 0; i < primaryChoiceSets.length; i++) {
        if (usedPrimaryChoiceSets.has(i)) continue;
        const ps = primaryChoiceSets[i];
        const overlap = [...optSet].filter(c => !isNonMathElective(c) && ps.has(c));
        if (overlap.length === 0) continue;
        usedPrimaryChoiceSets.add(i);
        deltaTotal++;
        if (overlap.some(c => plannedOrCompleted.has(c))) deltaDone++;
        return;
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
export function minorNonMathRedundancy(
  minorNodes: ReqNode[],
  plannedOrCompleted: Set<string>,
  sharedElsewhere: (code: string) => boolean = () => false,
): { deltaTotal: number; deltaDone: number } {
  const nonMathPlanned = new Set([...plannedOrCompleted].filter(isNonMathElective));
  let deltaTotal = 0;
  let deltaDone = 0;

  /**
   * Allocation-aware overlap for a pick-n group with mixed options.
   * - A slot filled with a non-math course shares with the Non-Math Electives row.
   * - A slot filled with a Math course another row credits (core pools, a major's
   *   additional-courses pool — `sharedElsewhere` mirrors row crediting exactly)
   *   shares with that row instead — either way the slot is deducted.
   * - A slot filled with a Math course nothing else credits shares with nothing —
   *   no deduction, and the denominator grows to the real cost of that choice.
   * - Unfilled slots keep the optimistic assumption while a non-math option remains.
   *
   * Slots follow the group's children (a child OR like Cog Sci List 1's computation
   * choice is ONE slot no matter how many of its options are planned); a flat
   * all-course group falls back to counting options directly.
   */
  function pickN(n: number, group: ReqNode) {
    const children = group.children ?? [];
    let filledNonMath = 0;
    let filledShared = 0;
    let filledUnshared = 0;
    let assumable = 0;

    if (children.length > 0 && children.some(c => c.type !== 'COURSE')) {
      // One slot per child group.
      for (const child of children) {
        const opts = courseCodes(child);
        const chosen = opts.filter(c => plannedOrCompleted.has(c));
        if (chosen.length > 0) {
          if (chosen.some(isNonMathElective)) filledNonMath++;
          else if (chosen.some(sharedElsewhere)) filledShared++;
          else filledUnshared++;
        } else if (opts.some(isNonMathElective)) {
          assumable++;
        }
      }
    } else {
      // Flat pick-n from courses: each chosen course occupies its own slot.
      const opts = courseCodes(group);
      for (const c of opts.filter(o => plannedOrCompleted.has(o))) {
        if (isNonMathElective(c)) filledNonMath++;
        else if (sharedElsewhere(c)) filledShared++;
        else filledUnshared++;
      }
      assumable = opts.filter(c => isNonMathElective(c) && !plannedOrCompleted.has(c)).length;
    }

    filledNonMath = Math.min(filledNonMath, n);
    filledShared = Math.min(filledShared, n - filledNonMath);
    filledUnshared = Math.min(filledUnshared, n - filledNonMath - filledShared);
    const unfilled = n - filledNonMath - filledShared - filledUnshared;
    const assumed = Math.min(unfilled, assumable);
    deltaTotal += filledNonMath + filledShared + assumed;
    deltaDone += filledNonMath + filledShared;
  }

  function walk(node: ReqNode) {
    if (node.type === 'COURSE' && node.code) {
      if (isNonMathElective(node.code)) {
        deltaTotal++;
        if (plannedOrCompleted.has(node.code)) deltaDone++;
      }
      return;
    }
    if (node.type === 'OR') {
      const orChildren = node.children ?? [];
      // Pick-a-cluster OR (all branches N_OF) counts the chosen cluster's slots in the
      // minor row (see nodeProgress) — deduct against the same cluster.
      if (orChildren.length > 0 && orChildren.every(c => c.type === 'N_OF')) {
        let active = orChildren[0];
        let bestDone = 0;
        for (const c of orChildren) {
          const p = nodeProgress(c, plannedOrCompleted);
          if (p.done > bestDone) { bestDone = p.done; active = c; }
        }
        if (bestDone > 0) pickN(active.n ?? 1, active);
        else pickN(Math.min(...orChildren.map(c => c.n ?? 1)), node);
        return;
      }
      const opts = courseCodes(node);
      // All options non-math: the slot always overlaps an elective.
      if (opts.length > 0 && opts.every(isNonMathElective)) {
        deltaTotal++;
        if (opts.some(c => plannedOrCompleted.has(c))) deltaDone++;
        return;
      }
      // Mixed options (all-math ORs are coreGroupRedundancy's job): overlap only once the
      // slot is actually filled — by a non-math course, or by a math course another row credits.
      if (opts.some(isNonMathElective)) {
        const chosen = opts.filter(c => plannedOrCompleted.has(c));
        if (chosen.some(isNonMathElective) || chosen.some(c => !isNonMathElective(c) && sharedElsewhere(c))) {
          deltaTotal++;
          deltaDone++;
        }
      }
      return;
    }
    if (node.type === 'ADDITIONAL') {
      // Pool-wired pointer rows count like a flat pick-n over the referenced lists.
      if (node.pool?.length) {
        const n = node.n ?? extractAdditionalN(node.text ?? '');
        if (n != null) pickN(n, { type: 'N_OF', text: '', children: node.pool.map(code => ({ type: 'COURSE' as const, text: '', code })) });
        return;
      }
      const subjects = extractSubjectsFromText(node.text ?? '');
      // Only deduct slots whose subjects are exclusively non-Math.
      if (subjects.size > 0 && [...subjects].every(s => !MATH_FACULTY_SUBJECTS.has(s))) {
        const p = nodeProgress(node, plannedOrCompleted);
        deltaTotal += p.total;
        deltaDone += nodeProgress(node, nonMathPlanned).done;
      }
      return;
    }
    if (node.type === 'N_OF' && node.n != null) {
      // A pick-n group occupies only n slots — deduct at most n, allocation-aware.
      pickN(node.n, node);
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

  // Sum progress over nodes. For ADDITIONAL nodes, exclude courses already required by
  // non-ADDITIONAL sibling nodes in the same list (plus any caller-supplied extras), so that
  // core/required courses don't double-count into elective slots.
  function sumProgress(nodes: ReqNode[], additionalExclude: ReadonlySet<string> = new Set()): { done: number; total: number } {
    // Pool codes ("Choose any…" lists) are skipped at any depth — they are options for
    // pointer ADDITIONALs, not requirements.
    const ownRequired = new Set<string>(nodes.filter(n => n.type !== 'ADDITIONAL').flatMap(n => requiredCourseCodes(n)));
    const exclude = additionalExclude.size > 0 ? new Set([...ownRequired, ...additionalExclude]) : ownRequired;
    let done = 0;
    let total = 0;
    for (const n of nodes) {
      // The exclusion travels through nodeProgress so ADDITIONAL rows at any depth
      // (not just top level) never re-count required/core courses.
      const p = nodeProgress(n, plannedOrCompleted, exclude);
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
  // All course codes mentioned in core BMath — used to prevent core courses from inflating
  // ADDITIONAL elective slots in non-core programs (majors, minors, specializations).
  const coreAllCodes = new Set<string>(coreNodes.flatMap(n => courseCodes(n)));
  const { done: coreDoneRaw, total: coreTotalRaw } = sumProgress(coreNodes);
  const coreOrSets = collectOrCodeSets(coreNodes);

  function entryProgress(id: string, extraExclude: ReadonlySet<string> = new Set()) {
    const entry = programs[id];
    if (!entry) return null;
    return sumProgress(topLevelRequirementNodes(entry), extraExclude);
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
    const p = entryProgress(id, coreAllCodes);
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

  // A math course "shares elsewhere" when another row would credit it: it's in a core
  // pool, or it fits one of the majors' additional-courses pools (checked with the same
  // nodeProgress matching the Major row uses, so dedup and crediting always agree).
  const majorAdditionalNodes: ReqNode[] = [];
  {
    const collect = (n: ReqNode) => {
      if (n.type === 'ADDITIONAL') majorAdditionalNodes.push(n);
      (n.children ?? []).forEach(collect);
    };
    for (const { id } of majorCandidates) {
      const e = programs[id];
      if (e) topLevelRequirementNodes(e).forEach(collect);
    }
  }
  const sharedCache = new Map<string, boolean>();
  const sharedElsewhere = (code: string): boolean => {
    let v = sharedCache.get(code);
    if (v === undefined) {
      v = coreAllCodes.has(code)
        || majorAdditionalNodes.some(a => nodeProgress(a, new Set([code])).done > 0);
      sharedCache.set(code, v);
    }
    return v;
  };

  const minorEntry = program.minorId ? programs[program.minorId] : null;
  const minorProgress = minorEntry ? entryProgress(program.minorId!, coreAllCodes) : null;
  const minorFloor = minorEntry?.minCourses ?? 8;

  if (minorEntry) {
    const minorNodes = topLevelRequirementNodes(minorEntry);
    const allMajorNodes = majorCandidates.flatMap(({ id }) => {
      const e = programs[id];
      return e ? topLevelRequirementNodes(e) : [];
    });
    const minorCore = coreGroupRedundancy(coreOrSets, minorNodes, plannedOrCompleted);
    const minorMajor = minorMajorRedundancy(allMajorNodes, minorNodes, plannedOrCompleted, coreOrSets);
    const minorNonMath = minorNonMathRedundancy(minorNodes, plannedOrCompleted, sharedElsewhere);
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
      const p = entryProgress(e.id, coreAllCodes);
      if (!p) return null;
      const specEntry = programs[e.id];
      // Apply minCourses as floor only for standalone specializations (minCourses < 20).
      // BMath-component specializations have minCourses = full degree (26+) which would inflate.
      const specMin = (specEntry?.minCourses ?? 0) < 20 ? (specEntry?.minCourses ?? 0) : 0;
      const specNodes = specEntry ? topLevelRequirementNodes(specEntry) : [];
      // Deduct spec slots that overlap with core, major/minor, or non-math electives.
      const specCore = coreGroupRedundancy(coreOrSets, specNodes, plannedOrCompleted);
      const specMajorMinor = minorMajorRedundancy(allMajorAndMinorNodes, specNodes, plannedOrCompleted, coreOrSets);
      const specNonMath = minorNonMathRedundancy(specNodes, plannedOrCompleted, sharedElsewhere);
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
