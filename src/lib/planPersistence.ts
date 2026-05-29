import type { ExtraCredential, UserProgram } from '@/src/types/program';

export const PLAN_STORAGE_KEY = 'pink-tie-planner-plan';

export const PLAN_FORMAT_VERSION = 1 as const;

export type PersistedPlan = {
  v: typeof PLAN_FORMAT_VERSION;
  setupComplete: boolean;
  program: UserProgram;
  completedCourses: string[];
  semesterPlans: Record<string, string[]>;
  favoriteCourses: string[];
  favoritePrograms: string[];
  /** Last calendar term on the plan timeline; null = use co-op / 12-term default. */
  planEndTerm: string | null;
};

const EXTRA_TYPES = new Set(['major', 'minor', 'joint', 'specialization']);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function parseExtras(x: unknown): ExtraCredential[] {
  if (!Array.isArray(x)) return [];
  const out: ExtraCredential[] = [];
  for (const e of x) {
    if (!isRecord(e)) continue;
    const type = e.type;
    const id = e.id;
    const name = e.name;
    if (typeof type !== 'string' || !EXTRA_TYPES.has(type)) continue;
    if (typeof id !== 'string' || typeof name !== 'string') continue;
    out.push({ type: type as ExtraCredential['type'], id, name });
  }
  return out;
}

function parseCoop(x: unknown): UserProgram['coopStream'] {
  if (x === null || x === undefined) return null;
  if (x === '1' || x === '2' || x === '3' || x === '4' || x === 'none') return x;
  return null;
}

function parseProgram(x: unknown): UserProgram | null {
  if (!isRecord(x)) return null;
  const id = x.id;
  const major = x.major;
  if (typeof id !== 'string' || typeof major !== 'string') return null;
  return {
    id,
    major,
    doubleMajor: typeof x.doubleMajor === 'string' || x.doubleMajor === null ? (x.doubleMajor as string | null) : null,
    doubleMajorId: typeof x.doubleMajorId === 'string' || x.doubleMajorId === null ? (x.doubleMajorId as string | null) : null,
    minor: typeof x.minor === 'string' || x.minor === null ? (x.minor as string | null) : null,
    minorId: typeof x.minorId === 'string' || x.minorId === null ? (x.minorId as string | null) : null,
    extras: parseExtras(x.extras),
    coopStream: parseCoop(x.coopStream),
    startTerm: typeof x.startTerm === 'string' || x.startTerm === null ? (x.startTerm as string | null) : null,
  };
}

function parsePlanEndTerm(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  if (typeof x !== 'string' || !/^[WFS]\d{2}$/.test(x)) return null;
  return x;
}

function parseStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((c): c is string => typeof c === 'string');
}

function parseSemesterPlans(x: unknown): Record<string, string[]> {
  if (!isRecord(x)) return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(x)) {
    if (!/^[WFS]\d{2}$/.test(k)) continue;
    out[k] = parseStringArray(v);
  }
  return out;
}

/** Parse a JSON object as a persisted plan. Used for main storage and plan-catalog entries. */
export function parsePersistedPlanRecord(parsed: unknown): PersistedPlan | null {
  if (!isRecord(parsed)) return null;
  if (parsed.v !== PLAN_FORMAT_VERSION) return null;
  const program = parseProgram(parsed.program);
  if (!program) return null;
  return {
    v: PLAN_FORMAT_VERSION,
    setupComplete: parsed.setupComplete === true,
    program,
    completedCourses: parseStringArray(parsed.completedCourses),
    semesterPlans: parseSemesterPlans(parsed.semesterPlans),
    favoriteCourses: parseStringArray(parsed.favoriteCourses),
    favoritePrograms: parseStringArray(parsed.favoritePrograms),
    planEndTerm: parsePlanEndTerm(parsed.planEndTerm),
  };
}

/** Returns null if missing, invalid, or unreadable. */
export function loadPersistedPlan(): PersistedPlan | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return null;
    return parsePersistedPlanRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function savePersistedPlan(snapshot: Omit<PersistedPlan, 'v'> & { v?: typeof PLAN_FORMAT_VERSION }): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedPlan = {
      v: PLAN_FORMAT_VERSION,
      setupComplete: snapshot.setupComplete,
      program: snapshot.program,
      completedCourses: snapshot.completedCourses,
      semesterPlans: snapshot.semesterPlans,
      favoriteCourses: snapshot.favoriteCourses,
      favoritePrograms: snapshot.favoritePrograms,
      planEndTerm: snapshot.planEndTerm ?? null,
    };
    window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode — ignore
  }
}

// ── Folders storage ──────────────────────────────────────────────────────────

export type FavFolder = {
  id: string;
  name: string;
  courses: string[];
  programs: string[];
  createdAt: number;
  locked?: boolean;
};

export const DEFAULT_COURSES_FOLDER_ID = 'default-courses';
export const DEFAULT_PLANS_FOLDER_ID = 'default-plans';

const FOLDERS_KEY = 'ptp-folders-v1';

