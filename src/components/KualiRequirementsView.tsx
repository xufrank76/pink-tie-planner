'use client';

import { useState, useEffect } from 'react';

const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';
const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';

function processHtml(
  raw: string,
  completedSet: Set<string>,
  planSet: Set<string>,
): string {
  let h = raw;

  // Kuali React comment artifacts
  h = h.replace(/<!-- -->/g, '');

  // Collapse buttons
  h = h.replace(/<button[^>]*>[\s\S]*?<\/button>/g, '');

  // Credit unit spans like (0.50)
  h = h.replace(/<span[^>]*style="margin-left:5px"[^>]*>\([^)]+\)<\/span>/g, '');

  // Section headers — convert <h2> to styled label
  h = h.replace(
    /<h2[^>]*><span>([^<]+)<\/span><\/h2>/g,
    `<div style="font-family:${MONO};font-size:11px;color:#858080;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">$1</div>`,
  );

  // Strip <header> wrapper and its outer <div> but keep inner content
  h = h.replace(/<header[^>]*>/g, '<div>');
  h = h.replace(/<\/header>/g, '</div>');

  // Course links → checkbox + code
  h = h.replace(
    /<a[^>]*href="#\/courses\/view\/[^"]*"[^>]*>([A-Z]{2,8}\d{3}[A-Z]?)<\/a>/g,
    (_, code: string) => {
      const done = completedSet.has(code);
      const planned = !done && planSet.has(code);
      const bg = done ? '#000' : planned ? '#858080' : '#d9d9d9';
      const tick = done ? '✓' : '';
      return (
        `<span style="display:inline-flex;align-items:center;gap:5px;vertical-align:middle">` +
        `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;` +
        `border-radius:4px;background:${bg};color:#fff;font-size:10px;font-family:${MONO};flex-shrink:0">${tick}</span>` +
        `<code style="font-family:${MONO};font-size:13px;color:#000">${code}</code>` +
        `</span>`
      );
    },
  );

  // Wrap the whole thing in a scoped div with list resets
  return (
    `<div style="font-family:${SANS};font-size:14px;line-height:1.7;color:#000">` +
    `<style>.kuali-req ul{list-style:none;margin:0;padding:0}.kuali-req li{margin:4px 0}` +
    `.kuali-req section{margin-bottom:12px}</style>` +
    `<div class="kuali-req">${h}</div>` +
    `</div>`
  );
}

export default function KualiRequirementsView({
  pid,
  completedSet,
  planSet,
}: {
  pid: string;
  completedSet: Set<string>;
  planSet: Set<string>;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setHtml(null);
    setError(false);
    fetch(`/api/kuali-requirements/${pid}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((d: { html?: string }) => setHtml(d.html ?? ''))
      .catch(() => setError(true));
  }, [pid]);

  if (error) {
    return (
      <div style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', padding: '4px 0' }}>
        Could not load requirements from calendar.
      </div>
    );
  }

  if (html === null) {
    return (
      <div style={{ fontFamily: SANS, fontSize: '13px', color: '#858080', padding: '4px 0' }}>
        Loading…
      </div>
    );
  }

  const processed = processHtml(html, completedSet, planSet);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: processed }}
    />
  );
}
