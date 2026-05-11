import { useState } from 'react';
import type { AdvancedSettings } from '../models/types';

interface Props {
  settings: AdvancedSettings;
  onChange: (s: AdvancedSettings) => void;
}

function aggrDisplay(pct: number): string {
  if (pct === 0) return 'Even';
  return pct < 0 ? `−${Math.abs(pct)}%` : `+${pct}%`;
}

export default function AdvancedSettingsPanel({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(settings.startAggressiveness * 100);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <button
        className="ghost"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
        onClick={() => setOpen(o => !o)}
      >
        <label style={{ cursor: 'pointer' }}>Run Style</label>
        <span style={{ fontSize: 11, color: 'var(--text-hint)', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>▾</span>
      </button>

      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 250ms cubic-bezier(0.3, 0, 0, 1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>

            {/* Label + value — always the same height, no conditional elements */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Start pace</span>
              <span style={{
                fontSize: 12, fontWeight: 600, minWidth: 40, textAlign: 'right',
                color: pct !== 0 ? 'var(--yellow)' : 'var(--text-hint)',
              }}>
                {aggrDisplay(pct)}
              </span>
            </div>

            {/* Slider — fixed layout, end labels always visible */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-hint)', width: 24, textAlign: 'left', flexShrink: 0 }}>−8%</span>
              <input
                type="range"
                min={-8}
                max={8}
                step={1}
                value={pct}
                onChange={e => onChange({ ...settings, startAggressiveness: parseInt(e.target.value) / 100 })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-hint)', width: 24, textAlign: 'right', flexShrink: 0 }}>+8%</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
