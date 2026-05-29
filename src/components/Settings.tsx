'use client';

import { useState } from 'react';
import { useApp } from '@/src/context/AppContext';
import { scheduleClearOnNextLoad } from '@/src/lib/planPersistence';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

export default function Settings() {
  const { program, restartProgramSelection, courseOverrides, addCourseOverride, removeCourseOverride, semesterPlans, showDifficultyScore, setShowDifficultyScore } = useApp();
  const [overrideInput, setOverrideInput] = useState('');
  const [confirmErase, setConfirmErase] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);

  const planCourses = [...new Set(Object.values(semesterPlans).flat())].sort();
  const suggestions = overrideInput
    ? planCourses.filter(c => c.startsWith(overrideInput) && !courseOverrides.has(c))
    : [];

  return (
    <div style={{ flex: 1, padding: '32px 48px', overflowY: 'auto' }}>
      <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', lineHeight: 1, margin: '0 0 24px', fontWeight: 400 }}>
        settings
      </h1>

      <section style={{ maxWidth: '560px', marginBottom: '40px' }}>
        <h2 style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
          Program
        </h2>
        <p style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', lineHeight: 1.55, margin: '0 0 16px' }}>
          Go through program setup again to change your major, minor, co-op stream, or start term. Your timeline and completed courses are preserved.
        </p>
        <p style={{ fontFamily: MONO, fontSize: '14px', color: '#000', margin: '0 0 16px', lineHeight: 1.6 }}>
          {program.id ? [
            program.major,
            program.doubleMajor,
            program.minor,
            ...program.extras.map(e => e.name),
            program.coopStream && program.coopStream !== 'none' ? `co-op sequence ${program.coopStream}` : null,
            program.startTerm ? `starting ${program.startTerm}` : null,
          ].filter(Boolean).join(' · ') : '—'}
        </p>
        <button
          type="button"
          onClick={() => restartProgramSelection()}
          style={{
            background: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '40px',
            height: '52px',
            padding: '0 28px',
            fontFamily: SANS,
            fontSize: '18px',
            cursor: 'pointer',
          }}
        >
          change program…
        </button>
      </section>

      <section style={{ maxWidth: '560px', marginBottom: '40px' }}>
        <h2 style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
          add an override
        </h2>
        <p style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', lineHeight: 1.55, margin: '0 0 16px' }}>
          Courses added here won't be flagged pink in your degree plan, even if there's a scheduling issue.
        </p>
        <div style={{ position: 'relative', display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              value={overrideInput}
              onChange={e => setOverrideInput(e.target.value.toUpperCase().replace(/\s+/g, ''))}
              onKeyDown={e => {
                if (e.key === 'Enter' && suggestions[0]) { addCourseOverride(suggestions[0]); setOverrideInput(''); }
                if (e.key === 'Escape') setOverrideInput('');
              }}
              placeholder="search your plan..."
              style={{ fontFamily: MONO, fontSize: '15px', background: '#ececec', border: 'none', borderRadius: '15px', padding: '10px 16px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
            {suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: '#fff', border: '1px solid #ececec', borderRadius: '15px', overflow: 'hidden', zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                {suggestions.slice(0, 8).map(code => (
                  <div
                    key={code}
                    onClick={() => { addCourseOverride(code); setOverrideInput(''); }}
                    style={{ padding: '10px 16px', fontFamily: MONO, fontSize: '14px', color: '#000', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    {code}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {courseOverrides.size > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {[...courseOverrides].map(code => (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ececec', borderRadius: '40px', padding: '6px 14px', fontFamily: MONO, fontSize: '14px', color: '#000' }}>
                {code}
                <span onClick={() => removeCourseOverride(code)} style={{ cursor: 'pointer', opacity: 0.5, fontSize: '16px', lineHeight: 1 }}>×</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ maxWidth: '560px', marginBottom: '40px' }}>
        <h2 style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
          Difficulty score
        </h2>
        <p style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', lineHeight: 1.55, margin: '0 0 16px' }}>
          Show average difficulty score per semester based on UW Flow ratings. Scores may reflect sampling bias — use as a rough guide only.
        </p>
        <div
          onClick={() => setShowDifficultyScore(!showDifficultyScore)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{
            width: '44px', height: '24px', borderRadius: '40px',
            background: showDifficultyScore ? '#000' : '#d9d9d9',
            position: 'relative', transition: 'background 0.15s, opacity 0.15s', flexShrink: 0,
          }}>
            <div style={{
              position: 'absolute', top: '3px',
              left: showDifficultyScore ? '23px' : '3px',
              width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
              transition: 'left 0.15s',
            }} />
          </div>
          <span style={{ fontFamily: SANS, fontSize: '16px', color: '#000' }}>
            {showDifficultyScore ? 'on' : 'off'}
          </span>
        </div>
      </section>

      <section style={{ maxWidth: '560px', marginBottom: '40px' }}>
        <h2 style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
          All data
        </h2>
        <p style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', lineHeight: 1.55, margin: '0 0 16px' }}>
          Clears everything stored in this browser for pink tie planner (plan, favorites, onboarding). You will need to start from scratch.
        </p>
        {!confirmErase ? (
          <button
            type="button"
            onClick={() => setConfirmErase(true)}
            style={{ background: '#ececec', color: '#000', border: 'none', borderRadius: '40px', height: '52px', padding: '0 28px', fontFamily: SANS, fontSize: '18px', cursor: 'pointer' }}
          >
            erase saved plan & reload
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#fff3f3', border: '1px solid #fcc', borderRadius: '20px', padding: '20px 24px' }}>
            <p style={{ fontFamily: SANS, fontSize: '15px', color: '#c60078', margin: 0, lineHeight: 1.5 }}>
              this will permanently delete all your plans, courses, and onboarding data. this cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setConfirmErase(false)}
                style={{ background: 'transparent', color: '#858080', border: '1.5px solid #d9d9d9', borderRadius: '40px', height: '44px', padding: '0 24px', fontFamily: SANS, fontSize: '16px', cursor: 'pointer' }}
              >
                cancel
              </button>
              <button
                type="button"
                onClick={() => { scheduleClearOnNextLoad(); window.location.reload(); }}
                style={{ background: '#c60078', color: '#fff', border: 'none', borderRadius: '40px', height: '44px', padding: '0 24px', fontFamily: SANS, fontSize: '16px', cursor: 'pointer' }}
              >
                yes, erase everything
              </button>
            </div>
          </div>
        )}
      </section>

      <section style={{ maxWidth: '560px', marginBottom: '40px' }}>
        <h2 style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
          Feedback
        </h2>
        <p style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', lineHeight: 1.55, margin: '0 0 16px' }}>
          Found a bug, spotted an incorrect requirement, or have a suggestion? Tell us what's wrong or what could be better.
        </p>
        {feedbackSent ? (
          <div style={{ background: '#f0faf0', border: '1px solid #b8e6b8', borderRadius: '20px', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontFamily: SANS, fontSize: '15px', color: '#2a7a2a', margin: 0, lineHeight: 1.5 }}>
              feedback received — thanks!
            </p>
            <button
              type="button"
              onClick={() => { setFeedbackSent(false); setFeedbackText(''); setFeedbackError(false); }}
              style={{ alignSelf: 'flex-start', background: 'transparent', color: '#858080', border: '1.5px solid #d9d9d9', borderRadius: '40px', height: '36px', padding: '0 18px', fontFamily: SANS, fontSize: '14px', cursor: 'pointer' }}
            >
              send another
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <textarea
              value={feedbackText}
              onChange={e => { setFeedbackText(e.target.value); setFeedbackError(false); }}
              placeholder="describe the issue or suggestion..."
              rows={4}
              style={{ fontFamily: SANS, fontSize: '15px', color: '#000', background: '#ececec', border: 'none', borderRadius: '15px', padding: '14px 18px', outline: 'none', resize: 'vertical', lineHeight: 1.55, width: '100%', boxSizing: 'border-box' }}
            />
            {feedbackError && (
              <p style={{ fontFamily: SANS, fontSize: '14px', color: '#c60078', margin: 0 }}>
                something went wrong — try again.
              </p>
            )}
            <button
              type="button"
              disabled={!feedbackText.trim() || feedbackSending}
              onClick={async () => {
                const programCtx = program.id ? [
                  program.major,
                  program.doubleMajor,
                  program.minor,
                  ...program.extras.map(e => e.name),
                ].filter(Boolean).join(' + ') : undefined;
                setFeedbackSending(true);
                setFeedbackError(false);
                try {
                  const res = await fetch('/api/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: feedbackText, context: { program: programCtx, page: 'settings' } }),
                  });
                  if (!res.ok) throw new Error();
                  setFeedbackSent(true);
                  setFeedbackText('');
                } catch {
                  setFeedbackError(true);
                } finally {
                  setFeedbackSending(false);
                }
              }}
              style={{
                alignSelf: 'flex-start',
                background: feedbackText.trim() && !feedbackSending ? '#000' : '#d9d9d9',
                color: feedbackText.trim() && !feedbackSending ? '#fff' : '#858080',
                border: 'none',
                borderRadius: '40px',
                height: '52px',
                padding: '0 28px',
                fontFamily: SANS,
                fontSize: '18px',
                cursor: feedbackText.trim() && !feedbackSending ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              {feedbackSending ? 'sending…' : 'send feedback →'}
            </button>
          </div>
        )}
      </section>

      <section style={{ maxWidth: '560px' }}>
        <h2 style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
          About
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            'prereq and enrollment restriction checking is best-effort — always verify your course selections on Quest and with your academic advisor.',
            'triple-counting rules are not enforced. if you have 3 or more concurrent plans (majors/minors), check with an academic advisor.',
            'course offering and availability data comes from the UW Open Data API and may lag behind Quest.',
            'difficulty scores are from UW Flow community ratings and may reflect sampling bias.',
            'this tool is not affiliated with or endorsed by the University of Waterloo.',
          ].map((text, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', fontFamily: SANS, fontSize: '15px', color: '#858080', lineHeight: 1.6 }}>
              <span style={{ flexShrink: 0, marginTop: '1px' }}>–</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
