'use client';

import { useState } from 'react';
import { useApp } from '@/src/context/AppContext';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

export default function About() {
  const { program } = useApp();
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);

  const programCtx = program.id ? [
    program.major,
    program.doubleMajor,
    program.minor,
    ...program.extras.map((e: { name: string }) => e.name),
  ].filter(Boolean).join(' + ') : undefined;

  return (
    <div style={{ flex: 1, padding: '32px 48px', overflowY: 'auto' }}>
      <h1 style={{ fontFamily: SANS, fontSize: '60px', color: '#000', lineHeight: 1, margin: '0 0 24px', fontWeight: 400 }}>
        about
      </h1>

      <div style={{ maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <p style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', lineHeight: 1.65, margin: 0 }}>
          Pink Tie Planner is a degree planner built for UW BMath students, combining the Undergraduate Calendar, UW Flow, UW Outline, Odyssey projected offerings, and your own personal planner into one unified experience.
        </p>
        <p style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', lineHeight: 1.65, margin: 0 }}>
          Built by a math student who was the edge case, struggling to figure out if combining Applied Math + ML with Biostats was even possible.
        </p>
        <p style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', lineHeight: 1.65, margin: 0 }}>
          Designed for the 2A student declaring their major, the upper year looking to switch, and everyone in between navigating 16 majors worth of confusing nested requirements.
        </p>
        <p style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', lineHeight: 1.65, margin: 0 }}>
          This project is my debut in my pivot towards product design, going through the full end-to-end UX lifecycle: user research, personas, affinity mapping, journey mapping, wireframes, and prototyping, all the way to a shipped product. Stay tuned for the full case study!
        </p>
        <p style={{ fontFamily: SANS, fontSize: '16px', color: '#858080', lineHeight: 1.65, margin: 0 }}>
          Pink Tie Planner relies on user testing to catch logic errors: degree requirements are complex and edge cases are everywhere. If something looks wrong — an incorrect requirement, miscounted courses, a missing plan, or anything off — feedback is super welcome! Use the{' '}
          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLSdo6gwJyp-vFjHKHWKG58bSh_cBHbf_cMBeATuBm6Gtc-ERpw/viewform?usp=dialog"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#858080', textDecoration: 'underline' }}
          >survey link</a> or the box below, or reach out directly.
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
              onChange={e => { setFeedbackText(e.target.value); setFeedbackError(false); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
              placeholder="describe the issue or suggestion..."
              rows={4}
              style={{ fontFamily: SANS, fontSize: '15px', color: '#000', background: '#ececec', border: 'none', borderRadius: '15px', padding: '14px 18px', outline: 'none', resize: 'none', lineHeight: 1.55, width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}
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
                setFeedbackSending(true);
                setFeedbackError(false);
                try {
                  const res = await fetch('/api/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: feedbackText, context: { program: programCtx, page: 'about' } }),
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
                background: feedbackText.trim() && !feedbackSending ? '#000' : '#ececec',
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

        <div style={{ borderTop: '1px solid #ececec', paddingTop: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 style={{ fontFamily: MONO, fontSize: '13px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
            Disclaimers
          </h2>
          {[
            'prereq and enrollment restriction checking is best-effort — always verify your final course selections with human judgement.',
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

        <p style={{ fontFamily: SANS, fontSize: '15px', color: '#858080', lineHeight: 1.6, margin: 0 }}>
          Built by{' '}
          <a
            href="https://www.linkedin.com/in/frankxu-/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#858080', textDecoration: 'underline' }}
          >Frank Xu</a>.
        </p>
      </div>
    </div>
  );
}
