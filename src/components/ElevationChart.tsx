import { useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { TrackPoint, Checkpoint } from '../models/types';

interface Props {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  onClickDist?: (distM: number) => void;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { distKm: number; ele: number } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-secondary)' }}>{d.distKm.toFixed(2)} km</div>
      <div style={{ color: 'var(--green)', fontWeight: 600 }}>{Math.round(d.ele)} m</div>
    </div>
  );
}

export default function ElevationChart({ points, checkpoints, onClickDist }: Props) {
  const data = points
    .filter((_, i) => i % Math.max(1, Math.floor(points.length / 500)) === 0)
    .map(p => ({ distKm: p.distFromStart / 1000, ele: Math.round(p.ele) }));

  const handleClick = useCallback((e: { activePayload?: Array<{ payload: { distKm: number } }> }) => {
    const distKm = e?.activePayload?.[0]?.payload?.distKm;
    if (distKm != null && onClickDist) onClickDist(distKm * 1000);
  }, [onClickDist]);

  return (
    <div style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={handleClick as never}
          style={{ cursor: onClickDist ? 'crosshair' : 'default' }}>
          <defs>
            <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4caf50" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#4caf50" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="distKm" tickFormatter={v => `${v.toFixed(0)}km`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
          <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={45} tickFormatter={v => `${v}m`} />
          <Tooltip content={<CustomTooltip />} />
          {checkpoints.map(cp => (
            <ReferenceLine key={cp.id} x={cp.distM / 1000} stroke={cp.type === 'aid' ? 'var(--yellow)' : 'var(--text-hint)'}
              strokeDasharray="4 3" label={{ value: cp.name, position: 'top', fill: 'var(--text-secondary)', fontSize: 10 }} />
          ))}
          <Area type="monotone" dataKey="ele" stroke="#4caf50" strokeWidth={1.5} fill="url(#eleGrad)" dot={false} activeDot={{ r: 4, fill: '#4caf50' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
