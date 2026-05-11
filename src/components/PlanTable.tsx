import type { CheckpointResult, GelResult } from '../models/types';
import { formatTime, formatPace } from '../algorithm/PacePlanner';

interface Props {
  results: CheckpointResult[];
  gelResults?: GelResult[];
  onAdjustStop: (id: string, deltaMin: number) => void;
  timeFormat?: '12h' | '24h';
  distUnit?: 'km' | 'mi';
}

function bufferColor(min: number | null): string {
  if (min === null) return 'transparent';
  if (min >= 30) return 'var(--green)';
  if (min >= 10) return 'var(--yellow)';
  return 'var(--red)';
}

type Row = { kind: 'cp'; data: CheckpointResult } | { kind: 'gel'; data: GelResult };

export default function PlanTable({ results, gelResults = [], onAdjustStop, timeFormat = '24h', distUnit = 'km' }: Props) {
  const hasCutoff = results.some(r => r.cutoffTime);

  const rows: Row[] = [
    ...results.map(r => ({ kind: 'cp' as const, data: r })),
    ...gelResults.map(g => ({ kind: 'gel' as const, data: g })),
  ].sort((a, b) => {
    const dA = a.kind === 'cp' ? a.data.distM : a.data.distM;
    const dB = b.kind === 'cp' ? b.data.distM : b.data.distM;
    return dA - dB;
  });

  let cpIndex = 0;

  return (
    <div className="card no-print" style={{ overflowX: 'auto' }}>
      <label style={{ display: 'block', marginBottom: 12 }}>Race Schedule</label>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
            <th style={th}>#</th>
            <th style={{ ...th, textAlign: 'left' }}>Checkpoint</th>
            <th style={th}>{distUnit === 'mi' ? 'mi' : 'km'}</th>
            <th style={th}>Avg pace</th>
            <th style={th}>ETA</th>
            <th style={th}>Stop</th>
            <th style={th}>Leave</th>
            {hasCutoff && <th style={th}>Cutoff</th>}
            {hasCutoff && <th style={th}>Buffer</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            if (row.kind === 'gel') {
              const g = row.data;
              return (
                <tr key={`gel-${g.id}`} style={{ borderTop: '1px solid var(--border)', opacity: 0.85 }}>
                  <td style={{ ...td, color: 'var(--text-hint)' }}>·</td>
                  <td style={{ ...td, textAlign: 'left' }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#ff9800', marginRight: 6, flexShrink: 0, verticalAlign: 'middle' }} />
                    <span style={{ color: '#ff9800', fontWeight: 600 }}>Gel {g.gelNumber}</span>
                  </td>
                  <td style={td}>{distUnit === 'mi' ? (g.distM / 1609.344).toFixed(1) : (g.distM / 1000).toFixed(1)}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>—</td>
                  <td style={{ ...td, fontWeight: 600 }}>{formatTime(g.etaMs, timeFormat)}</td>
                  <td style={td}>—</td>
                  <td style={{ ...td, fontWeight: 600 }}>{formatTime(g.etaMs, timeFormat)}</td>
                  {hasCutoff && <td style={td}>—</td>}
                  {hasCutoff && <td style={td}>—</td>}
                </tr>
              );
            }

            const r = row.data;
            cpIndex++;
            return (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...td, color: 'var(--text-hint)' }}>{cpIndex}</td>
                <td style={{ ...td, textAlign: 'left' }}>
                  {r.type === 'aid' ? (
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: r.color || '#ffd54f', boxShadow: '0 0 0 1px rgba(0,0,0,0.3)', marginRight: 6, flexShrink: 0, verticalAlign: 'middle' }} />
                  ) : (
                    <span style={{ marginRight: 6 }}>📍</span>
                  )}
                  <span style={{ fontWeight: 600 }}>{r.name}</span>
                  {r.note && <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 2 }}>{r.note}</div>}
                </td>
                <td style={td}>{distUnit === 'mi' ? (r.distM / 1609.344).toFixed(1) : (r.distM / 1000).toFixed(1)}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatPace(r.segmentPaceSecPerKm)}/km</td>
                <td style={{ ...td, fontWeight: 600 }}>{formatTime(r.etaMs, timeFormat)}</td>
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
                <td style={{ ...td, fontWeight: 600 }}>{formatTime(r.leaveAtMs, timeFormat)}</td>
                {hasCutoff && <td style={td}>{r.cutoffTime ?? '—'}</td>}
                {hasCutoff && (
                  <td style={td}>
                    {r.cutoffBufferMin !== null ? (
                      <span style={{ color: bufferColor(r.cutoffBufferMin), fontWeight: 600 }}>
                        {r.cutoffBufferMin >= 0 ? '+' : ''}{Math.round(r.cutoffBufferMin)}min
                      </span>
                    ) : '—'}
                  </td>
                )}
              </tr>
            );
          })}
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
