'use client';

import { useState, useRef, useMemo } from 'react';
import fuzzysort from 'fuzzysort';
import { useApp } from '@/src/context/AppContext';
import { getStudyLabel } from '@/src/data/coopSequences';
import {
  ChevronDown, ProgramSelector, ProgramFormFields, useProgramForm,
  MAJORS, MINORS, EXTRA_OPTIONS, JOINT_PAIRS, SPEC_PARENT, SPEC_PARENT_MAJOR_IDS,
  getBlockedIds, START_TERMS,
  type ProgramEntry,
} from '@/src/components/ProgramForm';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';



function ProgramSelect({ onContinue, onBackToPlan }: { onContinue: () => void; onBackToPlan?: () => void }) {
  const { setProgram } = useApp();
  const form = useProgramForm();
  const { canSave, buildProgram } = form;

  function handleContinue() {
    const p = buildProgram();
    if (!p) return;
    setProgram(p);
    onContinue();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, padding: '28px 48px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: '700px', margin: 'auto' }}>
        <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', margin: '0 0 20px', fontWeight: 400, lineHeight: 1, animation: 'headingReveal 0.5s ease forwards' }}>
          select your program...
        </h1>
        <ProgramFormFields form={form} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {onBackToPlan && (
            <button type="button" onClick={onBackToPlan} style={{ background: '#d9d9d9', border: 'none', borderRadius: '40px', height: '58px', padding: '0 35px', fontFamily: SANS, fontSize: '20px', cursor: 'pointer', color: '#000' }}>
              ← back to plan
            </button>
          )}
          <button onClick={handleContinue} disabled={!canSave} style={{ background: canSave ? '#d9d9d9' : '#f0f0f0', border: 'none', borderRadius: '40px', height: '58px', padding: '0 40px', fontFamily: SANS, fontSize: '20px', cursor: canSave ? 'pointer' : 'default', color: canSave ? '#000' : '#858080' }}>
            continue
          </button>
        </div>
      </div>
    </div>
  );
}

function termToNum(t: string): number {
  const m = t.match(/^([WFS])(\d{2})$/);
  if (!m) return Infinity;
  return (2000 + parseInt(m[2])) * 10 + (m[1] === 'W' ? 1 : m[1] === 'S' ? 2 : 3);
}

function termDisplayLabel(t: string): string {
  if (t === 'unassigned' || t === 'unknown') return 'Manually added';
  const m = t.match(/^([WFS])(\d{2})$/);
  if (!m) return t;
  return `${m[1]}${m[2]}`;
}

