import { useRef, useState, useLayoutEffect, useEffect, useMemo } from 'react';
import type { TrackPoint, Checkpoint, TrackSegment } from '../models/types';
import { paceAtDist, elapsedMsAtDist, formatTime, formatPace } from '../algorithm/PacePlanner';

// SVG margins (px)
const ML = 50, MR = 14, MT = 10, MB = 28;

interface Props {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  segments?: TrackSegment[];
  raceStartTime?: string;
  height?: number;
  onClickDist?: (distM: number) => void;
  onHoverDist?: (distM: number | null) => void;
}

interface DPt { km: number; ele: number; }

function bsearchKm(data: DPt[], km: number): DPt {
  if (km <= data[0].km) return data[0];
  const last = data[data.length - 1];
  if (km >= last.km) return last;
  let lo = 0, hi = data.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (data[mid].km <= km) lo = mid; else hi = mid;
  }
  return Math.abs(data[lo].km - km) <= Math.abs(data[hi].km - km) ? data[lo] : data[hi];
}

function formatDur(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

export default function ElevationChart({
  points, checkpoints, segments, raceStartTime,
  height = 200, onClickDist, onHoverDist,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startKm: number; startClientX: number } | null>(null);

  const [w, setW] = useState(0);
  const [hover, setHover] = useState<{ km: number; ele: number } | null>(null);
  const [selection, setSelection] = useState<{ startKm: number; endKm: number } | null>(null);
  const [pending, setPending] = useState<{ distM: number; x: number; y: number } | null>(null);

  // Measure container width before first paint, then watch for resize
  useLayoutEffect(() => {
    if (containerRef.current) setW(containerRef.current.clientWidth);
  }, []);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Release drag on mouseup anywhere in window
  useEffect(() => {
    const up = () => { dragRef.current = null; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const data = useMemo<DPt[]>(() =>
    points
      .filter((_, i) => i % Math.max(1, Math.floor(points.length / 600)) === 0)
      .map(p => ({ km: p.distFromStart / 1000, ele: p.ele })),
    [points]);

  if (data.length < 2) return <div ref={containerRef} style={{ height }} />;

  const minKm = data[0].km;
  const maxKm = data[data.length - 1].km;
  const eles = data.map(d => d.ele);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const eleRange = Math.max(maxEle - minEle, 1);

  const plotW = Math.max(1, w - ML - MR);
  const plotH = Math.max(1, height - MT - MB);
  const kmSpan = Math.max(maxKm - minKm, 0.001);

  const kmToX = (km: number) => ML + ((km - minKm) / kmSpan) * plotW;
  const eleToY = (ele: number) => MT + (1 - (ele - minEle) / eleRange) * plotH;

  function getSvgXY(e: React.MouseEvent): { x: number; y: number } {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : { x: 0, y: 0 };
  }

  function svgXToKm(x: number): number | null {
    if (x < ML || x > ML + plotW) return null;
    return minKm + ((x - ML) / plotW) * kmSpan;
  }

  // SVG paths
  const pts = w > 0 ? data.map(d => `${kmToX(d.km).toFixed(1)},${eleToY(d.ele).toFixed(1)}`).join(' L ') : '';
  const linePath = pts ? `M ${pts}` : '';
  const areaPath = pts
    ? `M ${pts} L ${kmToX(maxKm).toFixed(1)},${(MT + plotH).toFixed(1)} L ${kmToX(minKm).toFixed(1)},${(MT + plotH).toFixed(1)} Z`
    : '';

  // Axes
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const ele = minEle + (i / 4) * eleRange;
    return { ele, y: eleToY(ele) };
  });
  const xInterval = [1, 2, 5, 10, 20, 25, 50, 100].find(v => kmSpan / v <= 10) ?? 100;
  const xTicks: number[] = [];
  for (let k = Math.ceil(minKm / xInterval) * xInterval; k <= maxKm; k += xInterval) xTicks.push(k);

  // Events
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const { x, y: _y } = getSvgXY(e);
    const km = svgXToKm(x);
    if (km == null) {
      if (!dragRef.current) { setHover(null); onHoverDist?.(null); }
      return;
    }
    const nearest = bsearchKm(data, km);
    setHover({ km, ele: nearest.ele });
    onHoverDist?.(km * 1000);
    if (dragRef.current) {
      const a = Math.min(dragRef.current.startKm, km);
      const b = Math.max(dragRef.current.startKm, km);
      setSelection({ startKm: a, endKm: b });
    }
  }

  function onLeave() {
    if (!dragRef.current) { setHover(null); onHoverDist?.(null); }
  }

  function onDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const { x } = getSvgXY(e);
    const km = svgXToKm(x);
    if (km == null) return;
    e.preventDefault();
    setPending(null);
    setSelection(null);
    dragRef.current = { startKm: km, startClientX: e.clientX };
  }

  function onUp(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startClientX);
    if (dx <= 5 && onClickDist) {
      const { x, y } = getSvgXY(e);
      setSelection(null);
      setPending({
        distM: dragRef.current.startKm * 1000,
        x: Math.max(ML + 15, Math.min(ML + plotW - 15, x)),
        y: Math.max(MT + 15, Math.min(MT + plotH - 15, y)),
      });
    }
    dragRef.current = null;
  }

  // Selection stats
  const selStats = useMemo(() => {
    if (!selection || !segments?.length) return null;
    const fromM = selection.startKm * 1000, toM = selection.endKm * 1000;
    let timeSec = 0, distM = 0;
    for (const seg of segments) {
      if (seg.endDist <= fromM || seg.startDist >= toM) continue;
      const cover = Math.min(seg.endDist, toM) - Math.max(seg.startDist, fromM);
      timeSec += (cover / 1000) * seg.targetPaceSecPerKm;
      distM += cover;
    }
    if (distM === 0) return null;
    return {
      distKm: distM / 1000,
      avgPace: timeSec / (distM / 1000),
      durationMs: timeSec * 1000,
    };
  }, [selection, segments]);

  const hoverPace = hover && segments?.length ? paceAtDist(segments, hover.km * 1000) : null;
  const hoverEta = hoverPace && segments && raceStartTime && hover
    ? elapsedMsAtDist(segments, checkpoints, raceStartTime, hover.km * 1000) : null;

  const hoverX = hover && w > 0 ? kmToX(hover.km) : 0;
  const hoverDotY = hover && w > 0 ? eleToY(hover.ele) : 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height, userSelect: 'none' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        style={{ display: 'block', cursor: onClickDist ? 'crosshair' : 'default' }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onMouseDown={onDown}
        onMouseUp={onUp}
      >
        <defs>
          <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4caf50" stopOpacity={0.42} />
            <stop offset="100%" stopColor="#4caf50" stopOpacity={0} />
          </linearGradient>
          <clipPath id="pc">
            <rect x={ML} y={MT} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* Horizontal grid */}
        {yTicks.map((t, i) => (
          <line key={i} x1={ML} y1={t.y} x2={ML + plotW} y2={t.y}
            stroke="var(--border)" strokeWidth={0.5} />
        ))}

        {/* Selection area */}
        {selection && w > 0 && (() => {
          const sx = kmToX(selection.startKm);
          const ex = kmToX(selection.endKm);
          return (
            <rect x={sx} y={MT} width={Math.max(0, ex - sx)} height={plotH}
              fill="rgba(255,213,79,0.18)" stroke="#ffd54f" strokeWidth={1}
              clipPath="url(#pc)" />
          );
        })()}

        {/* Checkpoint reference lines */}
        {checkpoints.map(cp => {
          const x = w > 0 ? kmToX(cp.distM / 1000) : 0;
          const col = cp.type === 'aid' ? '#ffd54f' : '#8b8fa8';
          return (
            <g key={cp.id}>
              <line x1={x} y1={MT} x2={x} y2={MT + plotH}
                stroke={col} strokeWidth={1.5} clipPath="url(#pc)" />
              <text x={x + 3} y={MT + 11} fill={col} fontSize={10} clipPath="url(#pc)">
                {cp.name}
              </text>
            </g>
          );
        })}

        {/* Elevation area + line */}
        {linePath && <path d={areaPath} fill="url(#eg)" clipPath="url(#pc)" />}
        {linePath && <path d={linePath} fill="none" stroke="#4caf50" strokeWidth={1.5} clipPath="url(#pc)" />}

        {/* Hover vertical hairline + dot */}
        {hover && w > 0 && (
          <>
            <line x1={hoverX} y1={MT} x2={hoverX} y2={MT + plotH}
              stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
            <circle cx={hoverX} cy={hoverDotY} r={4}
              fill="#4caf50" stroke="#fff" strokeWidth={2} />
          </>
        )}

        {/* Y axis */}
        <rect x={0} y={0} width={ML} height={height} fill="var(--bg)" />
        {yTicks.map((t, i) => (
          <text key={i} x={ML - 5} y={t.y + 4} textAnchor="end"
            fill="var(--text-secondary)" fontSize={11}>
            {Math.round(t.ele)}m
          </text>
        ))}
        <line x1={ML} y1={MT} x2={ML} y2={MT + plotH} stroke="var(--border)" strokeWidth={1} />

        {/* X axis */}
        <rect x={0} y={MT + plotH} width="100%" height={MB + 2} fill="var(--bg)" />
        {w > 0 && xTicks.map(k => (
          <text key={k} x={kmToX(k)} y={MT + plotH + 17} textAnchor="middle"
            fill="var(--text-secondary)" fontSize={11}>
            {k}km
          </text>
        ))}
        <line x1={ML} y1={MT + plotH} x2={ML + plotW} y2={MT + plotH}
          stroke="var(--border)" strokeWidth={1} />
      </svg>

      {/* Hover tooltip */}
      {hover && w > 0 && (
        <div style={{
          position: 'absolute',
          left: Math.min(hoverX + 10, w - 130),
          top: Math.max(MT, hoverDotY - 70),
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7,
          pointerEvents: 'none', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,.4)',
        }}>
          <div style={{ color: 'var(--text-secondary)' }}>{hover.km.toFixed(2)} km</div>
          <div style={{ color: 'var(--green)', fontWeight: 600 }}>{Math.round(hover.ele)} m</div>
          {hoverPace && (
            <div>{formatPace(hoverPace)}<span style={{ color: 'var(--text-hint)', marginLeft: 4 }}>/km</span></div>
          )}
          {hoverEta && (
            <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>ETA {formatTime(hoverEta)}</div>
          )}
        </div>
      )}

      {/* "+" confirmation button after click */}
      {pending && onClickDist && (
        <div style={{
          position: 'absolute', top: pending.y, left: pending.x,
          transform: 'translate(-50%,-50%)', zIndex: 20, pointerEvents: 'none',
        }}>
          <button
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#4caf50', color: '#fff',
              border: '2.5px solid rgba(255,255,255,0.9)',
              fontSize: 20, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, boxShadow: '0 2px 10px rgba(0,0,0,.6)',
              lineHeight: 1, pointerEvents: 'auto',
            }}
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              onClickDist(pending.distM);
              setPending(null);
            }}
          >+</button>
        </div>
      )}

      {/* Selection range stats */}
      {selection && selStats && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '5px 10px', fontSize: 11, lineHeight: 1.6,
          zIndex: 15, boxShadow: '0 2px 8px rgba(0,0,0,.4)',
          display: 'flex', gap: 10, alignItems: 'center', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {selection.startKm.toFixed(1)}–{selection.endKm.toFixed(1)} km
          </span>
          <strong>{selStats.distKm.toFixed(1)} km</strong>
          <span>
            {formatPace(selStats.avgPace!)}<span style={{ color: 'var(--text-hint)', marginLeft: 2 }}>/km avg</span>
          </span>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>
            {formatDur(selStats.durationMs!)}
          </span>
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
