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
