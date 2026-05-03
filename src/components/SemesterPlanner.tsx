'use client';

import { useState } from 'react';
import { useApp } from '@/src/context/AppContext';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

interface AvailableCourse {
  code: string;
  name: string;
  reqs: string[];
  offered: string;
  prereqs: string;
  prereqCodes: string[];
}

const ALL_COURSES: AvailableCourse[] = [
  { code: 'CO250',     name: 'Introduction to Optimization',    reqs: ['Major requirements'],  offered: 'F · W · S', prereqs: 'MATH136 ✓',      prereqCodes: ['MATH136'] },
  { code: 'AMATH250',  name: 'Differential Equations',          reqs: ['Core BMath'],          offered: 'F · W · S', prereqs: '',               prereqCodes: [] },
  { code: 'CO330',     name: 'Combinatorial Enumeration',       reqs: ['Major requirements'],  offered: 'F',         prereqs: 'MATH239 ✓',      prereqCodes: ['MATH239'] },
  { code: 'PMATH336',  name: 'Rings and Fields',                reqs: ['Major requirements'],  offered: 'W · S',     prereqs: 'MATH235 ✓',      prereqCodes: ['MATH235'] },
  { code: 'CO342',     name: 'Graph Theory 1',                  reqs: ['Major requirements'],  offered: 'F · S',     prereqs: 'CO250 (planned)', prereqCodes: ['CO250'] },
  { code: 'STAT231',   name: 'Statistics',                      reqs: ['Core BMath'],          offered: 'W · S',     prereqs: 'STAT230 ✓',      prereqCodes: ['STAT230'] },
  { code: 'CLAS104',   name: 'Classical Mythology',             reqs: ['Non-Math elective'],   offered: 'F · W · S', prereqs: '',               prereqCodes: [] },
  { code: 'COMMST100', name: 'Communication in Prof. Contexts', reqs: ['✓ list 1 comm req'],  offered: 'F · W · S', prereqs: '',               prereqCodes: [] },
];

const TERM_OPTIONS = ['W26', 'S26 WT2', 'F26'];

