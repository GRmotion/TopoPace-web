import { useState, useRef } from 'react';
import { parseTopoPace, serializeTopoPace, downloadFile } from '../utils/TopoPaceFile';
import type { TopoPaceFileData } from '../utils/TopoPaceFile';
import { parseRoute } from '../parsers/GpxParser';
import type { ParsedRoute } from '../parsers/GpxParser';

const STORAGE_KEY = 'topopace_trails';
export const AUTOSAVE_ENABLED_KEY = 'topopace_autosave';
export const AUTOSAVE_ID_KEY = 'topopace_autosave_id';

export type StoredTrail = TopoPaceFileData & { trailId: string };

export function loadTrails(): StoredTrail[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
export function persistTrails(trails: StoredTrail[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trails));
}
export function addTrailToLibrary(data: TopoPaceFileData): void {
  const trails = loadTrails();
  trails.unshift({ ...data, trailId: crypto.randomUUID(), savedAt: Date.now() });
  persistTrails(trails);
}

interface Props {
  onClose: () => void;
  onOpenTrail: (data: TopoPaceFileData) => void;
  onNewRoute: (route: ParsedRoute) => void;
  currentPlan: TopoPaceFileData | null;
  autoSave: boolean;
  onAutoSaveChange: (v: boolean) => void;
  autoSaveStatus: 'saving' | 'saved' | null;
}

