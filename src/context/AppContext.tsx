'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { CourseInfo } from '@/app/api/courses/route';

export type { CourseInfo };

export interface ExtraCredential {
  type: 'major' | 'minor' | 'joint' | 'specialization';
  id: string;
  name: string;
}

export interface UserProgram {
  id: string;
  major: string;
  doubleMajor: string | null;
  doubleMajorId: string | null;
  minor: string | null;
  minorId: string | null;
  extras: ExtraCredential[];
  coopStream: '1' | '2' | '3' | '4' | 'none' | null;
  startTerm: string | null;
}

interface AppContextValue {
  program: UserProgram;
  completedCourses: string[];
  semesterPlans: Record<string, string[]>;
  favoriteCourses: string[];
  courses: CourseInfo[];
  coursesStatus: 'loading' | 'ok' | 'error';
  setProgram: (p: UserProgram) => void;
  setCompletedCourses: (courses: string[]) => void;
  setSemesterPlans: (plans: Record<string, string[]>) => void;
  addCourseToTerm: (term: string, code: string) => void;
  removeCourseFromTerm: (term: string, code: string) => void;
  toggleFavorite: (code: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [program, setProgram] = useState<UserProgram>({ id: '', major: '', doubleMajor: null, doubleMajorId: null, minor: null, minorId: null, extras: [], coopStream: null, startTerm: null });
  const [completedCourses, setCompletedCourses] = useState<string[]>([]);
  const [semesterPlans, setPlans] = useState<Record<string, string[]>>({});
  const [favoriteCourses, setFavoriteCourses] = useState<string[]>([]);
  const [courses, setCourses] = useState<CourseInfo[]>([]);
  const [coursesStatus, setCoursesStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    fetch('/api/courses', { signal: controller.signal })
      .then(r => r.json())
      .then((data: CourseInfo[]) => { setCourses(data); setCoursesStatus('ok'); })
      .catch(() => setCoursesStatus('error'))
      .finally(() => clearTimeout(timeout));
    return () => controller.abort();
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
  };

  const toggleFavorite = (code: string) => {
    setFavoriteCourses(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  return (
    <AppContext.Provider value={{
      program, completedCourses, semesterPlans, favoriteCourses, courses, coursesStatus,
      setProgram, setCompletedCourses, setSemesterPlans, addCourseToTerm, removeCourseFromTerm, toggleFavorite,
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
