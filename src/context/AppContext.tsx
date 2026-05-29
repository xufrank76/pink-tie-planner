'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import type { CourseInfo } from '@/app/api/courses/route';
import type { FlowRating } from '@/app/api/uwflow-ratings/route';
import { loadPersistedPlan, savePersistedPlan, loadSavedPlans, saveSavedPlans, loadActivePlanId, saveActivePlanId, loadOnboardingSemesterPlans, saveOnboardingSemesterPlans, clearPersistedPlan, consumeClearOnLoadFlag, loadFolders, saveFolders, type SavedPlan, type FavFolder, DEFAULT_COURSES_FOLDER_ID, DEFAULT_PLANS_FOLDER_ID } from '@/src/lib/planPersistence';
import { effectivePlanEndTerm, pruneSemesterPlansBeyond } from '@/src/lib/planTerms';
import type { UserProgram } from '@/src/types/program';

type ProgramChangeBackup = {
  program: UserProgram;
  completedCourses: string[];
  semesterPlans: Record<string, string[]>;
  planEndTerm: string | null;
};

export type { CourseInfo };
export type { ExtraCredential, UserProgram } from '@/src/types/program';
export type { SavedPlan, FavFolder };
export type { FlowRating };
export { DEFAULT_COURSES_FOLDER_ID, DEFAULT_PLANS_FOLDER_ID };

