'use client';

import { useState, useEffect } from 'react';
import Sidebar, { type PageId } from './Sidebar';
import Dashboard from './Dashboard';
import DegreePlan from './DegreePlan';
import CourseCatalog from './CourseCatalog';
import SemesterPlanner from './SemesterPlanner';
import Onboarding from './Onboarding';
import Settings from './Settings';
import MyPlans from './MyPlans';
import LandingPage from './LandingPage';
import { AppProvider, useApp } from '@/src/context/AppContext';


function AppShell() {
  const { planReady, setupComplete, resumeFromProgramChangeAvailable, cancelProgramChange } = useApp();
  const [page, setPage] = useState<PageId>('dashboard');
  const [landingDismissed, setLandingDismissed] = useState(false);

  useEffect(() => {
    const isInteractive = (el: HTMLElement) =>
      el.style.cursor === 'pointer' ||
      el.tagName === 'BUTTON' ||
      el.getAttribute('role') === 'tab' ||
      el.getAttribute('role') === 'button';

    // Walk up to the nearest interactive ancestor (handles children of cursor:pointer divs)
    const findTarget = (node: EventTarget | null): HTMLElement | null => {
      let el = node as HTMLElement | null;
      while (el && el !== document.body) {
        if (isInteractive(el)) return el;
        el = el.parentElement;
      }
      return null;
    };

    const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

    const over = (e: MouseEvent) => {
      const el = findTarget(e.target);
      if (!el) return;
      // Only fire when entering from outside this element, not from a child
      if (el.contains(e.relatedTarget as Node)) return;
      const t = timers.get(el);
      if (t !== undefined) { clearTimeout(t); timers.delete(el); }
      el.style.opacity = '0.6';
    };
    const out = (e: MouseEvent) => {
      const el = findTarget(e.target);
      if (!el) return;
      // Only fire when leaving to outside this element, not to a child
      if (el.contains(e.relatedTarget as Node)) return;
      el.style.opacity = '';
      const t = setTimeout(() => timers.delete(el), 0);
      timers.set(el, t);
    };

    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
    };
  }, []);

  if (!planReady) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <span style={{ fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)', fontSize: '18px', color: '#858080' }}>
          loading…
        </span>
      </div>
    );
  }

  if (!setupComplete && !landingDismissed) {
    return <LandingPage onGetStarted={() => setLandingDismissed(true)} />;
  }

  if (!setupComplete) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: '#fff' }}>
        <Onboarding
          onBackToPlan={resumeFromProgramChangeAvailable ? cancelProgramChange : undefined}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#fff' }}>
      <Sidebar active={page} onNavigate={setPage} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, minWidth: 0 }}>
        {page === 'dashboard'        && <Dashboard onNavigate={setPage} />}
        {page === 'degree-plan'      && <DegreePlan onNavigate={setPage} />}
        {page === 'my-plans'         && <MyPlans onNavigate={setPage} />}
        {page === 'course-catalog'   && <CourseCatalog onNavigate={setPage} />}
        {page === 'semester-planner' && <SemesterPlanner onNavigate={setPage} />}
        {page === 'settings' && <Settings />}
        {page === 'coming-soon' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)', fontSize: '20px', color: '#858080' }}>
              coming soon
            </span>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
