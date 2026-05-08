import { useRef, useState, useLayoutEffect, useEffect, useMemo } from 'react';
import type { TrackPoint, Checkpoint, TrackSegment, TerrainSegment } from '../models/types';
import { paceAtDist, elapsedMsAtDist, formatTime, formatPace } from '../algorithm/PacePlanner';

const ML = 50, MR = 14, MT = 10, MB = 28;

interface Props {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  segments?: TrackSegment[];
  raceStartTime?: string;
  height?: number;
  terrainSegments?: TerrainSegment[];
  onClickDist?: (distM: number) => void;
  onHoverDist?: (distM: number | null) => void;
  onMarkSelection?: (startKm: number, endKm: number) => void;
  onUpdateTerrain?: (id: string, difficultyPercent: number) => void;
  onRemoveTerrain?: (id: string) => void;
}

interface DPt { km: number; ele: number; }

function bs(data: DPt[], km: number): DPt {
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

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

function terrainColor(pct: number, alpha = 0.18): string {
  if (pct > 0) return `rgba(244,67,54,${alpha})`;
  if (pct < 0) return `rgba(33,150,243,${alpha})`;
  return `rgba(140,143,168,${alpha})`;
}
function terrainStroke(pct: number): string {
  if (pct > 0) return '#f44336';
  if (pct < 0) return '#2196f3';
  return '#8b8fa8';
}

export default function ElevationChart({
  points, checkpoints, segments, raceStartTime, height = 200,
  terrainSegments, onClickDist, onHoverDist,
  onMarkSelection, onUpdateTerrain, onRemoveTerrain,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startKm: number; startClientX: number } | null>(null);

  const [w, setW] = useState(0);
  const [hover, setHover] = useState<{ km: number; ele: number } | null>(null);
  const [selection, setSelection] = useState<{ startKm: number; endKm: number } | null>(null);
  const [pending, setPending] = useState<{ distM: number; x: number; y: number } | null>(null);
  const [gearPopup, setGearPopup] = useState<{
    id: string; clientX: number; clientY: number; inputVal: string;
  } | null>(null);

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
  const minEle = Math.min(...eles), maxEle = Math.max(...eles);
  const eleRange = Math.max(maxEle - minEle, 1);
  const kmSpan = Math.max(maxKm - minKm, 0.001);
  const plotW = Math.max(1, w - ML - MR);
  const plotH = Math.max(1, height - MT - MB);

  const kmToX = (km: number) => ML + ((km - minKm) / kmSpan) * plotW;
  const eleToY = (ele: number) => MT + (1 - (ele - minEle) / eleRange) * plotH;

  function getSvgXY(e: React.MouseEvent): { x: number; y: number } {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
  }
  function svgXToKm(x: number): number | null {
    if (x < ML || x > ML + plotW) return null;
    return minKm + ((x - ML) / plotW) * kmSpan;
  }

  // Paths
  const pts = w > 0 ? data.map(d => `${kmToX(d.km).toFixed(1)},${eleToY(d.ele).toFixed(1)}`).join(' L ') : '';
  const linePath = pts ? `M ${pts}` : '';
  const areaPath = pts ? `M ${pts} L ${kmToX(maxKm).toFixed(1)},${(MT + plotH).toFixed(1)} L ${kmToX(minKm).toFixed(1)},${(MT + plotH).toFixed(1)} Z` : '';

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
    const { x } = getSvgXY(e);
    const km = svgXToKm(x);
    if (km == null) {
      if (!dragRef.current) { setHover(null); onHoverDist?.(null); }
      return;
    }
    const nearest = bs(data, km);
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
    // Close gear popup on any SVG click
    if (gearPopup) { setGearPopup(null); return; }
    // Dismiss pending "+" without starting a new drag
    if (pending) { setPending(null); return; }
    const { x } = getSvgXY(e);
    const km = svgXToKm(x);
    if (km == null) return;
    e.preventDefault();
    setSelection(null);
    dragRef.current = { startKm: km, startClientX: e.clientX };
  }

  function onUp(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startClientX);
    if (dx <= 5 && onClickDist) {
      // Snap "+" to the elevation line at that km
      const km = dragRef.current.startKm;
      const nearest = bs(data, km);
      const dotX = w > 0 ? kmToX(km) : ML;
      const dotY = w > 0 ? eleToY(nearest.ele) : MT + plotH / 2;
      setSelection(null);
      setPending({
        distM: km * 1000,
        x: Math.max(ML + 15, Math.min(ML + plotW - 15, dotX)),
        y: Math.max(MT + 15, Math.min(MT + plotH - 20, dotY)),
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
    return { distKm: distM / 1000, avgPace: timeSec / (distM / 1000), durationMs: timeSec * 1000 };
  }, [selection, segments]);

  const hoverPace = hover && segments?.length ? paceAtDist(segments, hover.km * 1000) : null;
  const hoverEta = hoverPace && segments && raceStartTime && hover
    ? elapsedMsAtDist(segments, checkpoints, raceStartTime, hover.km * 1000) : null;
  const hx = hover && w > 0 ? kmToX(hover.km) : 0;
  const hy = hover && w > 0 ? eleToY(hover.ele) : 0;

  function applyGear() {
    if (!gearPopup) return;
    const pct = parseFloat(gearPopup.inputVal);
    if (!isNaN(pct)) onUpdateTerrain?.(gearPopup.id, pct);
    setGearPopup(null);
  }

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

        {/* Grid */}
        {yTicks.map((t, i) => (
          <line key={i} x1={ML} y1={t.y} x2={ML + plotW} y2={t.y}
            stroke="var(--border)" strokeWidth={0.5} />
        ))}

        {/* Terrain regions */}
        {w > 0 && terrainSegments?.map(t => {
          const x1 = kmToX(t.startKm), x2 = kmToX(t.endKm);
          return (
            <rect key={t.id} x={x1} y={MT} width={Math.max(0, x2 - x1)} height={plotH}
              fill={terrainColor(t.difficultyPercent)}
              stroke={terrainStroke(t.difficultyPercent)}
              strokeWidth={1.5}
              clipPath="url(#pc)" />
          );
        })}

        {/* Selection area */}
        {selection && w > 0 && (() => {
          const sx = kmToX(selection.startKm), ex = kmToX(selection.endKm);
          return <rect x={sx} y={MT} width={Math.max(0, ex - sx)} height={plotH}
            fill="rgba(255,213,79,0.18)" stroke="#ffd54f" strokeWidth={1} clipPath="url(#pc)" />;
        })()}

        {/* Checkpoint lines */}
        {checkpoints.map(cp => {
          const x = w > 0 ? kmToX(cp.distM / 1000) : 0;
          const col = cp.type === 'aid' ? '#ffd54f' : '#8b8fa8';
          return (
            <g key={cp.id}>
              <line x1={x} y1={MT} x2={x} y2={MT + plotH} stroke={col} strokeWidth={1.5} clipPath="url(#pc)" />
              <text x={x + 3} y={MT + 11} fill={col} fontSize={10} clipPath="url(#pc)">{cp.name}</text>
            </g>
          );
        })}

        {/* Elevation area + line */}
        {linePath && <path d={areaPath} fill="url(#eg)" clipPath="url(#pc)" />}
        {linePath && <path d={linePath} fill="none" stroke="#4caf50" strokeWidth={1.5} clipPath="url(#pc)" />}

        {/* Hover hairline + dot */}
        {hover && w > 0 && (
          <>
            <line x1={hx} y1={MT} x2={hx} y2={MT + plotH}
              stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
            <circle cx={hx} cy={hy} r={4} fill="#4caf50" stroke="#fff" strokeWidth={2} />
          </>
        )}

        {/* Y axis */}
        <rect x={0} y={0} width={ML} height={height} fill="var(--bg)" />
        {yTicks.map((t, i) => (
          <text key={i} x={ML - 5} y={t.y + 4} textAnchor="end" fill="var(--text-secondary)" fontSize={11}>
            {Math.round(t.ele)}m
          </text>
        ))}
        <line x1={ML} y1={MT} x2={ML} y2={MT + plotH} stroke="var(--border)" strokeWidth={1} />

        {/* X axis */}
        <rect x={0} y={MT + plotH} width="100%" height={MB + 2} fill="var(--bg)" />
        {w > 0 && xTicks.map(k => (
          <text key={k} x={kmToX(k)} y={MT + plotH + 17} textAnchor="middle"
            fill="var(--text-secondary)" fontSize={11}>{k}km</text>
        ))}
        <line x1={ML} y1={MT + plotH} x2={ML + plotW} y2={MT + plotH}
          stroke="var(--border)" strokeWidth={1} />
      </svg>

      {/* Hover tooltip */}
      {hover && w > 0 && (
        <div style={{
          position: 'absolute',
          left: Math.min(hx + 10, w - 130),
          top: Math.max(MT, hy - 70),
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7,
          pointerEvents: 'none', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,.4)',
        }}>
          <div style={{ color: 'var(--text-secondary)' }}>{hover.km.toFixed(2)} km</div>
          <div style={{ color: 'var(--green)', fontWeight: 600 }}>{Math.round(hover.ele)} m</div>
          {hoverPace && <div>{formatPace(hoverPace)}<span style={{ color: 'var(--text-hint)', marginLeft: 4 }}>/km</span></div>}
          {hoverEta && <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>ETA {formatTime(hoverEta)}</div>}
        </div>
      )}

      {/* "+" button snapped to elevation line */}
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
            onClick={e => { e.stopPropagation(); onClickDist(pending.distM); setPending(null); }}
          >+</button>
        </div>
      )}

      {/* Terrain gear icons — positioned at start of each terrain region */}
      {w > 0 && terrainSegments?.map(t => {
        const gx = kmToX(t.startKm);
        const pct = t.difficultyPercent;
        const col = terrainStroke(pct);
        const label = `⚙ ${pct > 0 ? '+' : ''}${pct}%`;
        return (
          <div key={t.id} style={{
            position: 'absolute',
            left: Math.max(ML + 2, Math.min(ML + plotW - 50, gx)),
            top: MT + 2,
            zIndex: 22, pointerEvents: 'auto',
          }}>
            <button
              style={{
                background: col, color: '#fff', border: 'none', borderRadius: 3,
                fontSize: 9, padding: '1px 5px', cursor: 'pointer', fontWeight: 700,
                lineHeight: 1.6, boxShadow: '0 1px 4px rgba(0,0,0,.35)', whiteSpace: 'nowrap',
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setGearPopup({ id: t.id, clientX: rect.left, clientY: rect.bottom + 4, inputVal: String(pct) });
              }}
            >{label}</button>
          </div>
        );
      })}

      {/* Selection stats bar */}
      {selection && selStats && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '5px 10px', fontSize: 11, lineHeight: 1.6,
          zIndex: 15, boxShadow: '0 2px 8px rgba(0,0,0,.4)',
          display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {selection.startKm.toFixed(1)}–{selection.endKm.toFixed(1)} km
          </span>
          <strong>{selStats.distKm.toFixed(1)} km</strong>
          <span>{formatPace(selStats.avgPace)}<span style={{ color: 'var(--text-hint)', marginLeft: 2 }}>/km avg</span></span>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{fmtDur(selStats.durationMs)}</span>
          {onMarkSelection && (
            <button
              style={{
                padding: '2px 8px', background: 'var(--green)', color: '#000',
                border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', pointerEvents: 'auto',
              }}
              onMouseDown={e => e.stopPropagation()}
              onMouseUp={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                onMarkSelection(selection.startKm, selection.endKm);
                setSelection(null);
              }}
            >Mark segment</button>
          )}
          <button
            style={{ padding: 0, background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0, pointerEvents: 'auto' }}
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setSelection(null); }}
          >×</button>
        </div>
      )}

      {/* Gear popup (fixed to viewport, not clipped by parent overflow) */}
      {gearPopup && (
        <>
          {/* Click-outside overlay */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onMouseDown={() => setGearPopup(null)}
          />
          <div
            style={{
              position: 'fixed',
              left: Math.min(gearPopup.clientX, window.innerWidth - 204),
              top: Math.min(gearPopup.clientY, window.innerHeight - 160),
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px', zIndex: 1000,
              boxShadow: '0 4px 20px rgba(0,0,0,.55)',
              width: 190, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8,
            }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>Terrain difficulty</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5 }}>
              +% slower (rocks, mud) · −% faster (road)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number" min={-80} max={200} step={1}
                value={gearPopup.inputVal}
                onChange={e => setGearPopup(g => g ? { ...g, inputVal: e.target.value } : null)}
                style={{ width: 64, textAlign: 'right' }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') applyGear(); if (e.key === 'Escape') setGearPopup(null); }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>%</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="primary" style={{ flex: 1, fontSize: 11, padding: '3px 6px' }} onClick={applyGear}>OK</button>
              <button
                className="ghost"
                style={{ fontSize: 11, padding: '3px 6px', color: 'var(--red)', borderColor: 'var(--red)' }}
                onClick={() => { onRemoveTerrain?.(gearPopup.id); setGearPopup(null); }}
              >Delete</button>
              <button className="ghost" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => setGearPopup(null)}>✕</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
