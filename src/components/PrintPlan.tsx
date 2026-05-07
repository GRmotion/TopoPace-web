import type { CheckpointResult, RunPlan } from '../models/types';
import { formatTime, formatPace } from '../algorithm/PacePlanner';

interface Props {
  plan: RunPlan;
  results: CheckpointResult[];
}

function bufferStr(min: number | null): string {
  if (min === null) return '—';
  return `${min >= 0 ? '+' : ''}${Math.round(min)}m`;
}

export default function PrintPlan({ plan, results }: Props) {
  const goalH = Math.floor(plan.goalTimeSec / 3600);
  const goalMin = Math.floor((plan.goalTimeSec % 3600) / 60);

  return (
    <>
      <button
        className="primary no-print"
        style={{ padding: '10px 24px' }}
        onClick={() => window.print()}
      >
        🖨 Print / Save as PDF
      </button>

      <div className="print-only" style={{ fontFamily: 'Arial, sans-serif', fontSize: '9pt', color: '#000' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, borderBottom: '1px solid #000', paddingBottom: 4 }}>
          <strong style={{ fontSize: '11pt' }}>TopoPace — {plan.name}</strong>
          <span>Start: {plan.raceStartTime} · Goal: {goalH}h {goalMin}min</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000', fontSize: '8pt' }}>
              <th style={pth}>#</th>
              <th style={{ ...pth, textAlign: 'left' }}>Checkpoint</th>
              <th style={pth}>km</th>
              <th style={pth}>Pace</th>
              <th style={pth}>ETA</th>
              <th style={pth}>Stop</th>
              <th style={pth}>Leave</th>
              <th style={pth}>Cutoff</th>
              <th style={pth}>Buffer</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: '0.5px solid #ccc' }}>
                <td style={ptd}>{i + 1}</td>
                <td style={{ ...ptd, textAlign: 'left', fontWeight: 600 }}>{r.name}</td>
                <td style={ptd}>{(r.distM / 1000).toFixed(1)}</td>
                <td style={ptd}>{formatPace(r.segmentPaceSecPerKm)}</td>
                <td style={{ ...ptd, fontWeight: 700 }}>{formatTime(r.etaMs)}</td>
                <td style={ptd}>{r.type === 'aid' ? `${r.plannedStopMin}m` : '—'}</td>
                <td style={{ ...ptd, fontWeight: 700 }}>{formatTime(r.leaveAtMs)}</td>
                <td style={ptd}>{r.cutoffTime ?? '—'}</td>
                <td style={ptd}>{bufferStr(r.cutoffBufferMin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 6, fontSize: '7.5pt', color: '#555' }}>
          Generated {new Date().toLocaleDateString()} · TopoPace
        </div>
      </div>
    </>
  );
}

const pth: React.CSSProperties = { padding: '2px 6px', textAlign: 'center', fontWeight: 600 };
const ptd: React.CSSProperties = { padding: '2px 6px', textAlign: 'center' };