interface AppContextValue {
  /** True after first client read of localStorage (or absence of a saved plan). */
  planReady: boolean;
  /** User finished onboarding (transcript step). Drives shell vs onboarding UI. */
  setupComplete: boolean;
  setSetupComplete: (v: boolean) => void;
  program: UserProgram;
  completedCourses: string[];
  semesterPlans: Record<string, string[]>;
  favoriteCourses: string[];
  favoritePrograms: string[];
  /** User-chosen last term on the timeline; null uses co-op grad or 12-term default. */
  planEndTerm: string | null;
  setPlanEndTerm: (term: string | null) => void;
  courses: CourseInfo[];
  coursesStatus: 'loading' | 'ok' | 'error';
  setProgram: (p: UserProgram) => void;
  /** Clears program + sends you back to onboarding to pick major/minor/co-op again. Does not erase your course plan yet — transcript step overwrites when you confirm. */
  restartProgramSelection: () => void;
  /** True after “Change program…” until you finish onboarding or cancel. */
  resumeFromProgramChangeAvailable: boolean;
  /** Restores program + plan from before “Change program…” and returns to the main app. */
  cancelProgramChange: () => void;
  setCompletedCourses: (courses: string[]) => void;
  setSemesterPlans: (plans: Record<string, string[]>) => void;
  addCourseToTerm: (term: string, code: string) => void;
  removeCourseFromTerm: (term: string, code: string) => void;
  toggleFavorite: (code: string) => void;
  toggleFavoriteProgram: (id: string) => void;
  folders: FavFolder[];
  createFolder: (name: string) => void;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
  addCourseToFolder: (folderId: string, code: string) => void;
  removeCourseFromFolder: (folderId: string, code: string) => void;
  addProgramToFolder: (folderId: string, programId: string) => void;
  removeProgramFromFolder: (folderId: string, programId: string) => void;
  /** The active plan's programOverride if set, otherwise the global program. Use this for requirement checking. */
  effectiveProgram: UserProgram;
  savedPlans: SavedPlan[];
  activePlanId: string;
  createPlan: (name: string) => void;
  saveOnboardingCourses: (semesterPlans: Record<string, string[]>) => void;
  clonePlan: (id: string, name: string) => void;
  deletePlan: (id: string) => void;
  renamePlan: (id: string, name: string) => void;
  switchPlan: (id: string) => void;
  setPlanProgramOverride: (id: string, override: UserProgram | null) => void;
  courseOverrides: Set<string>;
  addCourseOverride: (code: string) => void;
  removeCourseOverride: (code: string) => void;
  flowRatings: Record<string, FlowRating>;
  showDifficultyScore: boolean;
  setShowDifficultyScore: (v: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [planReady, setPlanReady] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [program, setProgram] = useState<UserProgram>({ id: '', major: '', doubleMajor: null, doubleMajorId: null, minor: null, minorId: null, extras: [], coopStream: null, startTerm: null });
  const [completedCourses, setCompletedCourses] = useState<string[]>([]);
  const [semesterPlans, setPlans] = useState<Record<string, string[]>>({});
  const [folders, setFolders] = useState<FavFolder[]>([]);
  const [planEndTerm, setPlanEndTermState] = useState<string | null>(null);
  const favoriteCourses = useMemo(() => folders.find(f => f.id === DEFAULT_COURSES_FOLDER_ID)?.courses ?? [], [folders]);
  const favoritePrograms = useMemo(() => folders.find(f => f.id === DEFAULT_PLANS_FOLDER_ID)?.programs ?? [], [folders]);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [coursesStatus, setCoursesStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string>('');
  const [courseOverrides, setCourseOverrides] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem('ptp-course-overrides-v1') ?? '[]') as string[]); } catch { return new Set(); }
  });
  const [showDifficultyScore, setShowDifficultyScoreState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { const v = localStorage.getItem('ptp-show-difficulty-v1'); return v === null ? false : v === 'true'; } catch { return false; }
  });
  const setShowDifficultyScore = useCallback((v: boolean) => {
    setShowDifficultyScoreState(v);
    try { localStorage.setItem('ptp-show-difficulty-v1', String(v)); } catch {}
  }, []);

  const [flowRatings, setFlowRatings] = useState<Record<string, FlowRating>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const cached = localStorage.getItem('ptp-flow-ratings-v3');
      if (!cached) return {};
      const parsed = JSON.parse(cached) as Record<string, unknown>;
      const first = Object.values(parsed)[0];
      if (typeof first === 'object' && first !== null && 'filled_count' in first) return parsed as Record<string, FlowRating>;
      return {};
    } catch { return {}; }
  });
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onboardingSemesterPlansRef = useRef<Record<string, string[]>>({});
  const programChangeBackupRef = useRef<ProgramChangeBackup | null>(null);
  const [resumeFromProgramChangeAvailable, setResumeFromProgramChangeAvailable] = useState(false);

  useEffect(() => {
    if (consumeClearOnLoadFlag()) clearPersistedPlan();
    const saved = loadPersistedPlan();
    if (saved) {
      setProgram(saved.program);
      setCompletedCourses(saved.completedCourses);
      const end = effectivePlanEndTerm(saved.planEndTerm ?? null, saved.program);
      setPlans(pruneSemesterPlansBeyond(saved.semesterPlans, end));
      setPlanEndTermState(saved.planEndTerm ?? null);
      const sc = saved.setupComplete === true && saved.program.id !== '';
      setSetupComplete(sc);
    }

    // Load or initialise multi-plan storage
    let plans = loadSavedPlans();
    let activeId = loadActivePlanId();
    if (plans.length === 0) {
      // Migrate existing semesterPlans into the first saved plan
      const firstId = crypto.randomUUID();
      plans = [{
        id: firstId,
        name: 'My Plan',
        semesterPlans: saved?.semesterPlans ?? {},
        planEndTerm: saved?.planEndTerm ?? null,
        programOverride: null,
        createdAt: Date.now(),
      }];
      saveSavedPlans(plans);
      activeId = firstId;
      saveActivePlanId(firstId);
    }
    if (!activeId || !plans.find(p => p.id === activeId)) {
      activeId = plans[0].id;
      saveActivePlanId(activeId);
    }
    setSavedPlans(plans);
    setActivePlanId(activeId);
    // Load the active plan's semesterPlans + planEndTerm (overrides the persisted-plan values)
    const activePlan = plans.find(p => p.id === activeId);
    if (activePlan) {
      const end = saved?.program ? effectivePlanEndTerm(activePlan.planEndTerm, saved.program) : activePlan.planEndTerm ?? 'W29';
      setPlans(pruneSemesterPlansBeyond(activePlan.semesterPlans, end));
      setPlanEndTermState(activePlan.planEndTerm);
    }

    let onboardingPlans = loadOnboardingSemesterPlans();
    if (Object.keys(onboardingPlans).length === 0 && saved && saved.completedCourses.length > 0) {
      const completedSet = new Set(saved.completedCourses);
      const derived: Record<string, string[]> = {};
      for (const [term, codes] of Object.entries(saved.semesterPlans)) {
        const past = codes.filter(c => completedSet.has(c));
        if (past.length > 0) derived[term] = past;
      }
      onboardingPlans = derived;
      saveOnboardingSemesterPlans(derived);
    }
    onboardingSemesterPlansRef.current = onboardingPlans;
    setFolders(loadFolders(saved?.favoriteCourses ?? [], saved?.favoritePrograms ?? []));
    setPlanReady(true);
  }, []);

  // Sync active plan's semesterPlans + planEndTerm into savedPlans
  useEffect(() => {
    if (!planReady || !activePlanId) return;
    setSavedPlans(prev => {
      const next = prev.map(p => p.id === activePlanId ? { ...p, semesterPlans, planEndTerm } : p);
      saveSavedPlans(next);
      return next;
    });
  }, [planReady, activePlanId, semesterPlans, planEndTerm]);

  useEffect(() => {
    if (!planReady) return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      saveDebounceRef.current = null;
      savePersistedPlan({
        setupComplete,
        program,
        completedCourses,
        semesterPlans,
        favoriteCourses,
        favoritePrograms,
        planEndTerm,
      });
    }, 400);
    return () => {
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    };
  }, [planReady, setupComplete, program, completedCourses, semesterPlans, favoriteCourses, favoritePrograms, planEndTerm]);

  useEffect(() => {
    if (!planReady || folders.length === 0) return;
    saveFolders(folders);
  }, [planReady, folders]);

  useEffect(() => {
    if (!planReady) return;
    const flush = () => {
      savePersistedPlan({
        setupComplete,
        program,
        completedCourses,
        semesterPlans,
        favoriteCourses,
        favoritePrograms,
        planEndTerm,
      });
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [planReady, setupComplete, program, completedCourses, semesterPlans, favoriteCourses, favoritePrograms, planEndTerm]);

  useEffect(() => {
    if (!setupComplete) return;
    programChangeBackupRef.current = null;
    setResumeFromProgramChangeAvailable(false);
  }, [setupComplete]);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 15_000);

    (async () => {
      try {
        const res = await fetch('/api/courses', { signal: ac.signal });
        const data: unknown = await res.json();
        if (!alive) return;
        if (!res.ok || !Array.isArray(data)) {
          setCourses([]);
          setCoursesStatus('error');
          return;
        }
        setCourses(data as CourseInfo[]);
        setCoursesStatus('ok');
      } catch {
        if (!alive) return;
        setCourses([]);
        setCoursesStatus('error');
      } finally {
        clearTimeout(tid);
      }
    })();

    return () => {
      alive = false;
      clearTimeout(tid);
    };
  }, []);

  // Patch offered seasons (and specific terms for biennial courses) with Odyssey + UW Flow data.
  useEffect(() => {
    if (coursesStatus !== 'ok') return;
    fetch('/api/offerings')
      .then(r => r.ok ? r.json() as Promise<Record<string, { seasons: string[]; terms: string[] | null }>> : ({} as Record<string, { seasons: string[]; terms: string[] | null }>))
      .then(override => {
        if (!override || Object.keys(override).length === 0) return;
        setCourses(prev => prev.map(c => {
          const info = override[c.code.toUpperCase().replace(/\s+/g, '')];
          if (!info) return c;
          return { ...c, offered: info.seasons, offeredTerms: info.terms };
        }));
      })
      .catch(() => {});
  }, [coursesStatus]);

  useEffect(() => {
    if (Object.keys(flowRatings).length > 0) return;
    fetch('/api/uwflow-ratings')
      .then(r => r.ok ? r.json() : {})
      .then((data: Record<string, FlowRating>) => {
        setFlowRatings(data);
        try { localStorage.setItem('ptp-flow-ratings-v3', JSON.stringify(data)); } catch {}
      })
      .catch(() => {});
  }, []);

  const setPlanEndTerm = useCallback(
    (term: string | null) => {
      setPlanEndTermState(term);
      setPlans(prev => pruneSemesterPlansBeyond(prev, effectivePlanEndTerm(term, program)));
    },
    [program],
  );

  const restartProgramSelection = useCallback(() => {
    programChangeBackupRef.current = {
      program: { ...program, extras: program.extras.map(e => ({ ...e })) },
      completedCourses: [...completedCourses],
      semesterPlans: Object.fromEntries(Object.entries(semesterPlans).map(([k, v]) => [k, [...v]])),
      planEndTerm,
    };
    setResumeFromProgramChangeAvailable(true);
    setPlanEndTermState(null);
    setProgram({
      id: '',
      major: '',
      doubleMajor: null,
      doubleMajorId: null,
      minor: null,
      minorId: null,
      extras: [],
      coopStream: null,
      startTerm: null,
    });
    setSetupComplete(false);
  }, [program, completedCourses, semesterPlans, planEndTerm]);

  const cancelProgramChange = useCallback(() => {
    const b = programChangeBackupRef.current;
    if (!b) return;
    programChangeBackupRef.current = null;
    setResumeFromProgramChangeAvailable(false);
    setProgram(b.program);
    setCompletedCourses(b.completedCourses);
    setPlans(b.semesterPlans);
    setPlanEndTermState(b.planEndTerm);
    setSetupComplete(true);
  }, []);

  const setSemesterPlans = (plans: Record<string, string[]>) => setPlans(plans);

  const addCourseToTerm = (term: string, code: string) => {
    setPlans(prev => ({
      ...prev,
      [term]: prev[term]?.includes(code) ? prev[term] : [...(prev[term] ?? []), code],
    }));
  };

  const removeCourseFromTerm = (term: string, code: string) => {
    setPlans(prev => ({
      ...prev,
      [term]: (prev[term] ?? []).filter(c => c !== code),
    }));
    setCompletedCourses(prev => prev.filter(c => c !== code));
  };

  const createPlan = useCallback((name: string) => {
    const id = crypto.randomUUID();
    const initialPlans = onboardingSemesterPlansRef.current;
    const newPlan: SavedPlan = { id, name, semesterPlans: initialPlans, planEndTerm: null, programOverride: null, createdAt: Date.now() };
    setSavedPlans(prev => { const next = [...prev, newPlan]; saveSavedPlans(next); return next; });
    setActivePlanId(id);
    saveActivePlanId(id);
    setPlans(initialPlans);
    setPlanEndTermState(null);
  }, []);

  const saveOnboardingCourses = useCallback((plans: Record<string, string[]>) => {
    onboardingSemesterPlansRef.current = plans;
    saveOnboardingSemesterPlans(plans);
  }, []);

  const clonePlan = useCallback((sourceId: string, name: string) => {
    const id = crypto.randomUUID();
    setSavedPlans(prev => {
      const source = prev.find(p => p.id === sourceId);
      if (!source) return prev;
      const newPlan: SavedPlan = { id, name, semesterPlans: { ...source.semesterPlans }, planEndTerm: source.planEndTerm, programOverride: source.programOverride, createdAt: Date.now() };
      const next = [...prev, newPlan];
      saveSavedPlans(next);
      return next;
    });
    setActivePlanId(id);
    saveActivePlanId(id);
    setSavedPlans(prev => {
      const clone = prev.find(p => p.id === id);
      if (clone) { setPlans({ ...clone.semesterPlans }); setPlanEndTermState(clone.planEndTerm); }
      return prev;
    });
  }, []);

  const deletePlan = useCallback((id: string) => {
    setSavedPlans(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.filter(p => p.id !== id);
      saveSavedPlans(next);
      if (activePlanId === id) {
        const newActive = next[0];
        setActivePlanId(newActive.id);
        saveActivePlanId(newActive.id);
        setPlans(newActive.semesterPlans);
        setPlanEndTermState(newActive.planEndTerm);
      }
      return next;
    });
  }, [activePlanId]);

  const renamePlan = useCallback((id: string, name: string) => {
    setSavedPlans(prev => { const next = prev.map(p => p.id === id ? { ...p, name } : p); saveSavedPlans(next); return next; });
  }, []);

  const setPlanProgramOverride = useCallback((id: string, override: UserProgram | null) => {
    setSavedPlans(prev => { const next = prev.map(p => p.id === id ? { ...p, programOverride: override } : p); saveSavedPlans(next); return next; });
  }, []);

  const switchPlan = useCallback((id: string) => {
    setSavedPlans(prev => {
      const plan = prev.find(p => p.id === id);
      if (!plan) return prev;
      setActivePlanId(id);
      saveActivePlanId(id);
      setPlans(plan.semesterPlans);
      setPlanEndTermState(plan.planEndTerm);
      return prev;
    });
  }, []);

  const mutateFolderCourses = useCallback((folderId: string, code: string, add: boolean) => {
    setFolders(prev => prev.map(f => f.id !== folderId ? f : {
      ...f, courses: add ? (f.courses.includes(code) ? f.courses : [...f.courses, code]) : f.courses.filter(c => c !== code),
    }));
  }, []);

  const mutateFolderPrograms = useCallback((folderId: string, programId: string, add: boolean) => {
    setFolders(prev => prev.map(f => f.id !== folderId ? f : {
      ...f, programs: add ? (f.programs.includes(programId) ? f.programs : [...f.programs, programId]) : f.programs.filter(p => p !== programId),
    }));
  }, []);

  const toggleFavorite = useCallback((code: string) => {
    setFolders(prev => prev.map(f => f.id !== DEFAULT_COURSES_FOLDER_ID ? f : {
      ...f, courses: f.courses.includes(code) ? f.courses.filter(c => c !== code) : [...f.courses, code],
    }));
  }, []);

  const toggleFavoriteProgram = useCallback((id: string) => {
    setFolders(prev => prev.map(f => f.id !== DEFAULT_PLANS_FOLDER_ID ? f : {
      ...f, programs: f.programs.includes(id) ? f.programs.filter(p => p !== id) : [...f.programs, id],
    }));
  }, []);

  const createFolder = useCallback((name: string) => {
    const id = crypto.randomUUID();
    setFolders(prev => [...prev, { id, name, courses: [], programs: [], createdAt: Date.now() }]);
  }, []);

  const deleteFolder = useCallback((id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id || f.locked));
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders(prev => prev.map(f => f.id !== id || f.locked ? f : { ...f, name }));
  }, []);

  const addCourseToFolder = useCallback((folderId: string, code: string) => mutateFolderCourses(folderId, code, true), [mutateFolderCourses]);
  const removeCourseFromFolder = useCallback((folderId: string, code: string) => mutateFolderCourses(folderId, code, false), [mutateFolderCourses]);
  const addProgramToFolder = useCallback((folderId: string, programId: string) => mutateFolderPrograms(folderId, programId, true), [mutateFolderPrograms]);
  const removeProgramFromFolder = useCallback((folderId: string, programId: string) => mutateFolderPrograms(folderId, programId, false), [mutateFolderPrograms]);

  const effectiveProgram = useMemo(() => {
    const active = savedPlans.find(p => p.id === activePlanId);
    return active?.programOverride ?? program;
  }, [savedPlans, activePlanId, program]);

  const addCourseOverride = useCallback((code: string) => {
    setCourseOverrides(prev => {
      const next = new Set(prev); next.add(code);
      try { localStorage.setItem('ptp-course-overrides-v1', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const removeCourseOverride = useCallback((code: string) => {
    setCourseOverrides(prev => {
      const next = new Set(prev); next.delete(code);
      try { localStorage.setItem('ptp-course-overrides-v1', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  return (
    <AppContext.Provider value={{
      planReady,
      setupComplete,
      setSetupComplete,
      program, completedCourses, semesterPlans, favoriteCourses, favoritePrograms, planEndTerm, courses, coursesStatus,
      setProgram, restartProgramSelection, resumeFromProgramChangeAvailable, cancelProgramChange, setCompletedCourses, setSemesterPlans, setPlanEndTerm, addCourseToTerm, removeCourseFromTerm, toggleFavorite, toggleFavoriteProgram,
      folders, createFolder, deleteFolder, renameFolder, addCourseToFolder, removeCourseFromFolder, addProgramToFolder, removeProgramFromFolder,
      effectiveProgram,
      savedPlans, activePlanId, createPlan, clonePlan, deletePlan, renamePlan, switchPlan, setPlanProgramOverride, saveOnboardingCourses,
      courseOverrides, addCourseOverride, removeCourseOverride,
      flowRatings, showDifficultyScore, setShowDifficultyScore,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
