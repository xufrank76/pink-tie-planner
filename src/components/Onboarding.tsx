'use client';

import { useState, useRef, useMemo } from 'react';
import fuzzysort from 'fuzzysort';
import { useApp } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';
import { getStudyLabel } from '@/src/data/coopSequences';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';



function ChevronDown({ color }: { color: string }) {
  return (
    <svg width={14} height={12} viewBox="0 0 14 12" fill={color} style={{ transform: 'rotate(180deg)', flexShrink: 0 }}>
      <path d="M 5.215 3.534 C 5.955 2.069 8.045 2.069 8.785 3.534 L 11.596 9.098 C 12.268 10.428 11.301 12 9.811 12 L 4.189 12 C 2.699 12 1.732 10.428 2.404 9.098 L 5.215 3.534 Z" />
    </svg>
  );
}

interface ProgramEntry { id: string; name: string; code: string; isMinor: boolean; isSpecialization: boolean }
const ALL_PROGRAMS = (Object.values(rawPrograms) as ProgramEntry[]).filter(p => !!p.id);
function majorDisplayName(p: ProgramEntry): string {
  if (p.isSpecialization && p.code.startsWith('H-'))
    return p.name.replace(/ - (.+?) Specialization \(.*\)/, ' ($1)');
  return p.name
    .replace(' (Bachelor of Mathematics - Honours)', ' (Honours)')
    .replace(' (Joint Honours)', ' (Joint)');
}

const MAJORS = ALL_PROGRAMS
  .filter(p => !p.isMinor && (!p.isSpecialization || (p.code.startsWith('H-') && !p.code.includes('FARM'))))
  .map(p => ({ ...p, name: majorDisplayName(p) }))
  .sort((a, b) => a.name.localeCompare(b.name));
