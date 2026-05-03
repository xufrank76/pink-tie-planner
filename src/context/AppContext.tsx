'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

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
}

interface AppContextValue {
  program: UserProgram;
  completedCourses: string[];
  semesterPlans: Record<string, string[]>;
  favoriteCourses: string[];
  setProgram: (p: UserProgram) => void;
  setCompletedCourses: (courses: string[]) => void;
  addCourseToTerm: (term: string, code: string) => void;
  removeCourseFromTerm: (term: string, code: string) => void;
  toggleFavorite: (code: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [program, setProgram] = useState<UserProgram>({ id: '', major: '', doubleMajor: null, doubleMajorId: null, minor: null, minorId: null, extras: [] });
  const [completedCourses, setCompletedCourses] = useState<string[]>([]);
  const [semesterPlans, setSemesterPlans] = useState<Record<string, string[]>>({});
  const [favoriteCourses, setFavoriteCourses] = useState<string[]>([]);

  const addCourseToTerm = (term: string, code: string) => {
    setSemesterPlans(prev => ({
      ...prev,
      [term]: prev[term]?.includes(code) ? prev[term] : [...(prev[term] ?? []), code],
    }));
  };

  const removeCourseFromTerm = (term: string, code: string) => {
    setSemesterPlans(prev => ({
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
      program, completedCourses, semesterPlans, favoriteCourses,
      setProgram, setCompletedCourses, addCourseToTerm, removeCourseFromTerm, toggleFavorite,
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
