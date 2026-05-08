import { useState } from 'react';
import type { AdvancedSettings } from '../models/types';

interface Props {
  settings: AdvancedSettings;
  onChange: (s: AdvancedSettings) => void;
}

const AGGR_STEPS = [-0.05, -0.025, 0, 0.025, 0.05];

function aggrLabel(v: number): string {
  if (v === 0) return 'Even';
  const pct = (Math.abs(v) * 100).toFixed(1).replace('.0', '');
  return v < 0 ? `−${pct}% (conservative)` : `+${pct}% (aggressive)`;
}

export default function AdvancedSettingsPanel({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);

  function set<K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  const aggrIndex = AGGR_STEPS.findIndex(s => Math.abs(s - settings.startAggressiveness) < 0.001);
  const sliderIdx = aggrIndex >= 0 ? aggrIndex : 2;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <button
        className="ghost"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
        onClick={() => setOpen(o => !o)}
      >
        <label style={{ cursor: 'pointer' }}>Advanced Settings</label>
        <span style={{ fontSize: 11, color: 'var(--text-hint)', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>▾</span>
      </button>

      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 250ms cubic-bezier(0.3, 0, 0, 1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={{ fontSize: 12 }}>Start aggressiveness</label>
              <span style={{ fontSize: 11, color: settings.startAggressiveness !== 0 ? 'var(--yellow)' : 'var(--text-hint)' }}>
                {aggrLabel(settings.startAggressiveness)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>−5%</span>
              <input
                type="range"
                min={0}
                max={AGGR_STEPS.length - 1}
                step={1}
                value={sliderIdx}
                onChange={e => set('startAggressiveness', AGGR_STEPS[parseInt(e.target.value)])}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-hint)', whiteSpace: 'nowrap' }}>+5%</span>
            </div>
            {settings.startAggressiveness !== 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-hint)', lineHeight: 1.5 }}>
                {settings.startAggressiveness < 0
                  ? `Start ${(Math.abs(settings.startAggressiveness) * 100).toFixed(1).replace('.0', '')}% slower → finish faster`
                  : `Start ${(settings.startAggressiveness * 100).toFixed(1).replace('.0', '')}% faster → finish slower`}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