export default function TrailsModal({ onClose, onOpenTrail, onNewRoute, currentPlan, autoSave, onAutoSaveChange }: Props) {
  const [trails, setTrails] = useState<StoredTrail[]>(() => loadTrails());
  const [removedTrail, setRemovedTrail] = useState<StoredTrail | null>(null);
  const undoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  function update(updated: StoredTrail[]) {
    setTrails(updated);
    persistTrails(updated);
  }

  function handleSaveCurrent() {
    if (!currentPlan) return;
    const id = crypto.randomUUID();
    const trail: StoredTrail = { ...currentPlan, trailId: id, savedAt: Date.now() };
    setTrails(prev => { const next = [trail, ...prev]; persistTrails(next); return next; });
    localStorage.setItem(AUTOSAVE_ID_KEY, id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function closeMenu() { setMenuId(null); setMenuPos(null); }

  function handleDuplicate(trail: StoredTrail) {
    const copy: StoredTrail = { ...trail, trailId: crypto.randomUUID(), name: trail.name + ' (copy)', savedAt: Date.now() };
    const idx = trails.findIndex(t => t.trailId === trail.trailId);
    const next = [...trails];
    next.splice(idx + 1, 0, copy);
    update(next);
    closeMenu();
  }

  function handleRemove(trail: StoredTrail) {
    update(trails.filter(t => t.trailId !== trail.trailId));
    if (undoRef.current) clearTimeout(undoRef.current);
    setRemovedTrail(trail);
    closeMenu();
    undoRef.current = setTimeout(() => setRemovedTrail(null), 5000);
  }

  function handleUndo() {
    if (!removedTrail) return;
    if (undoRef.current) { clearTimeout(undoRef.current); undoRef.current = null; }
    update([removedTrail, ...trails]);
    setRemovedTrail(null);
  }

  function handleExport(trail: StoredTrail) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { trailId: _id, ...data } = trail;
    const safe = trail.name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').slice(0, 60);
    downloadFile(serializeTopoPace(data), `${safe}.tppa`);
    closeMenu();
  }

  function handleRenameCommit(trail: StoredTrail) {
    const trimmed = renameVal.trim();
    if (trimmed && trimmed !== trail.name)
      update(trails.map(t => t.trailId === trail.trailId ? { ...t, name: trimmed } : t));
    setRenameId(null);
  }

  async function handleUpload(file: File) {
    setError('');
    const name = file.name.toLowerCase();
    if (name.endsWith('.gpx')) {
      try { onNewRoute(parseRoute(await file.text())); onClose(); }
      catch (e) { setError((e as Error).message); }
      return;
    }
    if (name.endsWith('.tppa') || name.endsWith('.tppe') || name.endsWith('.json')) {
      try { onOpenTrail(parseTopoPace(await file.text())); onClose(); }
      catch (e) { setError((e as Error).message); }
      return;
    }
    setError('Select a .gpx or .tppa file');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: 'var(--bg-card)', borderRadius: 14,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)', width: 500, maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>My Trails</span>
          <button className="ghost" style={{ fontSize: 20, padding: '0 6px', lineHeight: 1 }} onClick={onClose}>×</button>
        </div>

        {/* Save current + auto-save */}
        {currentPlan && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>💾 Save current plan to library</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => onAutoSaveChange(!autoSave)}>
                <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>Auto-save</span>
                <div style={{
                  width: 32, height: 18, borderRadius: 9,
                  background: autoSave ? 'var(--green)' : 'var(--border)',
                  position: 'relative',
                  transition: 'background 200ms',
                  flexShrink: 0,
                }}>
                  <div style={{
                    position: 'absolute', top: 2,
                    left: autoSave ? 14 : 2,
                    width: 14, height: 14,
                    borderRadius: '50%', background: '#fff',
                    transition: 'left 220ms cubic-bezier(0.3,0,0,1)',
                  }} />
                </div>
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateRows: autoSave ? '0fr' : '1fr',
              transition: 'grid-template-rows 250ms cubic-bezier(0.3,0,0,1)',
            }}>
              <div style={{ overflow: 'hidden' }}>
                <button className="ghost" style={{ width: '100%', fontSize: 12, marginTop: 8 }} onClick={handleSaveCurrent}>
                  {saved ? '✓ Saved!' : 'Save now'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trails.length === 0 && (
            <div style={{ color: 'var(--text-hint)', textAlign: 'center', padding: '40px 0', fontSize: 13 }}>
              No trails saved yet. Upload a GPX to get started.
            </div>
          )}
          {trails.map(trail => (
            <div key={trail.trailId}
              style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                cursor: renameId === trail.trailId ? 'default' : 'pointer',
              }}
              onClick={() => { if (renameId === trail.trailId) return; onOpenTrail(trail); onClose(); }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {renameId === trail.trailId ? (
                  <input
                    autoFocus
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameCommit(trail);
                      if (e.key === 'Escape') setRenameId(null);
                    }}
                    onBlur={() => handleRenameCommit(trail)}
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: '100%', background: 'var(--bg-card)', border: '1px solid var(--green)',
                      borderRadius: 4, color: 'inherit', fontSize: 13, fontWeight: 600,
                      padding: '1px 6px', outline: 'none',
                    }}
                  />
                ) : (
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trail.name}</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {(trail.route.totalDistM / 1000).toFixed(1)} km · ↑{Math.round(trail.route.totalElevGainM)}m · {new Date(trail.savedAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button className="ghost" style={{ fontSize: 16, padding: '4px 7px', lineHeight: 1, letterSpacing: 1 }}
                  onClick={e => {
                    if (menuId === trail.trailId) { setMenuId(null); setMenuPos(null); return; }
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenuId(trail.trailId);
                    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                  }}>⋯</button>
              </div>
            </div>
          ))}
        </div>

        {/* Upload */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <input ref={uploadRef} type="file" accept=".gpx,.tppa,.tppe,.json" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
          <button className="ghost" style={{ width: '100%', fontSize: 12 }}
            onClick={() => uploadRef.current?.click()}>📁 Upload new adventure</button>
          {error && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{error}</div>}
        </div>

        {/* "..." context menu — fixed to viewport so it's never clipped */}
        {menuId && menuPos && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 2100 }}
              onClick={() => { setMenuId(null); setMenuPos(null); }} />
            <div className="anim-pop" style={{
              position: 'fixed', top: menuPos.top, right: menuPos.right,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
              zIndex: 2101, width: 'max-content', overflow: 'hidden',
            }}>
              {(() => {
                const trail = trails.find(t => t.trailId === menuId);
                if (!trail) return null;
                return [
                  { label: 'Rename',       action: () => { setRenameId(trail.trailId); setRenameVal(trail.name); closeMenu(); } },
                  { label: 'Duplicate',    action: () => handleDuplicate(trail) },
                  { label: 'Export .tppa', action: () => handleExport(trail) },
                  { label: 'Remove',       action: () => handleRemove(trail), danger: true },
                ].map(item => (
                  <button key={item.label} className="ghost" style={{
                    width: '100%', textAlign: 'left', borderRadius: 0,
                    padding: '9px 14px', fontSize: 12, color: item.danger ? 'var(--red)' : undefined,
                  }} onClick={item.action}>{item.label}</button>
                ));
              })()}
            </div>
          </>
        )}

        {/* Undo toast */}
        {removedTrail && (
          <div style={{
            position: 'absolute', bottom: 72, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12, whiteSpace: 'nowrap', boxShadow: '0 2px 12px rgba(0,0,0,.5)',
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>"{removedTrail.name}" removed</span>
            <button className="primary" style={{ fontSize: 11, padding: '3px 10px' }} onClick={handleUndo}>Undo</button>
          </div>
        )}
      </div>
    </div>
  );
}
