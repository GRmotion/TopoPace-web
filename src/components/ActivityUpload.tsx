import { useRef, useState, useCallback } from 'react';
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

function InfoPopup({ result, anchorRect }: { result: CalibrationResult; anchorRect: DOMRect }) {
  const p = result.profile;
  const left = anchorRect.left;
  const bottom = window.innerHeight - anchorRect.top + 6;
  return (
    <div style={{
      position: 'fixed',
      left,
      bottom,
      zIndex: 1000,
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 16px', width: 300, fontSize: 12,
      lineHeight: 1.8, boxShadow: '0 4px 24px rgba(0,0,0,.55)',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--green)', marginBottom: 2 }}>Personal Profile</div>
      <div style={{ color: 'var(--text-hint)', fontSize: 11, marginBottom: 10 }}>
        {result.activityCount} activit{result.activityCount === 1 ? 'y' : 'ies'} · {result.distanceKm.toFixed(0)} km
      </div>
      <Row label="Climb factor" value={`×${p.climbFactor.toFixed(2)}`}
        hint={p.climbFactor > 1 ? 'slower than Minetti' : p.climbFactor < 1 ? 'faster than Minetti' : 'Minetti default'} />
      <Row label="Descent factor" value={`×${p.descentFactor.toFixed(2)}`} />
      <Row label="Fatigue" value={`${(p.fatigueRatePerHundredKm * 100).toFixed(1)}%`} hint="per 100 km" />
      {p.maxClimbPaceSecPerKm && (
        <Row label="Max climb pace" value={formatPace(p.maxClimbPaceSecPerKm) + '/km'} hint="≥8% grade" />
      )}
      {p.maxDescentPaceSecPerKm && (
        <Row label="Max descent pace" value={formatPace(p.maxDescentPaceSecPerKm) + '/km'} hint="≤−8% grade" />
      )}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 10px', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</span>
      <strong style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{value}</strong>
      <span style={{ color: 'var(--text-hint)', whiteSpace: 'nowrap', minWidth: 80 }}>{hint ?? ''}</span>
    </div>
  );
}

export default function ActivityUpload({ existing, onCalibrate, onReset }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const infoBtnRef = useRef<HTMLButtonElement>(null);

  const toggleInfo = useCallback(() => {
    if (!showInfo && infoBtnRef.current) setAnchorRect(infoBtnRef.current.getBoundingClientRect());
    setShowInfo(v => !v);
  }, [showInfo]);
  const [hovered, setHovered] = useState(false);

  const last = existing.length > 0 ? existing[existing.length - 1] : null;
  const expanded = hovered || status === 'processing';

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
    <div
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header — always visible */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ cursor: 'default' }}>Personal Calibration</label>
          {last && !expanded && (
            <span style={{ fontSize: 11, color: 'var(--green)' }}>✓</span>
          )}
        </div>
        {last && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              ref={infoBtnRef}
              className="ghost"
              style={{ width: 24, height: 24, padding: 0, fontSize: 13, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={toggleInfo}
              onBlur={() => setTimeout(() => setShowInfo(false), 150)}
            >
              ℹ
            </button>
            {showInfo && anchorRect && <InfoPopup result={last} anchorRect={anchorRect} />}
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

      {/* Animated expandable content */}
      <div style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        transition: 'grid-template-rows 250ms cubic-bezier(0.3, 0, 0, 1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
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

          {status === 'error' && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}

          {last && (
            <div style={{ color: 'var(--green)', fontSize: 12 }}>
              ✓ Calibrated from {last.activityCount} activit{last.activityCount === 1 ? 'y' : 'ies'} · {last.distanceKm.toFixed(0)} km
            </div>
          )}
        </div>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".gpx,.fit"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
}
