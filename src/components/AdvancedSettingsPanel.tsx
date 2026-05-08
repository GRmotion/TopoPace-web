import { useState } from 'react';
import type { AdvancedSettings } from '../models/types';

interface Props {
  settings: AdvancedSettings;
  onChange: (s: AdvancedSettings) => void;
}

const AGGR_STEPS = [-0.20, -0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15, 0.20];

function aggrLabel(v: number): string {
  if (v === 0) return 'Even';
  const pct = Math.round(Math.abs(v) * 100);
  return v < 0 ? `−${pct}% (conservative)` : `+${pct}% (aggressive)`;
}

export default function AdvancedSettingsPanel({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);

  function set<K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  const aggrIndex = AGGR_STEPS.findIndex(s => Math.abs(s - settings.startAggressiveness) < 0.001);
  const sliderIdx = aggrIndex >= 0 ? aggrIndex : 4;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <button
        className="ghost"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
        onClick={() => setOpen(o => !o)}
      >
        <label style={{ cursor: 'pointer' }}>Advanced Settings</label>
        <span style={{ fontSize: 11, color: 'var(--text-hint)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>▾</span>
      </button>

      {/* Animated body */}
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 250ms cubic-bezier(0.3, 0, 0, 1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 12 }}>

            {/* Pacing strategy */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={{ fontSize: 12 }}>Start aggressiveness</label>
                <span style={{ fontSize: 11, color: settings.startAggressiveness !== 0 ? 'var(--yellow)' : 'var(--text-hint)' }}>
                  {aggrLabel(settings.startAggressiveness)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>conservative</span>
                <input
                  type="range"
                  min={0}
                  max={AGGR_STEPS.length - 1}
                  step={1}
                  value={sliderIdx}
                  onChange={e => set('startAggressiveness', AGGR_STEPS[parseInt(e.target.value)])}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>aggressive</span>
              </div>
              {settings.startAggressiveness !== 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-hint)', lineHeight: 1.5 }}>
                  {settings.startAggressiveness < 0
                    ? `Start ${Math.round(Math.abs(settings.startAggressiveness) * 100)}% slower → finish faster (negative split)`
                    : `Start ${Math.round(settings.startAggressiveness * 100)}% faster → finish slower (positive split)`}
                </div>
              )}
            </div>

            {/* Gel Advisor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 12 }}>Gel Advisor</label>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Interval</label>
                  <input
                    type="number"
                    min={15}
                    max={120}
                    step={5}
                    value={settings.gelIntervalMin}
                    onChange={e => set('gelIntervalMin', Math.max(15, parseInt(e.target.value) || 40))}
                    style={{ width: 64, textAlign: 'center' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>min</span>
                </div>
              )}
              {settings.gelEnabled && (
                <div style={{ fontSize: 10, color: 'var(--text-hint)', lineHeight: 1.5 }}>
                  Suggested zones shown in orange on the elevation chart. Drag to adjust.
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
