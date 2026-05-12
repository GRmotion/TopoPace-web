import { useState, useRef } from 'react';
import type { Checkpoint, CheckpointType } from '../models/types';

const AID_COLORS = ['#ffd54f', '#ff9800', '#ef5350', '#42a5f5', '#66bb6a', '#ab47bc'];

interface Props {
  checkpoints: Checkpoint[];
  totalDistM: number;
  onChange: (cps: Checkpoint[]) => void;
}

function newCp(distM: number, type: CheckpointType = 'aid'): Checkpoint {
  return { id: crypto.randomUUID(), name: '', distM, type, plannedStopMin: type === 'aid' ? 5 : 0 };
}

export default function CheckpointPanel({ checkpoints, totalDistM, onChange }: Props) {
  const [editing, setEditing] = useState<Checkpoint | null>(null);
  const [addingManual, setAddingManual] = useState(false);
  const [manualKm, setManualKm] = useState('');
  const [colorHoverId, setColorHoverId] = useState<string | null>(null);
  const colorLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showColor(id: string) {
    if (colorLeaveTimer.current) clearTimeout(colorLeaveTimer.current);
    setColorHoverId(id);
  }
  function hideColor() {
    colorLeaveTimer.current = setTimeout(() => setColorHoverId(null), 200);
  }

  function save(cp: Checkpoint) {
    if (!cp.name.trim()) cp = { ...cp, name: `CP ${(cp.distM / 1000).toFixed(1)}km` };
    const exists = checkpoints.find(c => c.id === cp.id);
    onChange(exists ? checkpoints.map(c => c.id === cp.id ? cp : c) : [...checkpoints, cp]);
    setEditing(null);
  }

  function remove(id: string) {
    onChange(checkpoints.filter(c => c.id !== id));
    if (editing?.id === id) setEditing(null);
  }

  function confirmManualAdd() {
    const km = parseFloat(manualKm);
    if (isNaN(km) || km < 0 || km * 1000 > totalDistM) return;
    setEditing(newCp(km * 1000));
    setAddingManual(false);
  }

  const sorted = checkpoints.slice().sort((a, b) => a.distM - b.distM);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label>Checkpoints</label>
        <button className="ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => { setAddingManual(true); setManualKm(''); }}>+ Add</button>
      </div>

      {addingManual && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number"
            placeholder={`km (0–${(totalDistM / 1000).toFixed(1)})`}
            value={manualKm}
            onChange={e => setManualKm(e.target.value)}
            style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && confirmManualAdd()}
            autoFocus
          />
          <button className="primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={confirmManualAdd}>OK</button>
          <button className="ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setAddingManual(false)}>✕</button>
        </div>
      )}

      {sorted.length === 0 && (
        <div style={{ color: 'var(--text-hint)', fontSize: 12, textAlign: 'center', padding: '4px 0' }}>
          Click on chart to add checkpoints
        </div>
      )}

      {sorted.map(cp => (
        <div
          key={cp.id}
          style={{ background: 'var(--bg-elevated)', borderRadius: 8, overflow: 'visible' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', position: 'relative' }}>
            {/* Color icon — circle for Aid, rounded triangle for POI — hover shows swatch */}
            <div
              style={{ position: 'relative', flexShrink: 0, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={() => showColor(cp.id)}
              onMouseLeave={hideColor}
            >
              {cp.type === 'aid' ? (
                <span style={{
                  display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                  background: cp.color || '#ffd54f',
                  boxShadow: '0 0 0 1.5px rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                }} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 14 14" style={{ display: 'block', cursor: 'pointer' }}
                  fill={cp.color || '#8b8fa8'}>
                  <path d="M5.4 5.1 Q7 2.5 8.6 5.1 L10.9 9 Q12.5 11.5 9.5 11.5 L4.5 11.5 Q1.5 11.5 3.1 9 Z" />
                </svg>
              )}
              {colorHoverId === cp.id && (
                <div
                  className="anim-pop"
                  onMouseEnter={() => showColor(cp.id)}
                  onMouseLeave={hideColor}
                  style={{
                    position: 'absolute',
                    top: '50%', left: 18,
                    transform: 'translateY(-50%)',
                    transformOrigin: 'left center',
                    display: 'flex', gap: 5, alignItems: 'center',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8, padding: '5px 8px',
                    zIndex: 50,
                    boxShadow: '0 3px 12px rgba(0,0,0,0.45)',
                    whiteSpace: 'nowrap',
                  }}>
                  {AID_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => { onChange(checkpoints.map(c => c.id === cp.id ? { ...c, color } : c)); setColorHoverId(null); }}
                      style={{
                        width: 16, height: 16, borderRadius: '50%', background: color, border: 'none',
                        cursor: 'pointer', padding: 0, flexShrink: 0,
                        outline: (cp.color || (cp.type === 'aid' ? '#ffd54f' : '#8b8fa8')) === color ? '2.5px solid #fff' : 'none',
                        outlineOffset: 1,
                        boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cp.name || '—'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {(cp.distM / 1000).toFixed(1)} km
                {cp.type === 'aid' && cp.plannedStopMin > 0 && ` · ${cp.plannedStopMin}min`}
                {cp.cutoffTime && ` · cutoff ${cp.cutoffTime}`}
              </div>
            </div>
            <button className="ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setEditing({ ...cp })}>Edit</button>
            <button className="ghost" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => remove(cp.id)}>✕</button>
          </div>
        </div>
      ))}

      {editing && <CheckpointEditor cp={editing} totalDistM={totalDistM} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

interface EditorProps { cp: Checkpoint; totalDistM: number; onSave: (cp: Checkpoint) => void; onCancel: () => void; }

function CheckpointEditor({ cp: initial, totalDistM, onSave, onCancel }: EditorProps) {
  const [cp, setCp] = useState<Checkpoint>(initial);
  const [distStr, setDistStr] = useState(() => String(initial.distM / 1000));
  function set<K extends keyof Checkpoint>(key: K, value: Checkpoint[K]) { setCp(prev => ({ ...prev, [key]: value })); }

  function commitDist(str: string) {
    const v = parseFloat(str);
    if (!isNaN(v) && v >= 0) {
      const clamped = Math.min(totalDistM, Math.max(0, v * 1000));
      set('distM', clamped);
      setDistStr(String(clamped / 1000));
    } else {
      setDistStr(String(cp.distM / 1000));
    }
  }

  function handleSave() {
    const v = parseFloat(distStr);
    const finalDistM = !isNaN(v) && v >= 0
      ? Math.min(totalDistM, Math.max(0, v * 1000))
      : cp.distM;
    onSave({ ...cp, distM: finalDistM });
  }

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--green)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--green)' }}>
        {initial.name ? 'Edit checkpoint' : 'New checkpoint'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label>Name</label>
        <input type="text" value={cp.name} onChange={e => set('name', e.target.value)} placeholder="Checkpoint name" autoFocus />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label>Distance (km)</label>
        <input
          type="text"
          inputMode="decimal"
          value={distStr}
          onChange={e => setDistStr(e.target.value)}
          onBlur={() => commitDist(distStr)}
          onKeyDown={e => { if (e.key === 'Enter') commitDist(distStr); }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label>Type</label>
        <select value={cp.type} onChange={e => set('type', e.target.value as CheckpointType)}>
          <option value="aid">Aid Station</option>
          <option value="waypoint">Waypoint / POI</option>
        </select>
      </div>

      {cp.type === 'aid' && (
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label>Planned stop</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input type="number" min={0} max={120} value={cp.plannedStopMin}
                onChange={e => set('plannedStopMin', parseInt(e.target.value) || 0)}
                style={{ paddingRight: 38, width: '100%' }} />
              <span style={{ position: 'absolute', right: 10, color: 'var(--text-hint)', fontSize: 11, pointerEvents: 'none' }}>MIN</span>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label>Cutoff time</label>
            <input type="time" value={cp.cutoffTime ?? ''} onChange={e => set('cutoffTime', e.target.value || undefined)} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label>Note</label>
        <input type="text" value={cp.note ?? ''} onChange={e => set('note', e.target.value || undefined)} placeholder="Crew access, drop bag, supplies…" />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}