const MINORS = ALL_PROGRAMS.filter(p => p.isMinor).sort((a, b) => a.name.localeCompare(b.name));
const SPEC_PARENT: Record<string, string> = {
  'MS':    'Mathematical Studies',
  'ACTSC': 'Actuarial Science',
  'AMATH': 'Applied Mathematics',
};
const SPEC_PARENT_MAJOR_IDS: Record<string, string[]> = {
  'MS':    ['H1z0kJR0in'],
  'ACTSC': ['HkeH1JRCjh'],
  'AMATH': ['r1lByy00sh'],
};
function specDisplayName(p: ProgramEntry): string {
  const prefix = p.code.split('-')[0];
  const parent = SPEC_PARENT[prefix];
  return parent ? `${p.name} (${parent})` : p.name;
}
const SPECIALIZATIONS = ALL_PROGRAMS
  .filter(p => p.isSpecialization && !p.code.startsWith('H-'))
  .map(p => ({ ...p, name: specDisplayName(p) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const JOINT_PAIRS: Record<string, string> = {
  'HkeH1JRCjh': 'ryHykRAi3',  'ryHykRAi3': 'HkeH1JRCjh',  // Actuarial Science
  'r1lByy00sh': 'SJgSyJC0s2', 'SJgSyJC0s2': 'r1lByy00sh',  // Applied Mathematics
  'SyeD110Co2': 'HJmwyyA0o2', 'HJmwyyA0o2': 'SyeD110Co2',  // C&O
  'S1eexkCAo2': 'S1fxe1ACi2', 'S1fxe1ACi2': 'S1eexkCAo2',  // Pure Mathematics
  'H1XegyCAin': 'BybggJARoh', 'BybggJARoh': 'H1XegyCAin',  // Statistics
};

const MATH_MAJOR_IDS = new Set([
  'HkeH1JRCjh','r1lByy00sh','ByBkJCRs2','SkUkJR0oh','SyeD110Co2',
  'rkDkJCAj2','HymD11R0j3','BJx01yRCin','ryAkJARjn','ByzRyy0Rj2',
  'Byl0k1ACin','S1eexkCAo2','H1XegyCAin','r1gAJJ0Cin','H1z0kJR0in',
  'ryHykRAi3','SJgSyJC0s2','HJmwyyA0o2','S1fxe1ACi2','BybggJARoh',
  'H1gRk1ARih','Sy0ky0Rsn',
]);

function getBlockedIds(majorId: string | undefined): { doubleMajors: Set<string>; minors: Set<string> } {
  const doubleMajors = new Set<string>();
  const minors = new Set<string>();
  if (!majorId) return { doubleMajors, minors };
  const bm = (...ids: string[]) => ids.forEach(id => { if (id !== majorId) doubleMajors.add(id); });
  const bn = (...ids: string[]) => ids.forEach(id => minors.add(id));
  switch (majorId) {
    case 'HymD11R0j3': // Data Science — no other math major
      MATH_MAJOR_IDS.forEach(id => { if (id !== majorId) doubleMajors.add(id); });
      bn('rJbgx1RAs3'); // Statistics Minor
      break;
    case 'H1z0kJR0in': // Mathematical Studies — no other standalone or joint
      MATH_MAJOR_IDS.forEach(id => { if (id !== majorId) doubleMajors.add(id); });
      break;
    case 'r1gAJJ0Cin': // Mathematical Economics — no other stand-alone major
      MATH_MAJOR_IDS.forEach(id => { if (id !== majorId) doubleMajors.add(id); });
      bn('rk7AJJ0Ain'); // Mathematics Minor
      break;
    case 'HkeH1JRCjh': // Actuarial Science Honours
    case 'ryHykRAi3':  // Actuarial Science Joint
      bm('HymD11R0j3');
      bn('SyxByJ00o3'); // Actuarial Science Minor
      break;
    case 'r1lByy00sh': // Applied Mathematics Honours
    case 'SJgSyJC0s2': // Applied Mathematics Joint
      bm('ByBkJCRs2', 'HymD11R0j3', 'ByzRyy0Rj2');
      bn('rkGHJk0Ci2'); // Applied Mathematics Minor
      break;
    case 'ByBkJCRs2': // Applied Math with Sci Computing/ML
      bm('r1lByy00sh', 'SJgSyJC0s2', 'rkDkJCAj2', 'ByzRyy0Rj2', 'HymD11R0j3');
      bn('rkGHJk0Ci2', 'SkZPkyCAjh'); // Applied Math Minor, Computational Math Minor
      break;
    case 'SkUkJR0oh': // Biostatistics
      bm('HymD11R0j3', 'BybggJARoh', 'H1XegyCAin');
      bn('rJbgx1RAs3'); // Statistics Minor
      break;
    case 'SyeD110Co2': // C&O Honours
    case 'HJmwyyA0o2': // C&O Joint
      bm('H1gRk1ARih', 'Sy0ky0Rsn', 'HymD11R0j3');
      bn('H1D1JR0s2'); // C&O Minor
      break;
    case 'rkDkJCAj2': // Computational Mathematics
      bm('ByBkJCRs2', 'HymD11R0j3');
      bn('SkZPkyCAjh'); // Computational Mathematics Minor
      break;
    case 'ryAkJARjn': // Mathematical Finance
      bm('HymD11R0j3');
      bn('SyxByJ00o3'); // Actuarial Science Minor
      break;
    case 'H1gRk1ARih': // Mathematical Optimization — Business
    case 'Sy0ky0Rsn':  // Mathematical Optimization — OR
      bm('SyeD110Co2', 'HJmwyyA0o2', 'HymD11R0j3');
      bn('H1D1JR0s2'); // C&O Minor
      break;
    case 'ByzRyy0Rj2': // Mathematical Physics (BMath)
      bm('r1lByy00sh', 'SJgSyJC0s2', 'ByBkJCRs2', 'HymD11R0j3');
      bn('rkGHJk0Ci2'); // Applied Math Minor
      break;
    case 'S1eexkCAo2': // Pure Mathematics Honours
    case 'S1fxe1ACi2': // Pure Mathematics Joint
      bm('HymD11R0j3');
      bn('SJlxk0Ci2'); // Pure Mathematics Minor
      break;
    case 'H1XegyCAin': // Statistics Honours
    case 'BybggJARoh': // Statistics Joint
      bm('SkUkJR0oh', 'HymD11R0j3');
      bn('rJbgx1RAs3'); // Statistics Minor
      break;
    case 'BJx01yRCin': // Information Technology Management
      bm('HymD11R0j3');
      break;
    case 'Byl0k1ACin': // Mathematics/Teaching
      bm('HymD11R0j3');
      break;
  }
  // Math Econ and Math Studies block all other Math majors — enforce the reverse
  if (MATH_MAJOR_IDS.has(majorId)) {
    if (majorId !== 'r1gAJJ0Cin') doubleMajors.add('r1gAJJ0Cin');
    if (majorId !== 'H1z0kJR0in') doubleMajors.add('H1z0kJR0in');
  }
  return { doubleMajors, minors };
}

function ProgramSelector({ typeLabel, options, selected, onSelect, optional, disabledIds, isOpen, onToggle }: {
  typeLabel: string;
  options: ProgramEntry[];
  selected: ProgramEntry | null;
  onSelect: (p: ProgramEntry | null) => void;
  optional?: boolean;
  disabledIds?: Set<string>;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const [q, setQ] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const filtered = options.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ position: 'relative', zIndex: isOpen ? 10 : 1 }}>
      <div
        onClick={onToggle}
        style={{
          background: '#d9d9d9',
          borderRadius: isOpen ? '20px 20px 0 0' : '20px',
          padding: '10px 16px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div>
          <div style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', textTransform: 'uppercase' }}>{typeLabel}</div>
          <div style={{ fontFamily: SANS, fontSize: '17px', color: selected ? '#000' : '#858080', marginTop: '3px' }}>
            {selected?.name ?? (optional ? 'select... (optional)' : 'select...')}
          </div>
        </div>
        <ChevronDown color="#fff" />
      </div>
      {isOpen && (
        <div style={{ position: 'absolute', left: 0, right: 0, background: '#fff', border: '1px solid #d9d9d9', borderTop: 'none', borderRadius: '0 0 20px 20px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #d9d9d9' }}>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="search programs..."
              style={{ border: 'none', outline: 'none', width: '100%', fontFamily: SANS, fontSize: '16px', color: '#000', background: 'transparent' }}
            />
          </div>
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            <div
              onClick={() => { onSelect(null); onToggle(); setQ(''); }}
              onMouseEnter={() => setHoveredId('__blank__')}
              onMouseLeave={() => setHoveredId(null)}
              style={{ padding: '12px 20px', cursor: 'pointer', fontFamily: SANS, fontSize: '15px', color: hoveredId === '__blank__' ? '#000' : '#858080', background: hoveredId === '__blank__' ? '#f0f0f0' : '#fff', borderBottom: '1px solid #f0f0f0' }}
            >—</div>
            {filtered.map((p, i) => {
              const isDisabled = disabledIds?.has(p.id) ?? false;
              return (
                <div
                  key={p.id}
                  onClick={() => { if (!isDisabled) { onSelect(p); onToggle(); setQ(''); } }}
                  onMouseEnter={() => { if (!isDisabled) setHoveredId(p.id); }}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{ padding: '12px 20px', cursor: isDisabled ? 'default' : 'pointer', fontFamily: SANS, fontSize: '15px', color: isDisabled ? '#d9d9d9' : selected?.id === p.id || hoveredId === p.id ? '#000' : '#858080', background: hoveredId === p.id ? '#f0f0f0' : selected?.id === p.id ? '#f5f5f5' : '#fff', borderBottom: i < filtered.length - 1 ? '1px solid #f0f0f0' : 'none' }}
                >
                  {p.name}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '12px 20px', fontFamily: SANS, fontSize: '15px', color: '#858080' }}>no results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type ExtraType = 'major' | 'minor' | 'specialization';
type ExtraEntry = { type: ExtraType | null; program: ProgramEntry | null };
const EXTRA_OPTIONS: { type: ExtraType; label: string; list: ProgramEntry[] }[] = [
  { type: 'major',          label: 'MAJOR',          list: MAJORS },
  { type: 'minor',          label: 'MINOR',          list: MINORS },
  { type: 'specialization', label: 'SPECIALIZATION', list: SPECIALIZATIONS },
];

function getStartTerms(): string[] {
  const yr = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => `F${String(yr - 5 + i).slice(-2)}`);
}
const START_TERMS = getStartTerms();

function ProgramSelect({ onContinue }: { onContinue: () => void }) {
  const { setProgram } = useApp();
  const [major, setMajor] = useState<ProgramEntry | null>(null);
  const [doubleMajor, setDoubleMajor] = useState<ProgramEntry | null>(null);
  const [minor, setMinor] = useState<ProgramEntry | null>(null);
  const [extras, setExtras] = useState<ExtraEntry[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [coopStream, setCoopStream] = useState<'1' | '2' | '3' | '4' | 'none' | null>(null);
  const [startTerm, setStartTerm] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey(k => k === key ? null : key);

  const addExtra = (type: ExtraType) => setExtras(prev => [...prev, { type, program: null }]);
  const removeExtra = (i: number) => setExtras(prev => prev.filter((_, j) => j !== i));
  const updateExtra = (i: number, patch: Partial<ExtraEntry>) =>
    setExtras(prev => prev.map((e, j) => j === i ? { ...e, ...patch } : e));

  const blocked = getBlockedIds(major?.id);
  const majorJoint = major ? JOINT_PAIRS[major.id] : undefined;
  const doubleMajorJoint = doubleMajor ? JOINT_PAIRS[doubleMajor.id] : undefined;
  const doubleMajorBlocked = getBlockedIds(doubleMajor?.id);

  const selectedMajorIds = new Set([
    ...(major ? [major.id] : []),
    ...(doubleMajor ? [doubleMajor.id] : []),
    ...extras.filter(e => e.type === 'major' && e.program).map(e => e.program!.id),
  ]);
  const selectedMinorIds = new Set([
    ...(minor ? [minor.id] : []),
    ...extras.filter(e => e.type === 'minor' && e.program).map(e => e.program!.id),
  ]);
  const selectedSpecIds = new Set(
    extras.filter(e => e.type === 'specialization' && e.program).map(e => e.program!.id)
  );

  // majors that would block any currently selected minor
  const minorConflictMajors = new Set(
    MAJORS.filter(p => [...getBlockedIds(p.id).minors].some(id => selectedMinorIds.has(id))).map(p => p.id)
  );

  const majorDisabled = new Set<string>([
    ...(doubleMajor ? [doubleMajor.id] : []),
    ...(doubleMajorJoint ? [doubleMajorJoint] : []),
    ...doubleMajorBlocked.doubleMajors,
    ...extras.filter(e => e.program).map(e => e.program!.id),
    ...extras.filter(e => e.type === 'major' && e.program).flatMap(e => [...getBlockedIds(e.program!.id).doubleMajors]),
    ...minorConflictMajors,
  ]);
  const doubleMajorDisabled = new Set([
    ...blocked.doubleMajors,
    ...(major ? [major.id] : []),
    ...(majorJoint ? [majorJoint] : []),
    ...extras.filter(e => e.type === 'major' && e.program).map(e => e.program!.id),
    ...extras.filter(e => e.type === 'major' && e.program).flatMap(e => [...getBlockedIds(e.program!.id).doubleMajors]),
    ...minorConflictMajors,
  ]);
  const minorDisabled = new Set([
    ...blocked.minors,
    ...doubleMajorBlocked.minors,
    ...(minor ? [minor.id] : []),
    ...extras.filter(e => e.type === 'minor' && e.program).map(e => e.program!.id),
    ...extras.filter(e => e.type === 'major' && e.program).flatMap(e => [...getBlockedIds(e.program!.id).minors]),
  ]);

  const getExtraDisabled = (i: number, type: ExtraType): Set<string> => {
    const ownId = extras[i].program?.id;
    const otherExtrasHaveOwn = ownId && extras.some((e, j) => j !== i && e.program?.id === ownId);
    const primaryHasOwn = ownId && (major?.id === ownId || doubleMajor?.id === ownId || minor?.id === ownId);

    if (type === 'major') {
      const otherExtraMajors = extras.filter((e, j) => j !== i && e.type === 'major' && e.program);
      const otherExtraMajorConflicts = otherExtraMajors.flatMap(e => [...getBlockedIds(e.program!.id).doubleMajors]);
      const otherExtraJointPairs = otherExtraMajors.flatMap(e => JOINT_PAIRS[e.program!.id] ? [JOINT_PAIRS[e.program!.id]] : []);
      const ids = new Set([
        ...blocked.doubleMajors,
        ...doubleMajorBlocked.doubleMajors,
        ...selectedMajorIds,
        ...(majorJoint ? [majorJoint] : []),
        ...(doubleMajorJoint ? [doubleMajorJoint] : []),
        ...minorConflictMajors,
        ...otherExtraMajorConflicts,
        ...otherExtraJointPairs,
      ]);
      const conflictsWithMinor = ownId ? minorConflictMajors.has(ownId) : false;
      if (ownId && !otherExtrasHaveOwn && !primaryHasOwn && !conflictsWithMinor) ids.delete(ownId);
      return ids;
    }
    if (type === 'minor') {
      const otherExtraMajorBlockedMinors = extras
        .filter((e, j) => j !== i && e.type === 'major' && e.program)
        .flatMap(e => [...getBlockedIds(e.program!.id).minors]);
      const ids = new Set([
        ...blocked.minors,
        ...doubleMajorBlocked.minors,
        ...selectedMinorIds,
        ...otherExtraMajorBlockedMinors,
      ]);
      if (ownId && !otherExtrasHaveOwn && !primaryHasOwn) ids.delete(ownId);
      return ids;
    }
    if (type === 'specialization') {
      const allSelectedMajorIds = new Set([
        ...(major ? [major.id] : []),
        ...(doubleMajor ? [doubleMajor.id] : []),
        ...extras.filter((e, j) => j !== i && e.type === 'major' && e.program).map(e => e.program!.id),
      ]);
      const ids = new Set(selectedSpecIds);
      SPECIALIZATIONS.forEach(spec => {
        const prefix = spec.code.split('-')[0];
        const allowed = SPEC_PARENT_MAJOR_IDS[prefix];
        if (allowed && !allowed.some(id => allSelectedMajorIds.has(id))) ids.add(spec.id);
      });
      if (ownId && !otherExtrasHaveOwn) ids.delete(ownId);
      return ids;
    }
    return new Set();
  };

  const allSelectedMajors = [major, doubleMajor, ...extras.filter(e => e.type === 'major' && e.program).map(e => e.program)].filter(Boolean);
  const hasUnpairedJoint = allSelectedMajors.some(m => m!.name.includes('(Joint)')) && allSelectedMajors.length < 2;
  const canContinue = !!major && !!startTerm && !hasUnpairedJoint;

  const handleContinue = () => {
    if (!canContinue) return;
    setProgram({
      id: major.id,
      major: major.name,
      doubleMajor: doubleMajor?.name ?? null,
      doubleMajorId: doubleMajor?.id ?? null,
      minor: minor?.name ?? null,
      minorId: minor?.id ?? null,
      extras: extras.filter(e => e.type && e.program).map(e => ({ type: e.type!, id: e.program!.id, name: e.program!.name })),
      coopStream,
      startTerm: startTerm!,
    });
    onContinue();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, padding: '28px 48px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: '700px', margin: 'auto' }}>
        <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', margin: '0 0 20px', fontWeight: 400, lineHeight: 1, animation: 'headingReveal 0.5s ease forwards' }}>
          select your program...
        </h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <ProgramSelector typeLabel="MAJOR"        options={MAJORS} selected={major} onSelect={setMajor} disabledIds={majorDisabled} isOpen={openKey === 'major'}  onToggle={() => toggle('major')} />
          <ProgramSelector typeLabel="DOUBLE MAJOR" options={MAJORS} selected={doubleMajor} onSelect={setDoubleMajor} optional disabledIds={doubleMajorDisabled} isOpen={openKey === 'double'} onToggle={() => toggle('double')} />
          <ProgramSelector typeLabel="MINOR"        options={MINORS} selected={minor} onSelect={setMinor} optional disabledIds={minorDisabled} isOpen={openKey === 'minor'}  onToggle={() => toggle('minor')} />

          {extras.map((entry, i) => {
            const opt = EXTRA_OPTIONS.find(o => o.type === entry.type)!;
            return (
              <div key={i} style={{ position: 'relative', zIndex: openKey === `extra-${i}` ? 10 : 1, display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <ProgramSelector
                    typeLabel={opt.label}
                    options={opt.list}
                    selected={entry.program}
                    onSelect={p => updateExtra(i, { program: p })}
                    optional
                    disabledIds={getExtraDisabled(i, entry.type!)}
                    isOpen={openKey === `extra-${i}`}
                    onToggle={() => toggle(`extra-${i}`)}
                  />
                </div>
                <span onClick={() => removeExtra(i)} style={{ fontFamily: MONO, fontSize: '22px', color: '#858080', cursor: 'pointer', paddingTop: '16px', lineHeight: 1 }}>×</span>
              </div>
            );
          })}

          {/* SOMETHING ELSE? — acts as its own dropdown for type selection */}
          <div style={{ position: 'relative', zIndex: openKey === 'add-extra' ? 10 : 1 }}>
            <div
              onClick={() => toggle('add-extra')}
              style={{
                border: `1px dashed ${openKey === 'add-extra' ? '#000' : '#858080'}`,
                borderRadius: openKey === 'add-extra' ? '20px 20px 0 0' : '20px',
                padding: '10px 16px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', textTransform: 'uppercase' }}>SOMETHING ELSE?</div>
                <div style={{ fontFamily: SANS, fontSize: '17px', color: '#858080', marginTop: '3px' }}>+ add another credential</div>
              </div>
              <ChevronDown color="#858080" />
            </div>
            {openKey === 'add-extra' && (
              <div style={{ position: 'absolute', left: 0, right: 0, background: '#fff', border: '1px solid #d9d9d9', borderTop: 'none', borderRadius: '0 0 20px 20px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
                {EXTRA_OPTIONS.map((o, j) => (
                  <div
                    key={o.type}
                    onClick={() => { addExtra(o.type); setOpenKey(`extra-${extras.length}`); }}
                    style={{ padding: '14px 20px', cursor: 'pointer', fontFamily: SANS, fontSize: '18px', color: '#858080', borderBottom: j < EXTRA_OPTIONS.length - 1 ? '1px solid #f0f0f0' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                  >{o.label.charAt(0) + o.label.slice(1).toLowerCase()}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#858080', marginBottom: '8px' }}>CO-OP STREAM</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(['1', '2', '3', '4', 'none'] as const).map(s => (
                <div
                  key={s}
                  onClick={() => setCoopStream(prev => prev === s ? null : s)}
                  style={{
                    background: coopStream === s ? '#000' : '#d9d9d9',
                    color: coopStream === s ? '#fff' : '#858080',
                    borderRadius: '40px', padding: '6px 16px',
                    fontFamily: SANS, fontSize: '14px',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                >{s === 'none' ? 'None' : s}</div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', zIndex: openKey === 'study-level' ? 10 : 1 }}>
            <div style={{ fontFamily: MONO, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#858080', marginBottom: '8px' }}>START TERM</div>
            <div
              onClick={() => toggle('study-level')}
              style={{
                background: startTerm ? '#000' : '#d9d9d9',
                borderRadius: '40px',
                padding: '6px 16px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontFamily: SANS, fontSize: '14px', color: startTerm ? '#fff' : '#858080' }}>
                {startTerm ?? 'select...'}
              </span>
              <ChevronDown color={startTerm ? '#fff' : '#858080'} />
            </div>
            {openKey === 'study-level' && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: '4px', background: '#fff', border: '1px solid #d9d9d9', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
                {START_TERMS.map((t, i) => (
                  <div
                    key={t}
                    onClick={() => { setStartTerm(t); toggle('study-level'); }}
                    style={{
                      padding: '10px 16px',
                      fontFamily: MONO, fontSize: '15px',
                      color: startTerm === t ? '#000' : '#858080',
                      background: startTerm === t ? '#f5f5f5' : '#fff',
                      borderBottom: i < START_TERMS.length - 1 ? '1px solid #f0f0f0' : 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                    onMouseLeave={e => (e.currentTarget.style.background = startTerm === t ? '#f5f5f5' : '#fff')}
                  >{t}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            style={{
              background: canContinue ? '#d9d9d9' : '#f0f0f0',
              border: 'none',
              borderRadius: '40px',
              height: '58px',
              padding: '0 40px',
              fontFamily: SANS,
              fontSize: '20px',
              cursor: canContinue ? 'pointer' : 'default',
              color: canContinue ? '#000' : '#858080',
            }}
          >
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

function TranscriptImport({ courses, coursesStatus, onContinue, onBack }: { courses: { code: string; name: string }[]; coursesStatus: 'loading' | 'ok' | 'error'; onContinue: () => void; onBack: () => void }) {
  const { setCompletedCourses, setSemesterPlans, program } = useApp();
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
                transition: 'background 0.15s', whiteSpace: 'nowrap',
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
                cursor: 'pointer', transition: 'background 0.15s', gap: '10px',
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
                  transition: 'border-color 0.15s, background 0.15s',
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
                        style={{ color: 'rgba(255,255,255,0.45)', fontSize: '15px', cursor: 'pointer', lineHeight: 1, background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', transition: 'color 0.1s' }}
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
                      transition: 'border-color 0.15s, color 0.15s',
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '40px' }}>
          <button
            onClick={onBack}
            style={{ background: '#d9d9d9', border: 'none', borderRadius: '40px', height: '58px', padding: '0 35px', fontFamily: SANS, fontSize: '20px', cursor: 'pointer', color: '#000' }}
          >← back</button>
          <button
            onClick={() => {
              setCompletedCourses(allAdded);
              setSemesterPlans(Object.fromEntries(
                Object.entries(termCourses).filter(([t]) => /^[WFS]\d{2}$/.test(t))
              ));
              onContinue();
            }}
            style={{ background: '#000', border: 'none', borderRadius: '40px', height: '58px', padding: '0 35px', fontFamily: SANS, fontSize: '20px', cursor: 'pointer', color: '#fff' }}
          >confirm and continue</button>
        </div>
      </div>
    </div>
  );
}

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const { courses, coursesStatus } = useApp();

  return (
    <div style={{ display: 'flex', flex: 1, background: '#fff', justifyContent: 'center' }}>
      <div style={{ display: step === 0 ? 'flex' : 'none', flex: 1 }}>
        <ProgramSelect onContinue={() => setStep(1)} />
      </div>
      <div style={{ display: step === 1 ? 'flex' : 'none', flex: 1 }}>
        <TranscriptImport courses={courses} coursesStatus={coursesStatus} onContinue={onComplete} onBack={() => setStep(0)} />
      </div>
    </div>
  );
}