function parseFolders(raw: unknown): FavFolder[] {
  if (!Array.isArray(raw)) return [];
  const out: FavFolder[] = [];
  for (const f of raw) {
    if (!isRecord(f)) continue;
    if (typeof f.id !== 'string' || typeof f.name !== 'string' || typeof f.createdAt !== 'number') continue;
    out.push({
      id: f.id,
      name: f.name,
      courses: parseStringArray(f.courses),
      programs: parseStringArray(f.programs),
      createdAt: f.createdAt,
      locked: f.locked === true,
    });
  }
  return out;
}

export function loadFolders(migrateCourseFavs: string[] = [], migrateProgramFavs: string[] = []): FavFolder[] {
  if (typeof window === 'undefined') return makeDefaultFolders(migrateCourseFavs, migrateProgramFavs);
  try {
    const raw = window.localStorage.getItem(FOLDERS_KEY);
    if (!raw) return makeDefaultFolders(migrateCourseFavs, migrateProgramFavs);
    const folders = parseFolders(JSON.parse(raw));
    // Ensure locked defaults always exist
    const hasDefault = folders.some(f => f.id === DEFAULT_COURSES_FOLDER_ID);
    const hasPlans = folders.some(f => f.id === DEFAULT_PLANS_FOLDER_ID);
    if (!hasDefault) folders.unshift({ id: DEFAULT_COURSES_FOLDER_ID, name: 'favourite courses', courses: migrateCourseFavs, programs: [], createdAt: 0, locked: true });
    if (!hasPlans) {
      const idx = folders.findIndex(f => f.id === DEFAULT_COURSES_FOLDER_ID);
      folders.splice(idx + 1, 0, { id: DEFAULT_PLANS_FOLDER_ID, name: 'favourite plans', programs: migrateProgramFavs, courses: [], createdAt: 0, locked: true });
    }
    return folders;
  } catch { return makeDefaultFolders(migrateCourseFavs, migrateProgramFavs); }
}

function makeDefaultFolders(courses: string[], programs: string[]): FavFolder[] {
  return [
    { id: DEFAULT_COURSES_FOLDER_ID, name: 'favourite courses', courses, programs: [], createdAt: 0, locked: true },
    { id: DEFAULT_PLANS_FOLDER_ID, name: 'favourite plans', courses: [], programs, createdAt: 0, locked: true },
  ];
}

export function saveFolders(folders: FavFolder[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)); } catch {}
}

// ── Multi-plan storage ────────────────────────────────────────────────────────

export type SavedPlan = {
  id: string;
  name: string;
  semesterPlans: Record<string, string[]>;
  planEndTerm: string | null;
  programOverride: UserProgram | null;
  createdAt: number;
};

const SAVED_PLANS_KEY = 'ptp-saved-plans-v1';
const ACTIVE_PLAN_ID_KEY = 'ptp-active-plan-id';

export function loadSavedPlans(): SavedPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SAVED_PLANS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is SavedPlan =>
      typeof p.id === 'string' && typeof p.name === 'string' && typeof p.createdAt === 'number'
    ).map(p => ({
      id: p.id,
      name: p.name,
      semesterPlans: parseSemesterPlans(p.semesterPlans),
      planEndTerm: parsePlanEndTerm(p.planEndTerm),
      programOverride: parseProgram(p.programOverride) ?? null,
      createdAt: p.createdAt,
    }));
  } catch { return []; }
}

export function saveSavedPlans(plans: SavedPlan[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(plans)); } catch {}
}

export function loadActivePlanId(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(ACTIVE_PLAN_ID_KEY); } catch { return null; }
}

export function saveActivePlanId(id: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(ACTIVE_PLAN_ID_KEY, id); } catch {}
}

const ONBOARDING_SEMESTER_PLANS_KEY = 'ptp-onboarding-semester-plans-v1';

export function loadOnboardingSemesterPlans(): Record<string, string[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ONBOARDING_SEMESTER_PLANS_KEY);
    if (!raw) return {};
    return parseSemesterPlans(JSON.parse(raw));
  } catch { return {}; }
}

export function saveOnboardingSemesterPlans(plans: Record<string, string[]>): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(ONBOARDING_SEMESTER_PLANS_KEY, JSON.stringify(plans)); } catch {}
}

export function clearPersistedPlan(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PLAN_STORAGE_KEY);
    window.localStorage.removeItem(SAVED_PLANS_KEY);
    window.localStorage.removeItem(ACTIVE_PLAN_ID_KEY);
    window.localStorage.removeItem(ONBOARDING_SEMESTER_PLANS_KEY);
    window.localStorage.removeItem('ptp-flow-ratings-v3');
    window.localStorage.removeItem('ptp-course-overrides-v1');
    window.localStorage.removeItem('ptp-show-difficulty-v1');
    window.localStorage.removeItem(FOLDERS_KEY);
  } catch {
    /* ignore */
  }
}

const CLEAR_FLAG_KEY = 'ptp-clear-on-load';

/** Schedule a full clear to run after the next page load (survives beforeunload flush). */
export function scheduleClearOnNextLoad(): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(CLEAR_FLAG_KEY, '1'); } catch {}
}

/** Returns true and consumes the flag if a scheduled clear is pending. */
export function consumeClearOnLoadFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!sessionStorage.getItem(CLEAR_FLAG_KEY)) return false;
    sessionStorage.removeItem(CLEAR_FLAG_KEY);
    return true;
  } catch { return false; }
}
