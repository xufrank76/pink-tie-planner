'use client';

import { useState } from 'react';
import { useApp } from '@/src/context/AppContext';
import type { SavedPlan } from '@/src/context/AppContext';
import type { UserProgram } from '@/src/context/AppContext';
import type { PageId } from '@/src/components/Sidebar';
import { effectivePlanEndTerm } from '@/src/lib/planTerms';
import { useProgramForm, ProgramFormFields } from '@/src/components/ProgramForm';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';
const PINK = '#c60078';

// ── helpers ───────────────────────────────────────────────────────────────────

function totalCourses(plan: SavedPlan): number {
  return Object.values(plan.semesterPlans).reduce((s, v) => s + v.length, 0);
}

// ── PlanProgramModal ──────────────────────────────────────────────────────────

function PlanProgramModal({ plan, globalProgram, onSave, onReset, onCancel }: {
  plan: SavedPlan;
  globalProgram: UserProgram;
  onSave: (p: UserProgram) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const form = useProgramForm(plan.programOverride ?? globalProgram);
  const { canSave, buildProgram } = form;

  function handleSave() {
    const p = buildProgram();
    if (p) onSave(p);
  }

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '40px 0' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '20px', padding: '32px', width: '520px', display: 'flex', flexDirection: 'column', gap: '4px' }}
      >
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: SANS, fontSize: '28px', color: '#000' }}>customize program</div>
          <div style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', marginTop: '4px' }}>{plan.name}</div>
        </div>

        <ProgramFormFields form={form} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={onCancel} style={{ flex: 1, background: 'transparent', color: '#858080', border: '1.5px solid #d9d9d9', borderRadius: '40px', padding: '12px 20px', fontFamily: SANS, fontSize: '14px', cursor: 'pointer' }}>
              cancel
            </button>
            <button onClick={handleSave} disabled={!canSave} style={{ flex: 1, background: canSave ? '#000' : '#ececec', color: canSave ? '#fff' : '#858080', border: 'none', borderRadius: '40px', padding: '12px 20px', fontFamily: SANS, fontSize: '14px', cursor: canSave ? 'pointer' : 'default' }}>
              save
            </button>
          </div>
          {plan.programOverride && (
            <button onClick={onReset} style={{ background: 'transparent', color: '#858080', border: 'none', fontFamily: SANS, fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', padding: '4px 0' }}>
              reset to global default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

function DeleteModal({ planName, onConfirm, onCancel }: { planName: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '20px', padding: '36px 36px 28px', width: '360px', display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        <div style={{ fontFamily: SANS, fontSize: '28px', fontWeight: 400, color: '#000' }}>delete plan?</div>
        <div style={{ fontFamily: SANS, fontSize: '15px', color: '#858080', lineHeight: 1.5 }}>
          Are you sure you want to delete <span style={{ color: '#000' }}>{planName}</span>? This can't be undone.
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <button onClick={onCancel} style={{ flex: 1, background: 'transparent', color: '#858080', border: '1.5px solid #d9d9d9', borderRadius: '40px', padding: '12px 20px', fontFamily: SANS, fontSize: '15px', cursor: 'pointer' }}>
            cancel
          </button>
          <button onClick={onConfirm} style={{ flex: 1, background: PINK, color: '#fff', border: 'none', borderRadius: '40px', padding: '12px 20px', fontFamily: SANS, fontSize: '15px', cursor: 'pointer' }}>
            delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PlanCard ──────────────────────────────────────────────────────────────────

function PlanCard({ plan, isActive, globalProgram, onSwitch, onClone, onDelete, onRename, onSetOverride, canDelete }: {
  plan: SavedPlan;
  isActive: boolean;
  globalProgram: UserProgram;
  onSwitch: () => void;
  onClone: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
  onSetOverride: (p: UserProgram | null) => void;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(plan.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editProgram, setEditProgram] = useState(false);

  const effectiveProg = plan.programOverride ?? globalProgram;
  const gradTerm = effectivePlanEndTerm(plan.planEndTerm, effectiveProg);
  const n = totalCourses(plan);

  const programLabel = (() => {
    const parts = [effectiveProg.major];
    if (effectiveProg.minor) parts.push(effectiveProg.minor);
    return parts.join(' · ');
  })();

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== plan.name) onRename(trimmed);
    else setDraft(plan.name);
    setEditing(false);
  }

  return (
    <>
      {confirmDelete && <DeleteModal planName={plan.name} onConfirm={() => { setConfirmDelete(false); onDelete(); }} onCancel={() => setConfirmDelete(false)} />}
      {editProgram && <PlanProgramModal plan={plan} globalProgram={globalProgram} onSave={p => { onSetOverride(p); setEditProgram(false); }} onReset={() => { onSetOverride(null); setEditProgram(false); }} onCancel={() => setEditProgram(false)} />}
      <div style={{
        background: '#fff',
        borderRadius: '20px',
        border: isActive ? '2px solid #000' : '2px solid #ececec',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        minWidth: '260px',
        maxWidth: '320px',
        flex: '1 1 260px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(plan.name); setEditing(false); } }}
              style={{ fontFamily: SANS, fontSize: '20px', color: '#000', border: 'none', borderBottom: '1px solid #000', outline: 'none', background: 'transparent', width: '100%' }}
            />
          ) : (
            <div
              onClick={() => { setDraft(plan.name); setEditing(true); }}
              title="Click to rename"
              style={{ fontFamily: SANS, fontSize: '20px', color: '#000', cursor: 'text', flex: 1 }}
            >
              {plan.name}
            </div>
          )}
          {isActive && (
            <div style={{ background: PINK, color: '#fff', borderRadius: '40px', padding: '3px 10px', fontFamily: MONO, fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0 }}>
              active
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div
            onClick={() => setEditProgram(true)}
            title="Customize this plan's program"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderRadius: '8px', padding: '4px 0' }}
            onMouseEnter={e => { const s = e.currentTarget.querySelector('span span') as HTMLElement | null; if (s) s.style.color = '#000'; }}
            onMouseLeave={e => { const s = e.currentTarget.querySelector('span span') as HTMLElement | null; if (s) s.style.color = plan.programOverride ? '#000' : '#858080'; }}
          >
            <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>program</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontFamily: MONO, fontSize: '13px', color: plan.programOverride ? '#000' : '#858080', maxWidth: '150px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {plan.programOverride ? programLabel : '(global)'}
              </span>
              <span style={{ fontFamily: MONO, fontSize: '11px', color: '#858080' }}>▾</span>
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>grad target</span>
            <span style={{ fontFamily: MONO, fontSize: '13px', color: '#000' }}>{gradTerm}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: MONO, fontSize: '13px', color: '#858080' }}>courses planned</span>
            <span style={{ fontFamily: MONO, fontSize: '13px', color: '#000' }}>{n}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
          {!isActive && (
            <button
              onClick={onSwitch}
              style={{ flex: 1, background: '#000', color: '#fff', border: 'none', borderRadius: '40px', padding: '10px 16px', fontFamily: SANS, fontSize: '14px', cursor: 'pointer' }}
            >
              switch to this
            </button>
          )}
          <button
            onClick={onClone}
            style={{ flex: isActive ? 1 : 0, background: '#ececec', color: '#000', border: 'none', borderRadius: '40px', padding: '10px 16px', fontFamily: SANS, fontSize: '14px', cursor: 'pointer' }}
          >
            clone
          </button>
          {canDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ background: 'transparent', color: '#858080', border: '1px solid #d9d9d9', borderRadius: '40px', padding: '10px 14px', fontFamily: SANS, fontSize: '14px', cursor: 'pointer' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── MyPlans page ──────────────────────────────────────────────────────────────

export default function MyPlans({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { program, savedPlans, activePlanId, createPlan, clonePlan, deletePlan, renamePlan, switchPlan, setPlanProgramOverride } = useApp();

  function handleSwitch(id: string) {
    switchPlan(id);
    onNavigate('degree-plan');
  }

  function handleClone(plan: SavedPlan) {
    const base = plan.name.replace(/\s+\d+$/, '');
    const nums = savedPlans
      .map(p => { const m = p.name.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`)); return m ? parseInt(m[1]) : null; })
      .filter((n): n is number => n !== null);
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 2;
    clonePlan(plan.id, `${base} ${next}`);
  }

  function handleNew() {
    createPlan(`Plan ${savedPlans.length + 1}`);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '48px 48px 32px', overflow: 'auto', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontFamily: SANS, fontSize: '52px', fontWeight: 400, lineHeight: 1.1 }}>
          my plans...
        </div>
        <button
          onClick={handleNew}
          style={{ background: '#000', color: '#fff', border: 'none', borderRadius: '40px', padding: '12px 24px', fontFamily: SANS, fontSize: '16px', cursor: 'pointer', flexShrink: 0 }}
        >
          + new plan
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        {savedPlans.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isActive={plan.id === activePlanId}
            globalProgram={program}
            onSwitch={() => handleSwitch(plan.id)}
            onClone={() => handleClone(plan)}
            onDelete={() => deletePlan(plan.id)}
            onRename={name => renamePlan(plan.id, name)}
            onSetOverride={p => setPlanProgramOverride(plan.id, p)}
            canDelete={savedPlans.length > 1}
          />
        ))}
      </div>
    </div>
  );
}
