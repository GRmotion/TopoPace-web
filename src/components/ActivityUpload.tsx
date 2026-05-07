import { useRef, useState } from 'react';
import type { CalibrationResult } from '../models/types';
import { parseActivity } from '../parsers/GpxParser';
import { parseFitActivity } from '../parsers/FitParser';
import { analyzeActivity } from '../algorithm/ActivityAnalyzer';

interface Props {
  existing: CalibrationResult[];
  onCalibrate: (results: CalibrationResult[]) => void;
}

export default function ActivityUpload({ existing, onCalibrate }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    setStatus('processing');
    setError('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let points: Array<{ distFromStart: number; ele: number; timestamp: number }>;

      if (ext === 'gpx') {
        const text = await file.text();
        const parsed = parseActivity(text);
        points = parsed.points;
      } else if (ext === 'fit') {
        const buf = await file.arrayBuffer();
        const parsed = await parseFitActivity(buf);
        points = parsed.points;
      } else {
        throw new Error('Unsupported file format. Use .gpx or .fit');
      }

      const result = analyzeActivity(points, existing);
      onCalibrate([...existing, result]);
      setStatus('done');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }

  const last = existing[existing.length - 1];

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label>Personal Calibration</label>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Upload past activities to calibrate your personal GAP factors and fatigue rate.
        The more activities on similar terrain, the better.
      </div>

      <button
        className="ghost"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => inputRef.current?.click()}
        disabled={status === 'processing'}
      >
        {status === 'processing' ? '⏳ Analysing…' : '+ Upload activity (.gpx or .fit)'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,.fit"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />

      {status === 'error' && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}

      {last && (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 2 }}>
            ✓ Calibrated from {last.activityCount} activit{last.activityCount === 1 ? 'y' : 'ies'} · {last.distanceKm.toFixed(0)} km total
          </div>
          <ProfileRow label="Climb factor" value={`${(last.profile.climbFactor * 100).toFixed(0)}%`} hint="vs Minetti default" />
          <ProfileRow label="Descent factor" value={`${(last.profile.descentFactor * 100).toFixed(0)}%`} hint="vs Minetti default" />
          <ProfileRow label="Fatigue" value={`${(last.profile.fatigueRatePerHundredKm * 100).toFixed(1)}%`} hint="slower per 100 km" />
        </div>
      )}
    </div>
  );
}

function ProfileRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span>
        <strong>{value}</strong>
        <span style={{ color: 'var(--text-hint)', marginLeft: 6 }}>{hint}</span>
      </span>
    </div>
  );
}
