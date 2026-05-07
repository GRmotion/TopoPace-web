import { useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { TrackPoint, Checkpoint, TrackSegment } from '../models/types';
import { paceAtDist, elapsedMsAtDist, formatTime, formatPace } from '../algorithm/PacePlanner';

interface Props {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  segments?: TrackSegment[];
  raceStartTime?: string;
  height?: number;
  onClickDist?: (distM: number) => void;
  onHoverDist?: (distM: number | null) => void;
}

interface HoverData { distKm: number; ele: number; }

function ChartTooltip({
  active, payload, segments, checkpoints, raceStartTime,
}: {
  active?: boolean;
  payload?: Array<{ payload: HoverData }>;
  segments?: TrackSegment[];
  checkpoints?: Checkpoint[];
  raceStartTime?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const distM = d.distKm * 1000;
  const pace = segments && segments.length > 0 ? paceAtDist(segments, distM) : null;
  const eta = pace && segments && checkpoints && raceStartTime
    ? elapsedMsAtDist(segments, checkpoints, raceStartTime, distM)
    : null;

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      lineHeight: 1.6,
      pointerEvents: 'none',
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>{d.distKm.toFixed(2)} km</div>
      <div style={{ color: 'var(--green)', fontWeight: 600 }}>{Math.round(d.ele)} m</div>
      {pace && <div style={{ color: 'var(--text)' }}>{formatPace(pace)}<span style={{ color: 'var(--text-hint)', marginLeft: 4 }}>/km</span></div>}
      {eta && <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>ETA {formatTime(eta)}</div>}
    </div>
  );
}

export default function ElevationChart({ points, checkpoints, segments, raceStartTime, height = 200, onClickDist, onHoverDist }: Props) {
  const data = points
    .filter((_, i) => i % Math.max(1, Math.floor(points.length / 600)) === 0)
    .map(p => ({ distKm: p.distFromStart / 1000, ele: Math.round(p.ele) }));

  const eleValues = data.map(d => d.ele);
  const minEle = Math.min(...eleValues);
  const maxEle = Math.max(...eleValues);

  const handleClick = useCallback((e: { activePayload?: Array<{ payload: HoverData }> }) => {
    const distKm = e?.activePayload?.[0]?.payload?.distKm;
    if (distKm != null && onClickDist) onClickDist(distKm * 1000);
  }, [onClickDist]);

  const handleMouseMove = useCallback((e: { activePayload?: Array<{ payload: HoverData }> }) => {
    const distKm = e?.activePayload?.[0]?.payload?.distKm;
    if (onHoverDist) onHoverDist(distKm != null ? distKm * 1000 : null);
  }, [onHoverDist]);

  const handleMouseLeave = useCallback(() => {
    if (onHoverDist) onHoverDist(null);
  }, [onHoverDist]);

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onClick={handleClick as never}
          onMouseMove={handleMouseMove as never}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: onClickDist ? 'crosshair' : 'default' }}
        >
          <defs>
            <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4caf50" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#4caf50" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="distKm" tickFormatter={v => `${v.toFixed(0)}km`} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
          <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={45} tickFormatter={v => `${v}m`} domain={[minEle, maxEle]} allowDataOverflow />
          <Tooltip
            content={<ChartTooltip segments={segments} checkpoints={checkpoints} raceStartTime={raceStartTime} />}
            wrapperStyle={{ transition: 'none', zIndex: 10 }}
            isAnimationActive={false}
          />
          {checkpoints.map(cp => (
            <ReferenceLine
              key={cp.id}
              x={cp.distM / 1000}
              stroke={cp.type === 'aid' ? '#ffd54f' : '#555870'}
              strokeDasharray="4 3"
              label={{ value: cp.name, position: 'insideTopRight', fill: cp.type === 'aid' ? '#ffd54f' : '#555870', fontSize: 10 }}
            />
          ))}
          <Area
            type="monotone"
            dataKey="ele"
            stroke="#4caf50"
            strokeWidth={1.5}
            fill="url(#eleGrad)"
            dot={false}
            activeDot={{ r: 4, fill: '#4caf50', strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
