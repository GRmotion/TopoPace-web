import { useState } from 'react';
import type { Checkpoint, CheckpointType } from '../models/types';

interface Props {
  checkpoints: Checkpoint[];
  totalDistM: number;
  onChange: (cps: Checkpoint[]) => void;
  pendingDistM: number | null;
  onPendingClear: () => void;
}

function newCp(distM: number): Checkpoint {
  return { id: crypto.randomUUID(), name: '', distM, type: 'aid', plannedStopMin: 5 };
}

export default function CheckpointPanel({ checkpoints, totalDistM, onChange, pendingDistM, onPendingClear }: Props) {
  const [editing, setEditing] = useState<Checkpoint | null>(null);
  const [addingManual, setAddingManual] = useState(false);
  const [manualKm, setManualKm] = useState('');

  if (pendingDistM !== null && editing === null) {
    const cp = newCp(pendingDistM);
    setEditing(cp);
    onPendingClear();
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
          Click on chart or map (📍 button) to add checkpoints
        </div>
      )}

      {sorted.map(cp => (
        <div key={cp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
          <span style={{ fontSize: 13 }}>{cp.type === 'aid' ? '🟡' : '📍'}</span>
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
      ))}

      {editing && <CheckpointEditor cp={editing} totalDistM={totalDistM} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

interface EditorProps { cp: Checkpoint; totalDistM: number; onSave: (cp: Checkpoint) => void; onCancel: () => void; }

function CheckpointEditor({ cp: initial, totalDistM, onSave, onCancel }: EditorProps) {
  const [cp, setCp] = useState<Checkpoint>(initial);
  function set<K extends keyof Checkpoint>(key: K, value: Checkpoint[K]) { setCp(prev => ({ ...prev, [key]: value })); }

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
        <input type="number" min={0} max={totalDistM / 1000} step={0.1}
          value={(cp.distM / 1000).toFixed(2)}
          onChange={e => set('distM', parseFloat(e.target.value) * 1000)} />
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
            <label>Planned stop (min)</label>
            <input type="number" min={0} max={120} value={cp.plannedStopMin}
              onChange={e => set('plannedStopMin', parseInt(e.target.value) || 0)} />
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
        <button className="primary" onClick={() => onSave(cp)}>Save</button>
      </div>
    </div>
  );
}
