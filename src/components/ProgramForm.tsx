'use client';

import { useState, useMemo } from 'react';
import type { UserProgram, ExtraCredential } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

// ── shared data ───────────────────────────────────────────────────────────────

export interface ProgramEntry { id: string; name: string; code: string; isMinor: boolean; isSpecialization: boolean }
const ALL = (Object.values(rawPrograms) as ProgramEntry[]).filter(p => !!p.id);

export function majorDisplayName(p: ProgramEntry) {
  if (p.isSpecialization && p.code.startsWith('H-'))
    return p.name.replace(/ - (.+?) Specialization \(.*\)/, ' ($1)');
  return p.name
    .replace(' (Bachelor of Mathematics - Honours)', ' (Honours)')
    .replace(' (Joint Honours)', ' (Joint)');
}

function specDisplayName(p: ProgramEntry): string {
  const prefix = p.code.split('-')[0];
  const parent = SPEC_PARENT[prefix];
  return parent ? `${p.name} (${parent})` : p.name;
}

export const MAJORS: ProgramEntry[] = ALL
  .filter(p => !p.isMinor && (!p.isSpecialization || (p.code.startsWith('H-') && !p.code.includes('FARM'))))
  .map(p => ({ ...p, name: majorDisplayName(p) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const MINORS: ProgramEntry[] = ALL
  .filter(p => p.isMinor)
  .sort((a, b) => a.name.localeCompare(b.name));

export const SPEC_PARENT: Record<string, string> = {
  'MS':    'Mathematical Studies',
  'ACTSC': 'Actuarial Science',
  'AMATH': 'Applied Mathematics',
};

export const SPEC_PARENT_MAJOR_IDS: Record<string, string[]> = {
  'MS':    ['H1z0kJR0in'],
  'ACTSC': ['HkeH1JRCjh'],
  'AMATH': ['r1lByy00sh'],
};

const SPECIALIZATIONS: ProgramEntry[] = ALL
  .filter(p => p.isSpecialization && !p.code.startsWith('H-'))
  .map(p => ({ ...p, name: specDisplayName(p) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const JOINT_PAIRS: Record<string, string> = {
  'HkeH1JRCjh': 'ryHykRAi3',  'ryHykRAi3': 'HkeH1JRCjh',
  'r1lByy00sh': 'SJgSyJC0s2', 'SJgSyJC0s2': 'r1lByy00sh',
  'SyeD110Co2': 'HJmwyyA0o2', 'HJmwyyA0o2': 'SyeD110Co2',
  'S1eexkCAo2': 'S1fxe1ACi2', 'S1fxe1ACi2': 'S1eexkCAo2',
  'H1XegyCAin': 'BybggJARoh', 'BybggJARoh': 'H1XegyCAin',
};

const MATH_MAJOR_IDS = new Set([
  'HkeH1JRCjh','r1lByy00sh','ByBkJCRs2','SkUkJR0oh','SyeD110Co2',
  'rkDkJCAj2','HymD11R0j3','BJx01yRCin','ryAkJARjn','ByzRyy0Rj2',
  'Byl0k1ACin','S1eexkCAo2','H1XegyCAin','r1gAJJ0Cin','H1z0kJR0in',
  'ryHykRAi3','SJgSyJC0s2','HJmwyyA0o2','S1fxe1ACi2','BybggJARoh',
  'H1gRk1ARih','Sy0ky0Rsn',
]);

export function getBlockedIds(majorId: string | undefined): { doubleMajors: Set<string>; minors: Set<string> } {
  const doubleMajors = new Set<string>();
  const minors = new Set<string>();
  if (!majorId) return { doubleMajors, minors };
  const bm = (...ids: string[]) => ids.forEach(id => { if (id !== majorId) doubleMajors.add(id); });
  const bn = (...ids: string[]) => ids.forEach(id => minors.add(id));
  switch (majorId) {
    case 'HymD11R0j3': MATH_MAJOR_IDS.forEach(id => { if (id !== majorId) doubleMajors.add(id); }); bn('rJbgx1RAs3'); break;
    case 'H1z0kJR0in': MATH_MAJOR_IDS.forEach(id => { if (id !== majorId) doubleMajors.add(id); }); break;
    case 'r1gAJJ0Cin': MATH_MAJOR_IDS.forEach(id => { if (id !== majorId) doubleMajors.add(id); }); bn('rk7AJJ0Ain'); break;
    case 'HkeH1JRCjh': case 'ryHykRAi3': bm('HymD11R0j3'); bn('SyxByJ00o3'); break;
    case 'r1lByy00sh': case 'SJgSyJC0s2': bm('ByBkJCRs2','HymD11R0j3','ByzRyy0Rj2'); bn('rkGHJk0Ci2'); break;
    case 'ByBkJCRs2': bm('r1lByy00sh','SJgSyJC0s2','rkDkJCAj2','ByzRyy0Rj2','HymD11R0j3'); bn('rkGHJk0Ci2','SkZPkyCAjh'); break;
    case 'SkUkJR0oh': bm('HymD11R0j3','BybggJARoh','H1XegyCAin'); bn('rJbgx1RAs3'); break;
    case 'SyeD110Co2': case 'HJmwyyA0o2': bm('H1gRk1ARih','Sy0ky0Rsn','HymD11R0j3'); bn('H1D1JR0s2'); break;
    case 'rkDkJCAj2': bm('ByBkJCRs2','HymD11R0j3'); bn('SkZPkyCAjh'); break;
    case 'ryAkJARjn': bm('HymD11R0j3'); bn('SyxByJ00o3'); break;
    case 'H1gRk1ARih': case 'Sy0ky0Rsn': bm('SyeD110Co2','HJmwyyA0o2','HymD11R0j3'); bn('H1D1JR0s2'); break;
    case 'ByzRyy0Rj2': bm('r1lByy00sh','SJgSyJC0s2','ByBkJCRs2','HymD11R0j3'); bn('rkGHJk0Ci2'); break;
    case 'S1eexkCAo2': case 'S1fxe1ACi2': bm('HymD11R0j3'); bn('SJlxk0Ci2'); break;
    case 'H1XegyCAin': case 'BybggJARoh': bm('SkUkJR0oh','HymD11R0j3'); bn('rJbgx1RAs3'); break;
    case 'BJx01yRCin': bm('HymD11R0j3'); break;
    case 'Byl0k1ACin': bm('HymD11R0j3'); break;
  }
  if (MATH_MAJOR_IDS.has(majorId)) {
    if (majorId !== 'r1gAJJ0Cin') doubleMajors.add('r1gAJJ0Cin');
    if (majorId !== 'H1z0kJR0in') doubleMajors.add('H1z0kJR0in');
  }
  return { doubleMajors, minors };
}

function getStartTerms() {
  const yr = new Date().getFullYear();
  return Array.from({ length: 7 }, (_, i) => `F${String(yr - 5 + i).slice(-2)}`);
}
export const START_TERMS = getStartTerms();

type ExtraType = 'major' | 'minor' | 'specialization';
type ExtraEntry = { type: ExtraType | null; program: ProgramEntry | null };
export const EXTRA_OPTIONS: { type: ExtraType; label: string; list: ProgramEntry[] }[] = [
  { type: 'major',          label: 'MAJOR',          list: MAJORS },
  { type: 'minor',          label: 'MINOR',          list: MINORS },
  { type: 'specialization', label: 'SPECIALIZATION', list: SPECIALIZATIONS },
];

// ── ChevronDown ───────────────────────────────────────────────────────────────

export function ChevronDown({ color }: { color: string }) {
  return (
    <svg width={14} height={12} viewBox="0 0 14 12" fill={color} style={{ transform: 'rotate(180deg)', flexShrink: 0 }}>
      <path d="M 5.215 3.534 C 5.955 2.069 8.045 2.069 8.785 3.534 L 11.596 9.098 C 12.268 10.428 11.301 12 9.811 12 L 4.189 12 C 2.699 12 1.732 10.428 2.404 9.098 L 5.215 3.534 Z" />
    </svg>
  );
}

// ── ProgramSelector ───────────────────────────────────────────────────────────

export function ProgramSelector({ typeLabel, options, selected, onSelect, optional, disabledIds, isOpen, onToggle }: {
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
        style={{ background: '#d9d9d9', borderRadius: isOpen ? '20px 20px 0 0' : '20px', padding: '10px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}
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
            {optional && (
              <div
                onClick={() => { onSelect(null); onToggle(); setQ(''); }}
                onMouseEnter={() => setHoveredId('__blank__')}
                onMouseLeave={() => setHoveredId(null)}
                style={{ padding: '12px 20px', cursor: 'pointer', fontFamily: SANS, fontSize: '15px', color: hoveredId === '__blank__' ? '#000' : '#858080', background: hoveredId === '__blank__' ? '#f0f0f0' : '#fff', borderBottom: '1px solid #f0f0f0' }}
              >—</div>
            )}
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

// ── useProgramForm ────────────────────────────────────────────────────────────

export function useProgramForm(initial?: UserProgram) {
  const initMajor = initial ? MAJORS.find(p => p.id === initial.id) ?? null : null;
  const initDoubleMajor = initial?.doubleMajorId ? MAJORS.find(p => p.id === initial.doubleMajorId) ?? null : null;
  const initMinor = initial?.minorId ? MINORS.find(p => p.id === initial.minorId) ?? null : null;
  const initExtras: ExtraEntry[] = initial?.extras.map(e => {
    const list = e.type === 'major' ? MAJORS : e.type === 'minor' ? MINORS : SPECIALIZATIONS;
    const program = list.find(p => p.id === e.id) ?? null;
    return { type: e.type as ExtraType, program };
  }) ?? [];

  const [major, setMajor] = useState<ProgramEntry | null>(initMajor);
  const [doubleMajor, setDoubleMajor] = useState<ProgramEntry | null>(initDoubleMajor);
  const [minor, setMinor] = useState<ProgramEntry | null>(initMinor);
  const [extras, setExtras] = useState<ExtraEntry[]>(initExtras);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [coopStream, setCoopStream] = useState<UserProgram['coopStream']>(initial?.coopStream ?? null);
  const [startTerm, setStartTerm] = useState<string | null>(initial?.startTerm ?? null);

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
        ...blocked.doubleMajors, ...doubleMajorBlocked.doubleMajors, ...selectedMajorIds,
        ...(majorJoint ? [majorJoint] : []), ...(doubleMajorJoint ? [doubleMajorJoint] : []),
        ...minorConflictMajors, ...otherExtraMajorConflicts, ...otherExtraJointPairs,
      ]);
      const conflictsWithMinor = ownId ? minorConflictMajors.has(ownId) : false;
      if (ownId && !otherExtrasHaveOwn && !primaryHasOwn && !conflictsWithMinor) ids.delete(ownId);
      return ids;
    }
    if (type === 'minor') {
      const otherExtraMajorBlockedMinors = extras
        .filter((e, j) => j !== i && e.type === 'major' && e.program)
        .flatMap(e => [...getBlockedIds(e.program!.id).minors]);
      const ids = new Set([...blocked.minors, ...doubleMajorBlocked.minors, ...selectedMinorIds, ...otherExtraMajorBlockedMinors]);
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
  const canSave = !!major && !!startTerm && !hasUnpairedJoint;

  function buildProgram(): UserProgram | null {
    if (!major || !startTerm) return null;
    return {
      id: major.id,
      major: major.name,
      doubleMajor: doubleMajor?.name ?? null,
      doubleMajorId: doubleMajor?.id ?? null,
      minor: minor?.name ?? null,
      minorId: minor?.id ?? null,
      extras: extras.filter(e => e.type && e.program).map(e => ({ type: e.type!, id: e.program!.id, name: e.program!.name } as ExtraCredential)),
      coopStream,
      startTerm,
    };
  }

  return {
    major, setMajor,
    doubleMajor, setDoubleMajor,
    minor, setMinor,
    extras, addExtra, removeExtra, updateExtra,
    openKey, toggle,
    coopStream, setCoopStream,
    startTerm, setStartTerm,
    majorDisabled, doubleMajorDisabled, minorDisabled, getExtraDisabled,
    canSave, buildProgram,
  };
}

// ── ProgramFormFields ─────────────────────────────────────────────────────────

export function ProgramFormFields({ form }: { form: ReturnType<typeof useProgramForm> }) {
  const {
    major, setMajor, doubleMajor, setDoubleMajor, minor, setMinor,
    extras, addExtra, removeExtra, updateExtra,
    openKey, toggle, coopStream, setCoopStream, startTerm, setStartTerm,
    majorDisabled, doubleMajorDisabled, minorDisabled, getExtraDisabled,
  } = form;

  return (
    <>
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

        <div style={{ position: 'relative', zIndex: openKey === 'add-extra' ? 10 : 1 }}>
          <div
            onClick={() => toggle('add-extra')}
            style={{ border: `1px dashed ${openKey === 'add-extra' ? '#000' : '#858080'}`, borderRadius: openKey === 'add-extra' ? '20px 20px 0 0' : '20px', padding: '10px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
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
                  onClick={() => { addExtra(o.type); toggle(`extra-${extras.length}`); }}
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
                style={{ background: coopStream === s ? '#000' : '#d9d9d9', color: coopStream === s ? '#fff' : '#858080', borderRadius: '40px', padding: '6px 16px', fontFamily: SANS, fontSize: '14px', cursor: 'pointer', transition: 'background 0.15s, opacity 0.15s' }}
              >{s === 'none' ? 'None' : s}</div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', zIndex: openKey === 'study-level' ? 10 : 1 }}>
          <div style={{ fontFamily: MONO, fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#858080', marginBottom: '8px' }}>START TERM</div>
          <div
            onClick={() => toggle('study-level')}
            style={{ background: startTerm ? '#000' : '#d9d9d9', borderRadius: '40px', padding: '6px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span style={{ fontFamily: SANS, fontSize: '14px', color: startTerm ? '#fff' : '#858080' }}>{startTerm ?? 'select...'}</span>
            <ChevronDown color={startTerm ? '#fff' : '#858080'} />
          </div>
          {openKey === 'study-level' && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: '4px', background: '#fff', border: '1px solid #d9d9d9', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
              {START_TERMS.map((t, i) => (
                <div
                  key={t}
                  onClick={() => { setStartTerm(t); toggle('study-level'); }}
                  style={{ padding: '10px 16px', fontFamily: MONO, fontSize: '15px', color: startTerm === t ? '#000' : '#858080', background: startTerm === t ? '#f5f5f5' : '#fff', borderBottom: i < START_TERMS.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
                  onMouseLeave={e => (e.currentTarget.style.background = startTerm === t ? '#f5f5f5' : '#fff')}
                >{t}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
