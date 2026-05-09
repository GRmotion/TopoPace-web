import { useState, useEffect } from 'react';
import type { AdvancedSettings } from '../models/types';

interface Props {
  settings: AdvancedSettings;
  onChange: (s: AdvancedSettings) => void;
  gelCount: number;
}

export default function GelAdvisorPanel({ settings, onChange, gelCount }: Props) {
  function set<K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  const [intervalInput, setIntervalInput] = useState(String(settings.gelIntervalMin));
  useEffect(() => { setIntervalInput(String(settings.gelIntervalMin)); }, [settings.gelIntervalMin]);

  function commitInterval(raw: string) {
    const v = parseInt(raw);
    const clamped = isNaN(v) ? settings.gelIntervalMin : Math.min(500, Math.max(10, v));
    set('gelIntervalMin', clamped);
    setIntervalInput(String(clamped));
  }

  function stepInterval(delta: number) {
    const next = Math.min(500, Math.max(10, settings.gelIntervalMin + delta));
    set('gelIntervalMin', next);
    setIntervalInput(String(next));
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label>Gel Advisor</label>
        <button
          className="ghost"
          style={{
            fontSize: 11, padding: '2px 10px',
            color: settings.gelEnabled ? '#ff9800' : 'var(--text-hint)',
            borderColor: settings.gelEnabled ? '#ff9800' : 'var(--border)',
          }}
          onClick={() => set('gelEnabled', !settings.gelEnabled)}
        >
          {settings.gelEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {settings.gelEnabled && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Interval</label>
            <input
              className="no-spinners"
              type="number"
              min={10}
              max={500}
              value={intervalInput}
              onChange={e => setIntervalInput(e.target.value)}
              onBlur={() => commitInterval(intervalInput)}
              onKeyDown={e => { if (e.key === 'Enter') commitInterval(intervalInput); }}
              style={{ width: 64, textAlign: 'center' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>min</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => stepInterval(5)}
                style={{ background: 'none', border: 'none', padding: '1px 4px', color: 'var(--green)', fontSize: 9, lineHeight: 1, cursor: 'pointer', borderRadius: 3 }}
              >▲</button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => stepInterval(-5)}
                style={{ background: 'none', border: 'none', padding: '1px 4px', color: 'var(--green)', fontSize: 9, lineHeight: 1, cursor: 'pointer', borderRadius: 3 }}
              >▼</button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Inc. in schedule</label>
            <button
              className="ghost"
              style={{ fontSize: 11, padding: '2px 10px' }}
              onClick={() => set('gelInSchedule', !settings.gelInSchedule)}
            >
              {settings.gelInSchedule ? 'ON' : 'OFF'}
            </button>
          </div>
          {gelCount > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>
              {gelCount} gel{gelCount !== 1 ? 's' : ''} · drag orange dots on chart to adjust
            </div>
          )}
          {gelCount === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>Upload a route to see suggestions</div>
          )}
        </>
      )}
    </div>
  );
}
