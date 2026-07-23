/**
 * Which Faculty of Mathematics credential a plan belongs to, and the degree-level
 * rules that differ between them. The headline (degreeHeadlineProgress.ts) and the
 * plan renderer (DegreePlan.tsx) both key off this instead of hardcoding BMath.
 *
 * The credential is read from the primary major's catalog name:
 *   "... (Bachelor of Computer Science - Honours)"  → bcs
 *   "... (Bachelor of Mathematics - Honours)"        → bmath (default)
 */

export type Credential = 'bmath' | 'bcs';

type NamedProgram = { name: string };
type ProgramRef = { id: string | null };

function primaryName(program: ProgramRef, programs: Record<string, NamedProgram>): string {
  return program.id ? programs[program.id]?.name ?? '' : '';
}

export function getCredential(program: ProgramRef, programs: Record<string, NamedProgram>): Credential {
  return primaryName(program, programs).includes('Bachelor of Computer Science') ? 'bcs' : 'bmath';
}

/** Synthetic core entry id for the plan's credential (see core-bmath / core-bcs in requirements JSON). */
export function resolveCoreId(program: ProgramRef, programs: Record<string, NamedProgram>): string {
  if (getCredential(program, programs) === 'bcs') return 'core-bcs';
  return primaryName(program, programs).includes('Mathematical Studies')
    ? 'core-bmath-mathstudies'
    : 'core-bmath';
}

export interface DegreeConfig {
  credential: Credential;
  /** Keep the communication group inside the core row (BCS) instead of counting it in the
   *  elective row (BMath, where the 10 non-math electives already include the 2 comm courses). */
  commInCore: boolean;
  /** Whether component (major/minor/spec) slots that are non-math should be deducted as
   *  overlapping the elective row. Only meaningful for BMath's fixed non-math elective row;
   *  BCS's free-elective row is the leftover balance, so it never double-counts. */
  dedupNonMath: boolean;
  /** Elective row model. BMath: a fixed 10-slot non-math bucket. BCS: free electives that
   *  balance the plan up to the degree's total course floor. */
  elective:
    | { mode: 'non-math-fixed'; name: string; slots: number }
    | { mode: 'free-to-floor'; name: string; floor: number };
}

// BCS Honours: 20.0 units = 40 half-credit courses. (Double-degree/joint variants differ;
// refine when those credentials land.)
const BCS_DEGREE_FLOOR = 40;

export function getDegreeConfig(credential: Credential): DegreeConfig {
  if (credential === 'bcs') {
    return {
      credential,
      commInCore: true,
      dedupNonMath: false,
      elective: { mode: 'free-to-floor', name: 'Free Electives', floor: BCS_DEGREE_FLOOR },
    };
  }
  return {
    credential,
    commInCore: false,
    dedupNonMath: true,
    elective: { mode: 'non-math-fixed', name: 'Non-Math Electives', slots: 10 },
  };
}