function TranscriptImport({ courses, coursesStatus, onContinue, onBack, onBackToPlan }: { courses: { code: string; name: string }[]; coursesStatus: 'loading' | 'ok' | 'error'; onContinue: () => void; onBack: () => void; onBackToPlan?: () => void }) {
  const { setCompletedCourses, setSemesterPlans, saveOnboardingCourses, program } = useApp();
  const [mode, setMode] = useState<'upload' | 'manual'>('upload');
  const [fileDragging, setFileDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle');
  const [parseError, setParseError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [termCourses, setTermCourses] = useState<Record<string, string[]>>({});
  const [draggingPill, setDraggingPill] = useState<{ code: string; fromTerm: string } | null>(null);
  const [dropTargetTerm, setDropTargetTerm] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [addTermOpen, setAddTermOpen] = useState(false);

  const allAdded = useMemo(() => Object.values(termCourses).flat(), [termCourses]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addedSet = useMemo(() => new Set(allAdded), [allAdded]);
  const courseCodeSet = useMemo(() => new Set(courses.map(c => c.code)), [courses]);
  const normalizedQ = search.trim().toUpperCase().replace(/([A-Z]+)(\d)/g, '$1 $2').replace(/\s+/g, ' ');
  const subjectPrefix = /\d/.test(normalizedQ) ? (normalizedQ.match(/^([A-Z]+)/)?.[1] ?? '') : '';
  const targets = useMemo(
    () => courses.map(c => ({ ...c, fullText: `${c.code} — ${c.name}` })),
    [courses]
  );
  const searchTargets = useMemo(
    () => targets.filter(c => !addedSet.has(c.code) && (!subjectPrefix || c.code.startsWith(subjectPrefix))),
    [targets, addedSet, subjectPrefix]
  );
  const allMatches = normalizedQ
    ? fuzzysort.go(normalizedQ, searchTargets, {
        keys: ['code', 'fullText'],
        threshold: -5000,
        limit: 100,
      }).map(r => ({ code: r.obj.code, name: r.obj.name, score: r.score }))
        .sort((a, b) => {
          if (a.score !== b.score) return b.score - a.score;
          const isStd = (code: string) => /^[A-Z]+\d{3}[A-Z]?$/.test(code);
          const stdDiff = (isStd(b.code) ? 1 : 0) - (isStd(a.code) ? 1 : 0);
          if (stdDiff !== 0) return stdDiff;
          const [, aSubj = '', aNum = ''] = a.code.match(/^([A-Z]+)(\d+)/) ?? [];
          const [, bSubj = '', bNum = ''] = b.code.match(/^([A-Z]+)(\d+)/) ?? [];
          return aSubj.localeCompare(bSubj) || parseInt(aNum) - parseInt(bNum);
        })
    : [];
  const results = allMatches.slice(0, 5);
  const hasMore = allMatches.length > 5;

const sortedTermKeys = useMemo(() =>
    Object.keys(termCourses)
      .sort((a, b) => {
        if (a === 'unassigned' || a === 'unknown') return 1;
        if (b === 'unassigned' || b === 'unknown') return -1;
        return termToNum(a) - termToNum(b);
      }),
    [termCourses]
  );

  const addCourse = (code: string) => {
    setTermCourses(prev => {
      const unassigned = prev['unassigned'] ?? [];
      if (unassigned.includes(code)) return prev;
      return { ...prev, unassigned: [...unassigned, code] };
    });
    setSearch('');
  };

  const removeCourse = (code: string) => {
    setTermCourses(prev => {
      const next: Record<string, string[]> = {};
      for (const [term, codes] of Object.entries(prev)) {
        next[term] = codes.filter(c => c !== code);
      }
      return next;
    });
  };

  const moveCourse = (code: string, fromTerm: string, toTerm: string) => {
    if (fromTerm === toTerm) return;
    setTermCourses(prev => ({
      ...prev,
      [fromTerm]: (prev[fromTerm] ?? []).filter(c => c !== code),
      [toTerm]: [...(prev[toTerm] ?? []), code],
    }));
  };

  const parseFile = async (file: File) => {
    setStatus('parsing');
    setParseError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/parse-transcript', { method: 'POST', body: form });
      if (!res.ok) throw new Error();
      const { termCourses: parsed } = await res.json() as { termCourses: Record<string, string[]> };
      setTermCourses(Object.fromEntries(
        Object.entries(parsed).map(([term, codes]) => [
          term,
          courseCodeSet.size > 0 ? codes.filter(code => courseCodeSet.has(code)) : codes,
        ])
      ));
      setStatus('done');
    } catch {
      setParseError('Could not read this file. Try manual entry.');
      setStatus('error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '48px', alignItems: 'center', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: '700px', margin: 'auto' }}>
        <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', margin: '0 0 32px', fontWeight: 400, lineHeight: 1, animation: 'headingReveal 0.5s ease forwards' }}>
          import your<br />completed courses...
        </h1>

        <div style={{ background: '#d9d9d9', borderRadius: '40px', padding: '8px', display: 'inline-flex', marginBottom: '24px' }}>
          {([['upload', 'upload transcript'], ['manual', 'manual entry']] as const).map(([id, label]) => (
            <div
              key={id}
              onClick={() => setMode(id)}
              style={{
                borderRadius: '40px', height: '50px', padding: '0 28px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: mode === id ? '#fff' : 'transparent',
                color: mode === id ? '#000' : '#858080',
                fontFamily: SANS, fontSize: '18px', cursor: 'pointer',
                transition: 'background 0.15s, opacity 0.15s', whiteSpace: 'nowrap',
              }}
            >{label}</div>
          ))}
        </div>

        {mode === 'upload' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ''; }}
            />
            <div
              onDragOver={e => { e.preventDefault(); setFileDragging(true); }}
              onDragLeave={() => setFileDragging(false)}
              onDrop={e => { e.preventDefault(); setFileDragging(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: fileDragging ? '#c6c6c6' : '#d9d9d9',
                borderRadius: '20px', height: '200px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'background 0.15s, opacity 0.15s', gap: '10px',
              }}
            >
              {status === 'parsing' ? (
                <span style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase' }}>parsing transcript...</span>
              ) : status === 'done' ? (
                <>
                  <span style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase' }}>✓ {allAdded.length} courses detected</span>
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', textTransform: 'uppercase' }}>click to upload a different file</span>
                </>
              ) : (
                <>
                  <span style={{ fontFamily: MONO, fontSize: '15px', color: '#858080', textTransform: 'uppercase' }}>drop your unofficial transcript pdf here</span>
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', textTransform: 'uppercase' }}>or click to browse</span>
                </>
              )}
            </div>
            {parseError && (
              <div style={{ fontFamily: SANS, fontSize: '15px', color: '#858080', marginTop: '12px' }}>{parseError}</div>
            )}
          </>
        )}

        {mode === 'manual' && (
          <>
            <div style={{ position: 'relative', zIndex: 10, marginBottom: '20px' }}>
              <div style={{
                background: '#d9d9d9',
                borderRadius: results.length > 0 ? '20px 20px 0 0' : '40px',
                padding: '10px 16px', display: 'flex', alignItems: 'center',
              }}>
                <span style={{ fontFamily: MONO, fontSize: '18px', marginRight: '8px', color: '#858080' }}>⌕</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (results.length === 1) addCourse(results[0].code);
                    }
                  }}
                  placeholder={coursesStatus === 'loading' ? 'loading courses...' : coursesStatus === 'error' ? 'course list unavailable — type a code directly' : 'search or type a course code...'}
                  autoComplete="off"
                  style={{ border: 'none', background: 'transparent', fontFamily: MONO, fontSize: '15px', color: '#000', outline: 'none', width: '100%' }}
                />
              </div>

            {results.length > 0 && (
              <div style={{
                position: 'absolute', left: 0, right: 0,
                background: '#fff', border: '1px solid #d9d9d9', borderTop: 'none',
                borderRadius: '0 0 20px 20px', overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
              }}>
                {results.map((c, i) => (
                  <div
                    key={c.code}
                    onMouseEnter={() => setHoveredRow(c.code)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
                      borderBottom: i < results.length - 1 || hasMore ? '1px solid #d9d9d9' : 'none',
                      background: hoveredRow === c.code ? '#f5f5f5' : '#fff',
                    }}
                  >
                    <span style={{ fontFamily: MONO, fontSize: '13px', color: '#000', minWidth: '80px', flexShrink: 0 }}>{c.code}</span>
                    <span style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                    <button
                      onClick={() => addCourse(c.code)}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#000'; (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = '#000'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#858080'; (e.currentTarget as HTMLElement).style.borderColor = '#d9d9d9'; }}
                      style={{ padding: '5px 13px', borderRadius: '40px', fontSize: '12px', fontFamily: SANS, background: 'transparent', color: '#858080', border: '1px solid #d9d9d9', cursor: 'pointer', flexShrink: 0, transition: 'all 0.1s', whiteSpace: 'nowrap' }}
                    >+ add</button>
                  </div>
                ))}
                {hasMore && (
                  <div style={{ padding: '8px 16px', fontFamily: MONO, fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#858080', textAlign: 'center', borderTop: '1px solid #d9d9d9' }}>
                    more results — keep typing to narrow down
                  </div>
                )}
              </div>
            )}
            </div>
          </>
        )}

        {/* Courses grouped by term — shared between both modes */}
        {allAdded.length > 0 && (
          <div style={{ marginTop: mode === 'upload' ? '32px' : '0' }}>
            <div style={{ fontFamily: MONO, fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#858080', marginBottom: '16px' }}>
              {allAdded.length} course{allAdded.length !== 1 ? 's' : ''} added — drag to rearrange
            </div>
            {sortedTermKeys.length === 0 && mode === 'manual' && (
              <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', marginBottom: '12px' }}>
                add a term below, then search for courses above
              </div>
            )}
            {sortedTermKeys.map(term => (
              <div
                key={term}
                onDragOver={e => { e.preventDefault(); setDropTargetTerm(term); }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTargetTerm(null); }}
                onDrop={e => {
                  e.preventDefault();
                  setDropTargetTerm(null);
                  if (draggingPill && draggingPill.fromTerm !== term) {
                    moveCourse(draggingPill.code, draggingPill.fromTerm, term);
                  }
                  setDraggingPill(null);
                }}
                style={{
                  marginBottom: '12px',
                  padding: '10px 14px',
                  borderRadius: '15px',
                  border: `1px dashed ${dropTargetTerm === term ? '#000' : '#d9d9d9'}`,
                  background: dropTargetTerm === term ? '#f8f8f8' : '#fafafa',
                  transition: 'border-color 0.15s, background 0.15s, opacity 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#858080' }}>
                    {termDisplayLabel(term)}{program.coopStream && program.startTerm ? (() => { const sl = getStudyLabel(term, program.startTerm, program.coopStream!); return sl ? ` · ${sl}` : ''; })() : ''}
                  </span>
                  <span
                    onClick={() => setTermCourses(prev => { const next = { ...prev }; delete next[term]; return next; })}
                    style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#000')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#858080')}
                  >×</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(termCourses[term] ?? []).map(code => (
                    <div
                      key={code}
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDraggingPill({ code, fromTerm: term }); }}
                      onDragEnd={() => { setDraggingPill(null); setDropTargetTerm(null); }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        background: '#000', color: '#fff',
                        fontFamily: MONO, fontSize: '15px',
                        padding: '5px 14px', borderRadius: '40px',
                        cursor: 'grab',
                        opacity: draggingPill?.code === code ? 0.4 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      {code}
                      <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => removeCourse(code)}
                        onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
                        style={{ color: 'rgba(255,255,255,0.45)', fontSize: '15px', cursor: 'pointer', lineHeight: 1, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', transition: 'color 0.1s, opacity 0.15s' }}
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {mode === 'manual' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                {!addTermOpen ? (
                  <div
                    onClick={() => setAddTermOpen(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      border: '1px dashed #858080', borderRadius: '40px',
                      padding: '5px 14px', cursor: 'pointer',
                      fontFamily: MONO, fontSize: '13px', color: '#858080',
                      transition: 'border-color 0.15s, color 0.15s, opacity 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#000'; (e.currentTarget as HTMLElement).style.color = '#000'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#858080'; (e.currentTarget as HTMLElement).style.color = '#858080'; }}
                  >+ add term</div>
                ) : (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px dashed #000', borderRadius: '40px', padding: '5px 14px' }}>
                    <input
                      autoFocus
                      placeholder="e.g. F25"
                      maxLength={3}
                      style={{ border: 'none', outline: 'none', width: '72px', fontFamily: MONO, fontSize: '13px', color: '#000', background: 'transparent' }}
                      onChange={e => e.target.value = e.target.value.toUpperCase()}
                      onKeyDown={e => {
                        if (e.key === 'Escape') { setAddTermOpen(false); return; }
                        if (e.key === 'Enter') {
                          const val = (e.currentTarget.value).toUpperCase();
                          if (/^[WFS]\d{2}$/.test(val) && !(val in termCourses)) {
                            setTermCourses(prev => ({ ...prev, [val]: [] }));
                          }
                          setAddTermOpen(false);
                        }
                      }}
                      onBlur={() => setAddTermOpen(false)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '40px', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {onBackToPlan && (
              <button
                type="button"
                onClick={onBackToPlan}
                style={{ background: '#d9d9d9', border: 'none', borderRadius: '40px', height: '58px', padding: '0 35px', fontFamily: SANS, fontSize: '20px', cursor: 'pointer', color: '#000' }}
              >
                ← back to plan
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={onContinue}
              style={{ background: 'transparent', border: 'none', borderRadius: '40px', height: '58px', padding: '0 20px', fontFamily: SANS, fontSize: '18px', cursor: 'pointer', color: '#858080' }}
            >skip</button>
            <button
              disabled={allAdded.length === 0}
              onClick={() => {
                const termPlans = Object.fromEntries(
                  Object.entries(termCourses).filter(([t]) => /^[WFS]\d{2}$/.test(t))
                );
                setCompletedCourses(allAdded);
                setSemesterPlans(termPlans);
                saveOnboardingCourses(termPlans);
                onContinue();
              }}
              style={{ background: allAdded.length === 0 ? '#f0f0f0' : '#000', border: 'none', borderRadius: '40px', height: '58px', padding: '0 35px', fontFamily: SANS, fontSize: '20px', cursor: allAdded.length === 0 ? 'default' : 'pointer', color: allAdded.length === 0 ? '#c0c0c0' : '#fff' }}
            >confirm and continue</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Onboarding({ onBackToPlan }: { onBackToPlan?: () => void }) {
  const { courses, coursesStatus, program, setSetupComplete } = useApp();
  const [step, setStep] = useState(() => (program.id ? 1 : 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#fff', minHeight: 0 }}>
      <div style={{ display: 'flex', flex: 1, justifyContent: 'center', minHeight: 0 }}>
      <div style={{ display: step === 0 ? 'flex' : 'none', flex: 1 }}>
        <ProgramSelect onContinue={() => setStep(1)} onBackToPlan={onBackToPlan} />
      </div>
      <div style={{ display: step === 1 ? 'flex' : 'none', flex: 1 }}>
        <TranscriptImport
          courses={courses}
          coursesStatus={coursesStatus}
          onContinue={() => setSetupComplete(true)}
          onBack={() => setStep(0)}
          onBackToPlan={onBackToPlan}
        />
      </div>
      </div>
    </div>
  );
}
