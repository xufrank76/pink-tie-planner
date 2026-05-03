'use client';

import { useState } from 'react';
import Sidebar, { type PageId } from './Sidebar';
import Dashboard from './Dashboard';
import DegreePlan from './DegreePlan';
import CourseCatalog from './CourseCatalog';
import SemesterPlanner from './SemesterPlanner';
import Onboarding from './Onboarding';
import { AppProvider } from '@/src/context/AppContext';

function AppShell() {
  const [onboarded, setOnboarded] = useState(false);
  const [page, setPage] = useState<PageId>('dashboard');

  if (!onboarded) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: '#fff' }}>
        <Onboarding onComplete={() => setOnboarded(true)} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#fff' }}>
      <Sidebar active={page} onNavigate={setPage} />
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {page === 'dashboard'        && <Dashboard onNavigate={setPage} />}
        {page === 'degree-plan'      && <DegreePlan onNavigate={setPage} />}
        {page === 'course-catalog'   && <CourseCatalog />}
        {page === 'semester-planner' && <SemesterPlanner onNavigate={setPage} />}
        {(page === 'settings' || page === 'coming-soon') && (
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