export default function SemesterPlanner({ onNavigate }: { onNavigate: (id: import('./Sidebar').PageId) => void }) {
  const { semesterPlans, addCourseToTerm, removeCourseFromTerm, completedCourses } = useApp();
  const [activeTerm, setActiveTerm] = useState('W26');
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showCheck, setShowCheck] = useState(false);

  const planned = semesterPlans[activeTerm] ?? [];

  const toggleCourse = (code: string) => {
    if (planned.includes(code)) {
      removeCourseFromTerm(activeTerm, code);
    } else {
      addCourseToTerm(activeTerm, code);
    }
  };

  const filtered = ALL_COURSES.filter(
    (c) =>
      !search ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase())
  );

  const plannedCourses = ALL_COURSES.filter((c) => planned.includes(c.code));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '32px 48px 16px', flexShrink: 0 }}>
        <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', lineHeight: 1, margin: '0 0 16px', fontWeight: 400 }}>
          build your semester...
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          {TERM_OPTIONS.map((t) => (
            <div
              key={t}
              onClick={() => setActiveTerm(t)}
              style={{
                background: activeTerm === t ? '#000' : '#d9d9d9',
                color: activeTerm === t ? '#fff' : '#858080',
                borderRadius: '15px',
                padding: '8px 20px',
                fontFamily: MONO,
                fontSize: '15px',
                cursor: 'pointer',
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ flex: 1, display: 'flex', gap: '16px', padding: '0 48px 32px', overflow: 'hidden' }}>

        {/* Left: available courses */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#d9d9d9',
            borderRadius: '15px',
            padding: '16px',
            overflow: 'hidden',
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.04em' }}>
            AVAILABLE COURSES — REQUIRED FOR YOUR MAJOR
          </div>
          <div
            style={{
              background: '#fff',
              borderRadius: '15px',
              padding: '10px 14px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              border: '1px solid #000',
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: '18px', marginRight: '8px' }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search courses..."
              style={{
                border: 'none',
                background: 'transparent',
                fontFamily: SANS,
                fontSize: '15px',
                color: '#858080',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map((c) => {
              const isPlanned = planned.includes(c.code);
              return (
                <div
                  key={c.code}
                  onClick={() => toggleCourse(c.code)}
                  style={{
                    background: '#fff',
                    border: '1px solid #000',
                    borderRadius: '15px',
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    opacity: isPlanned ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontFamily: MONO, fontSize: '18px', color: '#000', whiteSpace: 'nowrap' }}>{c.code}</span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {c.reqs.map((r) => (
                        <div
                          key={r}
                          style={{
                            background: '#000',
                            color: '#fff',
                            borderRadius: '15px',
                            padding: '2px 10px',
                            fontFamily: MONO,
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r}
                        </div>
                      ))}
                      {c.prereqs && (
                        <span style={{ fontFamily: MONO, fontSize: '12px', color: '#858080' }}>{c.prereqs}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: '18px', color: '#858080' }}>{isPlanned ? '✓' : '+'}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: this term's plan */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={() => setDragOver(false)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderRadius: '15px',
            border: `1px dashed ${dragOver ? '#000' : '#858080'}`,
            padding: '16px',
            overflow: 'hidden',
            transition: 'border-color 0.15s',
          }}
        >
          <div style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.04em' }}>
            DRAG HERE — {activeTerm} ({plannedCourses.length}/5 courses)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
            {plannedCourses.map((c) => (
              <div
                key={c.code}
                style={{
                  background: '#fff',
                  border: '1px solid #000',
                  borderRadius: '15px',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '18px', color: '#000', whiteSpace: 'nowrap' }}>{c.code}</span>
                  {c.reqs[0].startsWith('✓') && (
                    <div
                      style={{
                        background: '#000',
                        color: '#fff',
                        borderRadius: '15px',
                        padding: '2px 10px',
                        fontFamily: MONO,
                        fontSize: '12px',
                        display: 'inline-flex',
                      }}
                    >
                      {c.reqs[0]}
                    </div>
                  )}
                </div>
                <span
                  onClick={() => toggleCourse(c.code)}
                  style={{ fontFamily: MONO, fontSize: '18px', color: '#858080', cursor: 'pointer' }}
                >
                  ×
                </span>
              </div>
            ))}
            {/* PD placeholder */}
            <div style={{ background: '#fff', border: '1px solid #000', borderRadius: '15px', padding: '10px 14px' }}>
              <span style={{ fontFamily: MONO, fontSize: '18px', color: '#000', whiteSpace: 'nowrap' }}>PD14</span>
            </div>
            {plannedCourses.length < 4 && (
              <div
                style={{
                  background: '#fff',
                  border: '1px dashed #858080',
                  borderRadius: '15px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: '18px', color: '#858080' }}>+ drag a course here</span>
              </div>
            )}
          </div>

          {plannedCourses.length > 0 && (
            <div style={{ marginTop: 'auto', paddingTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '5px 12px', fontFamily: MONO, fontSize: '13px' }}>
                ✓ list 1 comm req
              </div>
              <div style={{ background: '#000', color: '#fff', borderRadius: '15px', padding: '5px 12px', fontFamily: MONO, fontSize: '13px' }}>
                ✓ PD req
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Prereq check panel */}
      {showCheck && (
        <div style={{ padding: '0 48px 16px', flexShrink: 0 }}>
          <div style={{ background: '#ececec', borderRadius: '15px', padding: '16px 20px' }}>
            <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }}>
              PREREQ CHECK — {activeTerm}
            </div>
            {plannedCourses.length === 0
              ? <span style={{ fontFamily: SANS, fontSize: '16px', color: '#858080' }}>No courses planned yet.</span>
              : plannedCourses.map(c => {
                  const missing = c.prereqCodes.filter(p => !completedCourses.includes(p));
                  return (
                    <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '5px', flexShrink: 0,
                        background: missing.length === 0 ? '#000' : '#c60078',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ color: '#fff', fontFamily: MONO, fontSize: '12px' }}>{missing.length === 0 ? '✓' : '!'}</span>
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: '15px', color: '#000' }}>{c.code}</span>
                      {missing.length > 0 && (
                        <span style={{ fontFamily: SANS, fontSize: '14px', color: '#858080' }}>
                          missing prereq: {missing.join(', ')}
                        </span>
                      )}
                    </div>
                  );
                })
            }
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ padding: '0 48px 32px', display: 'flex', gap: '12px', flexShrink: 0 }}>
        <button
          onClick={() => onNavigate('dashboard')}
          style={{
            background: '#d9d9d9',
            border: 'none',
            borderRadius: '40px',
            height: '58px',
            padding: '0 35px',
            fontFamily: SANS,
            fontSize: '20px',
            cursor: 'pointer',
            color: '#000',
          }}
        >
          ← back
        </button>
        <button
          onClick={() => setShowCheck(v => !v)}
          style={{
            background: showCheck ? '#000' : '#d9d9d9',
            color: showCheck ? '#fff' : '#000',
            border: 'none',
            borderRadius: '40px',
            height: '58px',
            padding: '0 35px',
            fontFamily: SANS,
            fontSize: '20px',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          check plan →
        </button>
      </div>
    </div>
  );
}
