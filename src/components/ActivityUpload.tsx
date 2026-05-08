import { useRef, useState } from 'react';
import type { CalibrationResult } from '../models/types';
import { parseActivity } from '../parsers/GpxParser';
import { parseFitActivity } from '../parsers/FitParser';
import { analyzeActivity } from '../algorithm/ActivityAnalyzer';
import { formatPace } from '../algorithm/PacePlanner';

interface Props {
  existing: CalibrationResult[];
  onCalibrate: (results: CalibrationResult[]) => void;
  onReset?: () => void;
}

function InfoPopup({ result }: { result: CalibrationResult }) {
  const p = result.profile;
  return (
    <div style={{
      position: 'absolute', top: 28, right: 0, zIndex: 100,
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 14px', width: 220, fontSize: 12,
      lineHeight: 1.7, boxShadow: '0 4px 20px rgba(0,0,0,.5)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--green)' }}>
        Personal Profile
        <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>
          {result.activityCount} activit{result.activityCount === 1 ? 'y' : 'ies'} · {result.distanceKm.toFixed(0)} km
        </span>
      </div>
      <Row label="Climb factor" value={`×${p.climbFactor.toFixed(2)}`} hint={p.climbFactor > 1 ? 'slower than Minetti' : p.climbFactor < 1 ? 'faster than Minetti' : 'Minetti default'} />
      <Row label="Descent factor" value={`×${p.descentFactor.toFixed(2)}`} />
      <Row label="Fatigue" value={`${(p.fatigueRatePerHundredKm * 100).toFixed(1)}%`} hint="per 100 km" />
      {p.maxClimbPaceSecPerKm && (
        <Row label="Max climb pace" value={formatPace(p.maxClimbPaceSecPerKm) + '/km'} hint="≥8% grade cap" />
      )}
      {p.maxDescentPaceSecPerKm && (
        <Row label="Max descent pace" value={formatPace(p.maxDescentPaceSecPerKm) + '/km'} hint="≤-8% grade cap" />
      )}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span>
        <strong>{value}</strong>
        {hint && <span style={{ color: 'var(--text-hint)', marginLeft: 4 }}>{hint}</span>}
      </span>
    </div>
  );
}

export default function ActivityUpload({ existing, onCalibrate, onReset }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [showInfo, setShowInfo] = useState(false);

  const last = existing.length > 0 ? existing[existing.length - 1] : null;

  async function handleFile(file: File) {
    setStatus('processing');
    setError('');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let points: Array<{ distFromStart: number; ele: number; timestamp: number }>;
      if (ext === 'gpx') {
        points = (await parseActivity(await file.text())).points;
      } else if (ext === 'fit') {
        points = (await parseFitActivity(await file.arrayBuffer())).points;
      } else {
        throw new Error('Unsupported format — use .gpx or .fit');
      }
      const result = analyzeActivity(points, existing);
      onCalibrate([result]);
      setStatus('done');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label>Personal Calibration</label>
        {last && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <button
                className="ghost"
                style={{ width: 24, height: 24, padding: 0, fontSize: 13, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setShowInfo(v => !v)}
                onBlur={() => setTimeout(() => setShowInfo(false), 150)}
              >
                ℹ
              </button>
              {showInfo && <InfoPopup result={last} />}
            </div>
            {onReset && (
              <button
                className="ghost"
                style={{ width: 24, height: 24, padding: 0, fontSize: 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-hint)' }}
                onClick={() => { if (window.confirm('Reset calibration data?')) { onReset(); setStatus('idle'); } }}
                title="Reset calibration"
              >
                ↺
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Upload past activities to calibrate your personal GAP factors and fatigue rate.
      </div>

      <button
        className="ghost"
        style={{ alignSelf: 'flex-start', fontSize: 12 }}
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
        <div style={{ color: 'var(--green)', fontSize: 12 }}>
          ✓ Calibrated from {last.activityCount} activit{last.activityCount === 1 ? 'y' : 'ies'} · {last.distanceKm.toFixed(0)} km
        </div>
      )}
    </div>
  );
}
