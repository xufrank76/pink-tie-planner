'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useApp, type FavFolder, DEFAULT_COURSES_FOLDER_ID, DEFAULT_PLANS_FOLDER_ID } from '@/src/context/AppContext';
import rawPrograms from '@/src/data/requirements-filtered.json';

const SANS = 'var(--font-dm-sans, "DM Sans", sans-serif)';
const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';
const PINK = '#c60078';

const programMap = rawPrograms as unknown as Record<string, { name: string; faculty?: string; isMinor?: boolean; isSpecialization?: boolean }>;

function programDisplayName(id: string): string {
  const v = programMap[id];
  if (!v) return id;
  const name = v.name ?? id;
  return name.includes('(') ? name.slice(0, name.indexOf('(')).trim() : name.trim();
}

function programType(id: string): string {
  const v = programMap[id];
  if (!v) return 'Major';
  if (v.isMinor) return 'Minor';
  if (v.isSpecialization) return 'Specialization';
  if ((v.name ?? '').toLowerCase().includes('joint')) return 'Joint';
  return 'Major';
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

function DeleteModal({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', padding: '36px 36px 28px', width: '360px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontFamily: SANS, fontSize: '28px', fontWeight: 400, color: '#000' }}>delete folder?</div>
        <div style={{ fontFamily: SANS, fontSize: '15px', color: '#858080', lineHeight: 1.5 }}>
          Delete <span style={{ color: '#000' }}>{name}</span>? The courses and plans inside won't be deleted.
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

// ── FolderCard ────────────────────────────────────────────────────────────────

function FolderCard({ folder, onClick, onRename, onDelete }: {
  folder: FavFolder;
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== folder.name) onRename(trimmed);
    else setDraft(folder.name);
    setEditing(false);
  }

  const courseCount = folder.courses.length;
  const planCount = folder.programs.length;
  const subtitle = [
    courseCount > 0 ? `${courseCount} course${courseCount !== 1 ? 's' : ''}` : '',
    planCount > 0 ? `${planCount} plan${planCount !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' · ') || 'empty';

  return (
    <>
      {confirmDelete && <DeleteModal name={folder.name} onConfirm={() => { setConfirmDelete(false); onDelete(); }} onCancel={() => setConfirmDelete(false)} />}
      <div
        style={{ display: 'flex', flexDirection: 'column', minWidth: '220px', maxWidth: '280px', flex: '1 1 220px', cursor: 'pointer' }}
        onClick={() => { if (!editing) onClick(); }}
      >
        {/* Folder tab */}
        <div style={{ height: '18px', width: '80px', background: '#d9d9d9', borderRadius: '8px 8px 0 0', marginLeft: '16px' }} />
        {/* Folder body */}
        <div style={{ background: '#ececec', borderRadius: '0 12px 12px 12px', padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '110px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(folder.name); setEditing(false); } }}
                onClick={e => e.stopPropagation()}
                style={{ fontFamily: SANS, fontSize: '17px', color: '#000', border: 'none', borderBottom: '1px solid #000', outline: 'none', background: 'transparent', width: '100%' }}
              />
            ) : (
              <div
                style={{ fontFamily: SANS, fontSize: '17px', color: '#000', flex: 1, wordBreak: 'break-word' }}
                onDoubleClick={e => { if (!folder.locked) { e.stopPropagation(); setDraft(folder.name); setEditing(true); } }}
              >
                {folder.name}
              </div>
            )}
            {!folder.locked && !editing && (
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                style={{ background: 'transparent', border: 'none', color: '#c0c0c0', fontSize: '14px', cursor: 'pointer', padding: '0', lineHeight: 1, flexShrink: 0 }}
              >
                ✕
              </button>
            )}
          </div>
          <div style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', marginTop: 'auto' }}>{subtitle}</div>
        </div>
      </div>
    </>
  );
}

// ── FolderDetail ──────────────────────────────────────────────────────────────

function FolderDetail({ folder, onClose, onRemoveCourse, onRemoveProgram }: {
  folder: FavFolder;
  onClose: () => void;
  onRemoveCourse: (code: string) => void;
  onRemoveProgram: (id: string) => void;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0', overflow: 'hidden', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '48px 48px 0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontFamily: SANS, fontSize: '52px', fontWeight: 400, lineHeight: 1.1 }}>
          {folder.name}
        </div>
        <button
          onClick={onClose}
          style={{ background: '#ececec', border: 'none', borderRadius: '40px', padding: '10px 20px', fontFamily: SANS, fontSize: '15px', color: '#000', cursor: 'pointer', flexShrink: 0, marginBottom: '8px' }}
        >
          ← all folders
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 48px 48px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {/* Courses section */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            courses · {folder.courses.length}
          </div>
          {folder.courses.length === 0 ? (
            <div style={{ fontFamily: SANS, fontSize: '15px', color: '#c0c0c0' }}>no courses saved</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {folder.courses.map(code => (
                <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ececec', borderRadius: '40px', padding: '6px 12px 6px 14px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '13px', color: '#000' }}>{code}</span>
                  <button
                    onClick={() => onRemoveCourse(code)}
                    style={{ background: 'transparent', border: 'none', color: '#858080', fontSize: '12px', cursor: 'pointer', padding: '0', lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Degree plans section */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: '11px', color: '#858080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            degree plans · {folder.programs.length}
          </div>
          {folder.programs.length === 0 ? (
            <div style={{ fontFamily: SANS, fontSize: '15px', color: '#c0c0c0' }}>no plans saved</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {folder.programs.map(id => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ececec', borderRadius: '40px', padding: '6px 12px 6px 14px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: '#858080', marginRight: '2px' }}>{programType(id)}</span>
                  <span style={{ fontFamily: SANS, fontSize: '14px', color: '#000' }}>{programDisplayName(id)}</span>
                  <button
                    onClick={() => onRemoveProgram(id)}
                    style={{ background: 'transparent', border: 'none', color: '#858080', fontSize: '12px', cursor: 'pointer', padding: '0', lineHeight: 1 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── FoldersPage ───────────────────────────────────────────────────────────────

export default function FoldersPage() {
  const { folders, createFolder, deleteFolder, renameFolder, removeCourseFromFolder, removeProgramFromFolder } = useApp();
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);

  const openFolder = useMemo(() => folders.find(f => f.id === openFolderId) ?? null, [folders, openFolderId]);

  if (openFolder) {
    return (
      <FolderDetail
        folder={openFolder}
        onClose={() => setOpenFolderId(null)}
        onRemoveCourse={code => removeCourseFromFolder(openFolder.id, code)}
        onRemoveProgram={id => removeProgramFromFolder(openFolder.id, id)}
      />
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '48px 48px 32px', overflow: 'auto', gap: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontFamily: SANS, fontSize: '52px', fontWeight: 400, lineHeight: 1.1 }}>folders...</div>
        <button
          onClick={() => createFolder(`Folder ${folders.filter(f => !f.locked).length + 1}`)}
          style={{ background: '#000', color: '#fff', border: 'none', borderRadius: '40px', padding: '12px 24px', fontFamily: SANS, fontSize: '16px', cursor: 'pointer', flexShrink: 0 }}
        >
          + new folder
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' }}>
        {folders.map(folder => (
          <FolderCard
            key={folder.id}
            folder={folder}
            onClick={() => setOpenFolderId(folder.id)}
            onRename={name => renameFolder(folder.id, name)}
            onDelete={() => deleteFolder(folder.id)}
          />
        ))}
      </div>
    </div>
  );
}
