import type { CheckpointResult } from '../models/types';
import { formatTime, formatPace } from '../algorithm/PacePlanner';

interface Props {
  results: CheckpointResult[];
  onAdjustStop: (id: string, deltaMin: number) => void;
}

function bufferColor(min: number | null): string {
  if (min === null) return 'transparent';
  if (min >= 30) return 'var(--green)';
  if (min >= 10) return 'var(--yellow)';
  return 'var(--red)';
}

export default function PlanTable({ results, onAdjustStop }: Props) {
  return (
    <div className="card no-print" style={{ overflowX: 'auto' }}>
      <label style={{ display: 'block', marginBottom: 12 }}>Race Schedule</label>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
            <th style={th}>#</th>
            <th style={{ ...th, textAlign: 'left' }}>Checkpoint</th>
            <th style={th}>km</th>
            <th style={th}>Avg pace</th>
            <th style={th}>ETA</th>
            <th style={th}>Stop</th>
            <th style={th}>Leave</th>
            <th style={th}>Cutoff</th>
            <th style={th}>Buffer</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ ...td, color: 'var(--text-hint)' }}>{i + 1}</td>
              <td style={{ ...td, textAlign: 'left' }}>
                <span style={{ marginRight: 6 }}>{r.type === 'aid' ? '🟡' : '📍'}</span>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                {r.note && <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2 }}>{r.note}</div>}
              </td>
              <td style={td}>{(r.distM / 1000).toFixed(1)}</td>
              <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatPace(r.segmentPaceSecPerKm)}/km</td>
              <td style={{ ...td, fontWeight: 600 }}>{formatTime(r.etaMs)}</td>
              <td style={td}>
                {r.type === 'aid' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                    <button className="ghost" style={{ width: 22, height: 22, padding: 0, fontSize: 14 }}
                      onClick={() => onAdjustStop(r.id, -1)}>−</button>
                    <span style={{ minWidth: 28, textAlign: 'center' }}>{r.plannedStopMin}m</span>
                    <button className="ghost" style={{ width: 22, height: 22, padding: 0, fontSize: 14 }}
                      onClick={() => onAdjustStop(r.id, 1)}>+</button>
                  </div>
                ) : '—'}
              </td>
              <td style={{ ...td, fontWeight: 600 }}>{formatTime(r.leaveAtMs)}</td>
              <td style={td}>{r.cutoffTime ?? '—'}</td>
              <td style={td}>
                {r.cutoffBufferMin !== null ? (
                  <span style={{ color: bufferColor(r.cutoffBufferMin), fontWeight: 600 }}>
                    {r.cutoffBufferMin >= 0 ? '+' : ''}{Math.round(r.cutoffBufferMin)}min
                  </span>
                ) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '4px 10px',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};
