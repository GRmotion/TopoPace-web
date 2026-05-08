import { useRef, useCallback, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
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

interface DataPoint { distKm: number; ele: number; }

function ChartTooltip({ active, payload, segments, checkpoints, raceStartTime }: {
  active?: boolean;
  payload?: Array<{ payload: DataPoint }>;
  segments?: TrackSegment[];
  checkpoints?: Checkpoint[];
  raceStartTime?: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const distM = d.distKm * 1000;
  const pace = segments?.length ? paceAtDist(segments, distM) : null;
  const eta = pace && segments && checkpoints && raceStartTime
    ? elapsedMsAtDist(segments, checkpoints, raceStartTime, distM) : null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, lineHeight: 1.7, pointerEvents: 'none' }}>
      <div style={{ color: 'var(--text-secondary)' }}>{d.distKm.toFixed(2)} km</div>
      <div style={{ color: 'var(--green)', fontWeight: 600 }}>{Math.round(d.ele)} m</div>
      {pace && <div>{formatPace(pace)}<span style={{ color: 'var(--text-hint)', marginLeft: 4 }}>/km</span></div>}
      {eta && <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>ETA {formatTime(eta)}</div>}
    </div>
  );
}

function computeSegmentStats(segments: TrackSegment[], startKm: number, endKm: number) {
  const fromM = startKm * 1000, toM = endKm * 1000;
  let timeSec = 0, distM = 0;
  for (const seg of segments) {
    if (seg.endDist <= fromM || seg.startDist >= toM) continue;
    const cover = Math.min(seg.endDist, toM) - Math.max(seg.startDist, fromM);
    timeSec += (cover / 1000) * seg.targetPaceSecPerKm;
    distM += cover;
  }
  return {
    distKm: distM / 1000,
    avgPace: distM > 0 ? timeSec / (distM / 1000) : null,
    durationMs: distM > 0 ? timeSec * 1000 : null,
  };
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

export default function ElevationChart({ points, checkpoints, segments, raceStartTime, height = 200, onClickDist, onHoverDist }: Props) {
  const hoverDistRef = useRef<number | null>(null);
  const dragRef = useRef<{ startDistM: number; startClientX: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ startKm: number; endKm: number } | null>(null);
  const [pendingClick, setPendingClick] = useState<{ distM: number; offsetX: number; offsetY: number } | null>(null);

  const data: DataPoint[] = points
    .filter((_, i) => i % Math.max(1, Math.floor(points.length / 600)) === 0)
    .map(p => ({ distKm: +(p.distFromStart / 1000).toFixed(4), ele: Math.round(p.ele) }));

  const eleValues = data.map(d => d.ele);
  const minEle = Math.min(...eleValues);
  const maxEle = Math.max(...eleValues);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMouseMove = useCallback((state: any) => {
    const distKm = state?.activePayload?.[0]?.payload?.distKm;
    const distM = distKm != null ? distKm * 1000 : null;
    hoverDistRef.current = distM;
    onHoverDist?.(distM);

    if (dragRef.current !== null && distKm != null) {
      const startKm = dragRef.current.startDistM / 1000;
      setSelection({ startKm: Math.min(startKm, distKm), endKm: Math.max(startKm, distKm) });
    }
  }, [onHoverDist]);

  const handleMouseLeave = useCallback(() => {
    if (!dragRef.current) {
      hoverDistRef.current = null;
      onHoverDist?.(null);
    }
  }, [onHoverDist]);

  function handleWrapperMouseDown(e: React.MouseEvent) {
    if (e.button !== 0 || hoverDistRef.current == null) return;
    setPendingClick(null);
    setSelection(null);
    dragRef.current = { startDistM: hoverDistRef.current, startClientX: e.clientX };
  }

  function handleWrapperMouseUp(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startClientX);
    if (dx <= 5 && onClickDist) {
      setSelection(null);
      const rect = containerRef.current?.getBoundingClientRect();
      const w = containerRef.current?.clientWidth ?? 0;
      const h2 = containerRef.current?.clientHeight ?? 0;
      const rawX = rect ? e.clientX - rect.left : 0;
      const rawY = rect ? e.clientY - rect.top : 0;
      setPendingClick({
        distM: dragRef.current.startDistM,
        offsetX: Math.max(50, Math.min(w - 20, rawX)),
        offsetY: Math.max(20, Math.min(h2 - 20, rawY)),
      });
    }
    dragRef.current = null;
  }

  const selectionStats = selection && segments?.length
    ? computeSegmentStats(segments, selection.startKm, selection.endKm) : null;

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height, cursor: onClickDist ? 'crosshair' : 'default', position: 'relative', userSelect: 'none' }}
      onMouseDown={handleWrapperMouseDown}
      onMouseUp={handleWrapperMouseUp}
    >
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4caf50" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#4caf50" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="distKm"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={v => `${(+v).toFixed(0)}km`}
            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            width={45}
            tickFormatter={v => `${v}m`}
            domain={[minEle, maxEle]}
            allowDataOverflow
          />
          <Tooltip
            content={<ChartTooltip segments={segments} checkpoints={checkpoints} raceStartTime={raceStartTime} />}
            wrapperStyle={{ transition: 'none', zIndex: 10 }}
            isAnimationActive={false}
          />
          {checkpoints.map(cp => (
            <ReferenceLine
              key={cp.id}
              x={+(cp.distM / 1000).toFixed(4)}
              stroke={cp.type === 'aid' ? '#ffd54f' : '#8b8fa8'}
              strokeWidth={1.5}
              label={{ value: cp.name, position: 'insideTopRight', fill: cp.type === 'aid' ? '#ffd54f' : '#8b8fa8', fontSize: 10 }}
            />
          ))}
          {selection && (
            <ReferenceArea
              x1={selection.startKm}
              x2={selection.endKm}
              fill="rgba(255,255,255,0.08)"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={1}
            />
          )}
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

      {/* Two-step checkpoint add: "+" button appears at click position */}
      {pendingClick && onClickDist && (
        <div style={{ position: 'absolute', top: pendingClick.offsetY, left: pendingClick.offsetX, transform: 'translate(-50%, -50%)', zIndex: 20, pointerEvents: 'none' }}>
          <button
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#4caf50', color: '#fff',
              border: '2px solid rgba(255,255,255,0.9)',
              fontSize: 20, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, boxShadow: '0 2px 8px rgba(0,0,0,.55)',
              lineHeight: 1, pointerEvents: 'auto',
            }}
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              onClickDist(pendingClick.distM);
              setPendingClick(null);
            }}
          >+</button>
        </div>
      )}

      {/* Selection range stats */}
      {selection && selectionStats && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '5px 10px', fontSize: 11, lineHeight: 1.6,
          zIndex: 15, boxShadow: '0 2px 8px rgba(0,0,0,.4)',
          display: 'flex', gap: 10, alignItems: 'center', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>{selection.startKm.toFixed(1)}–{selection.endKm.toFixed(1)} km</span>
          <strong>{selectionStats.distKm.toFixed(1)} km</strong>
          {selectionStats.avgPace && (
            <span>{formatPace(selectionStats.avgPace)}<span style={{ color: 'var(--text-hint)', marginLeft: 2 }}>/km avg</span></span>
          )}
          {selectionStats.durationMs && (
            <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{formatDuration(selectionStats.durationMs)}</span>
          )}
          <button
            style={{ padding: 0, background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0, pointerEvents: 'auto' }}
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setSelection(null); }}
          >×</button>
        </div>
      )}
    </div>
  );
}
