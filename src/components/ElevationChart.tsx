import { useRef, useState, useLayoutEffect, useEffect, useMemo } from 'react';
import type { TrackPoint, Checkpoint, TrackSegment, TerrainSegment, GelZone, CheckpointResult, GelResult } from '../models/types';
import { paceAtDist, elapsedMsAtDist, formatTime, formatPace } from '../algorithm/PacePlanner';

const ML = 50, MR = 14, MT = 10, MB = 28;
const STRIP_TICK_H = 10; // px from chart baseline to first label row
const STRIP_ROW_H = 36;  // px per row

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
  gelZones?: GelZone[];
  onGelZonesChange?: (zones: GelZone[]) => void;
  onGelRemove?: (id: string) => void;
  onClickDistTyped?: (distM: number, type: 'aid' | 'waypoint') => void;
  onAddGelAt?: (distM: number) => void;
  results?: CheckpointResult[];
  gelResults?: GelResult[];
  showScheduleLabels?: boolean;
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

function terrainColor(pct: number, alpha = 0.12): string {
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
  terrainSegments, gelZones, onGelZonesChange, onGelRemove, onClickDist, onClickDistTyped, onAddGelAt, onHoverDist,
  onMarkSelection, onUpdateTerrain, onRemoveTerrain,
  results, gelResults, showScheduleLabels,
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
  const [activeTerrainId, setActiveTerrainId] = useState<string | null>(null);
  const [draggingGelId, setDraggingGelId] = useState<string | null>(null);
  const [pendingMenuOpen, setPendingMenuOpen] = useState(false);

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
  // In profile mode reserve top 22px for numbered badge circles so they don't overlap the line
  const badgeH = showScheduleLabels ? 22 : 0;
  const eleToY = (ele: number) => MT + badgeH + (1 - (ele - minEle) / eleRange) * (plotH - badgeH);

  // --- Strip layout (computed in render scope so kmToX is available) ---
  type StripItem =
    | { kind: 'cp'; data: CheckpointResult; cpIdx: number }
    | { kind: 'gel'; data: GelResult };

  const stripItems: StripItem[] = (showScheduleLabels && results && w > 0)
    ? ([
        ...results.map((r, i) => ({ kind: 'cp' as const, data: r, cpIdx: i + 1 })),
        ...(gelResults ?? []).map(g => ({ kind: 'gel' as const, data: g })),
      ] as StripItem[]).sort((a, b) => a.data.distM - b.data.distM)
    : [];

  const stripRowAssignments: number[] = [];
  if (stripItems.length > 0) {
    const rowRightEdges: number[] = [];
    for (const item of stripItems) {
      const x = kmToX(item.data.distM / 1000);
      const hw = item.kind === 'gel' ? 30 : 48;
      let row = 0;
      while (row < rowRightEdges.length && rowRightEdges[row] + 6 > x - hw) row++;
      if (row >= rowRightEdges.length)
        for (let r = rowRightEdges.length; r <= row; r++) rowRightEdges.push(-Infinity);
      rowRightEdges[row] = x + hw;
      stripRowAssignments.push(row);
    }
  }
  const maxStripRow = stripRowAssignments.length > 0 ? Math.max(...stripRowAssignments) : 0;
  const stripH = showScheduleLabels
    ? STRIP_TICK_H + (maxStripRow + 1) * STRIP_ROW_H + 8
    : 0;
  const totalSvgH = height + stripH;
  // --- end strip layout ---

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
  const yStep = [5, 10, 25, 50, 100, 250, 500].find(v => eleRange / v <= 8) ?? 500;
  const yTicks: { ele: number; y: number }[] = [];
  for (let e = Math.ceil(minEle / yStep) * yStep; e <= maxEle; e += yStep)
    yTicks.push({ ele: e, y: eleToY(e) });
  const xInterval = [1, 2, 5, 10, 20, 25, 50, 100].find(v => kmSpan / v <= 20) ?? 100;
  const xTicks: number[] = [];
  for (let k = Math.ceil(minKm / xInterval) * xInterval; k <= maxKm; k += xInterval) xTicks.push(k);

  // Events
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const { x } = getSvgXY(e);
    const km = svgXToKm(x);
    if (km == null) {
      if (!dragRef.current && !draggingGelId) { setHover(null); onHoverDist?.(null); }
      return;
    }
    const nearest = bs(data, km);
    setHover({ km, ele: nearest.ele });
    onHoverDist?.(km * 1000);
    if (draggingGelId && onGelZonesChange && gelZones) {
      const clamped = Math.max(data[0].km, Math.min(data[data.length - 1].km, km));
      onGelZonesChange(gelZones.map(z => z.id === draggingGelId ? { ...z, centerKm: clamped } : z));
      return;
    }
    if (dragRef.current) {
      const a = Math.min(dragRef.current.startKm, km);
      const b = Math.max(dragRef.current.startKm, km);
      setSelection({ startKm: a, endKm: b });
    }
  }

  function onLeave() {
    if (!dragRef.current && !draggingGelId) { setHover(null); onHoverDist?.(null); }
    if (draggingGelId) setDraggingGelId(null);
  }

  function onDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    // Close gear popup on any SVG click
    if (gearPopup) { setGearPopup(null); return; }
    // Close active terrain stats on any SVG click
    if (activeTerrainId) { setActiveTerrainId(null); return; }
    // Dismiss pending "+" without starting a new drag
    if (pending) { setPending(null); setPendingMenuOpen(false); return; }
    const { x } = getSvgXY(e);
    const km = svgXToKm(x);
    if (km == null) return;
    e.preventDefault();
    setSelection(null);
    dragRef.current = { startKm: km, startClientX: e.clientX };
  }

  function onUp(e: React.MouseEvent<SVGSVGElement>) {
    if (draggingGelId) { setDraggingGelId(null); return; }
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startClientX);
    if (dx <= 5 && (onClickDist || onClickDistTyped || onAddGelAt)) {
      // Snap "+" to the elevation line at that km
      const km = dragRef.current.startKm;
      const nearest = bs(data, km);
      const dotX = w > 0 ? kmToX(km) : ML;
      const dotY = w > 0 ? eleToY(nearest.ele) : MT + plotH / 2;
      setSelection(null);
      setPendingMenuOpen(false);
      setPending({
        distM: km * 1000,
        x: Math.max(ML + 15, Math.min(ML + plotW - 15, dotX)),
        y: Math.max(MT + 15, Math.min(MT + plotH - 20, dotY)),
      });
    }
    dragRef.current = null;
  }

  // Active terrain stats (click on % label)
  const activeTerrain = activeTerrainId
    ? terrainSegments?.find(t => t.id === activeTerrainId) ?? null
    : null;
  const activeTerrainStats = useMemo(() => {
    if (!activeTerrain || !segments?.length) return null;
    const fromM = activeTerrain.startKm * 1000, toM = activeTerrain.endKm * 1000;
    let timeSec = 0, distM = 0;
    for (const seg of segments) {
      if (seg.endDist <= fromM || seg.startDist >= toM) continue;
      const cover = Math.min(seg.endDist, toM) - Math.max(seg.startDist, fromM);
      timeSec += (cover / 1000) * seg.targetPaceSecPerKm;
      distM += cover;
    }
    if (distM === 0) return null;
    return {
      startKm: activeTerrain.startKm, endKm: activeTerrain.endKm,
      distKm: distM / 1000, avgPace: timeSec / (distM / 1000), durationMs: timeSec * 1000,
    };
  }, [activeTerrain, segments]);

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
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: totalSvgH, userSelect: 'none' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={totalSvgH}
        style={{ display: 'block', cursor: (onClickDist || onClickDistTyped) ? 'crosshair' : 'default' }}
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
        {w > 0 && xTicks.map(k => (
          <line key={k} x1={kmToX(k)} y1={MT} x2={kmToX(k)} y2={MT + plotH}
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
        {(() => {
          // Build id→index map from results (sorted by distM) so badge numbers match the strip
          const cpIdxMap = new Map<string, number>(
            (results ?? []).map((r, i) => [r.id, i + 1])
          );
          // Fall back to distance-sorted order when results not yet available
          const sortedCps = checkpoints.slice().sort((a, b) => a.distM - b.distM);
          const fallbackIdx = new Map<string, number>(sortedCps.map((cp, i) => [cp.id, i + 1]));

          return checkpoints.map(cp => {
            const x = w > 0 ? kmToX(cp.distM / 1000) : 0;
            const col = cp.type === 'aid' ? (cp.color || '#ffd54f') : '#8b8fa8';
            const num = cpIdxMap.get(cp.id) ?? fallbackIdx.get(cp.id) ?? 1;
            return (
              <g key={cp.id}>
                <line x1={x} y1={MT} x2={x} y2={MT + plotH}
                  stroke={col} strokeWidth={1.5}
                  strokeDasharray={showScheduleLabels ? '4,3' : undefined}
                  clipPath="url(#pc)" />
                {showScheduleLabels ? (
                  <>
                    <circle cx={x} cy={MT + 9} r={9} fill={col} clipPath="url(#pc)" />
                    <text x={x} y={MT + 13} textAnchor="middle" fill="#000"
                      fontSize={9} fontWeight="700" clipPath="url(#pc)">{num}</text>
                  </>
                ) : (
                  <text x={x + 3} y={MT + 11} fill={col} fontSize={10} clipPath="url(#pc)">{cp.name}</text>
                )}
              </g>
            );
          });
        })()}

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
        <rect x={0} y={MT + plotH} width="100%" height={showScheduleLabels ? MB : MB + 2} fill="var(--bg)" />
        {w > 0 && xTicks.map(k => (
          <text key={k} x={kmToX(k)} y={MT + plotH + 17} textAnchor="middle"
            fill="var(--text-secondary)" fontSize={11}>{k}km</text>
        ))}
        <line x1={ML} y1={MT + plotH} x2={ML + plotW} y2={MT + plotH}
          stroke="var(--border)" strokeWidth={1} />

        {/* Schedule strip — SVG elements sharing the same coordinate system */}
        {showScheduleLabels && w > 0 && (
          <>
            <line x1={ML} y1={height} x2={ML + plotW} y2={height}
              stroke="var(--border)" strokeWidth={1} />
            {stripItems.map((item, i) => {
              const x = kmToX(item.data.distM / 1000);
              const row = stripRowAssignments[i] ?? 0;
              const topY = STRIP_TICK_H + row * STRIP_ROW_H;
              const baseY = height;
              const isGel = item.kind === 'gel';
              const col = isGel
                ? '#ff9800'
                : (item.data as CheckpointResult).type === 'aid'
                  ? ((item.data as CheckpointResult).color || '#ffd54f')
                  : '#8b8fa8';
              const badgeR = isGel ? 5 : 8;
              // Clamp badge so it stays inside chart x-bounds
              const bx = Math.max(ML + badgeR + 2, Math.min(ML + plotW - badgeR - 2, x));

              return (
                <g key={`strip-${item.data.id}`}>
                  <line x1={x} y1={baseY} x2={x} y2={baseY + topY}
                    stroke={col} strokeWidth={1} strokeOpacity={0.38} />
                  {isGel ? (
                    <>
                      <circle cx={bx} cy={baseY + topY + badgeR} r={badgeR} fill={col} />
                      <text x={bx + badgeR + 4} y={baseY + topY + 9}
                        fontSize={9} fill={col} fontWeight="600" fontFamily="Arial,sans-serif">
                        {'Gel ' + (item.data as GelResult).gelNumber}
                      </text>
                      <text x={bx + badgeR + 4} y={baseY + topY + 23}
                        fontSize={12} fill={col} fontWeight="700" fontFamily="Arial,sans-serif">
                        {formatTime(item.data.etaMs)}
                      </text>
                    </>
                  ) : (
                    <>
                      <circle cx={bx} cy={baseY + topY + badgeR} r={badgeR} fill={col} />
                      <text x={bx} y={baseY + topY + badgeR + 4}
                        textAnchor="middle" fontSize={9} fill="#000" fontWeight="800"
                        fontFamily="Arial,sans-serif">
                        {(item as { kind: 'cp'; cpIdx: number }).cpIdx}
                      </text>
                      <text x={bx + badgeR + 4} y={baseY + topY + 11}
                        fontSize={9} fill="var(--text-secondary)" fontFamily="Arial,sans-serif">
                        {(item.data.name ?? '').length > 12
                          ? item.data.name.slice(0, 11) + '…'
                          : item.data.name}
                      </text>
                      <text x={bx + badgeR + 4} y={baseY + topY + 26}
                        fontSize={13} fill="var(--text)" fontWeight="700"
                        fontFamily="Arial,sans-serif">
                        {formatTime(item.data.etaMs)}
                      </text>
                      {(item.data as CheckpointResult).type === 'aid' &&
                       (item.data as CheckpointResult).plannedStopMin > 0 && (
                        <text x={bx + badgeR + 50} y={baseY + topY + 26}
                          fontSize={9} fill="var(--text-hint)" fontFamily="Arial,sans-serif">
                          {'+' + (item.data as CheckpointResult).plannedStopMin + 'm'}
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </>
        )}

        {/* Gel handles — rendered last so they're always on top */}
        {w > 0 && gelZones?.map(zone => {
          const cx = kmToX(zone.centerKm);
          const cy = eleToY(bs(data, zone.centerKm).ele);
          return (
            <circle key={`gh-${zone.id}`}
              cx={cx} cy={cy} r={6}
              fill="#ff9800" stroke="#fff" strokeWidth={2}
              style={{ cursor: 'ew-resize' }}
              onMouseDown={e => { e.stopPropagation(); setDraggingGelId(zone.id); }}
              onDoubleClick={e => { e.stopPropagation(); setDraggingGelId(null); onGelRemove?.(zone.id); }}
            />
          );
        })}
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

      {/* "+" button — hover reveals options panel; options are inline (no gap) so mouse stays in container */}
      {pending && (onClickDist || onClickDistTyped || onAddGelAt) && (() => {
        const flipLeft = pending.x > w - 260;
        return (
          <div
            style={{
              position: 'absolute',
              top: pending.y,
              left: flipLeft ? pending.x + 13 : pending.x - 13,
              transform: flipLeft ? 'translate(-100%, -50%)' : 'translateY(-50%)',
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              flexDirection: flipLeft ? 'row-reverse' : 'row',
            }}
            onMouseEnter={() => setPendingMenuOpen(true)}
            onMouseLeave={() => setPendingMenuOpen(false)}
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0, position: 'relative',
              background: 'rgba(76,175,80,0.40)',
              border: '2px solid #fff',
              boxShadow: '0 2px 10px rgba(0,0,0,.6)', cursor: 'default',
            }}>
              <svg width="12" height="12" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} viewBox="0 0 12 12">
                <line x1="6" y1="1" x2="6" y2="11" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                <line x1="1" y1="6" x2="11" y2="6" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            {pendingMenuOpen && (
              <div className="anim-pop" style={{
                display: 'flex', gap: 5, alignItems: 'center',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '5px 8px',
                boxShadow: '0 3px 12px rgba(0,0,0,0.45)', whiteSpace: 'nowrap',
                marginLeft: flipLeft ? 0 : 4, marginRight: flipLeft ? 4 : 0,
                transformOrigin: flipLeft ? 'right center' : 'left center',
              }}>
                {onClickDistTyped && (
                  <>
                    <button className="ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={e => { e.stopPropagation(); onClickDistTyped(pending.distM, 'aid'); setPending(null); setPendingMenuOpen(false); }}>
                      Aid Station
                    </button>
                    <button className="ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={e => { e.stopPropagation(); onClickDistTyped(pending.distM, 'waypoint'); setPending(null); setPendingMenuOpen(false); }}>
                      POI
                    </button>
                  </>
                )}
                {!onClickDistTyped && onClickDist && (
                  <button className="ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={e => { e.stopPropagation(); onClickDist(pending.distM); setPending(null); setPendingMenuOpen(false); }}>
                    Add
                  </button>
                )}
                {onAddGelAt && (
                  <button className="ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={e => { e.stopPropagation(); onAddGelAt(pending.distM); setPending(null); setPendingMenuOpen(false); }}>
                    Gel
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Selection "+" mark-segment button at top-left corner of selection */}
      {selection && onMarkSelection && w > 0 && (
        <div style={{
          position: 'absolute',
          left: Math.max(ML + 2, Math.min(ML + plotW - 30, kmToX(selection.startKm))),
          top: MT + 2,
          zIndex: 22, pointerEvents: 'auto',
        }}>
          <button
            style={{
              background: 'rgba(0,0,0,0.55)', color: '#fff', border: '1.5px solid transparent',
              borderRadius: 3, fontSize: 14, padding: '0px 4px', cursor: 'pointer', fontWeight: 700,
              lineHeight: 1.5, boxShadow: '0 1px 4px rgba(0,0,0,.35)',
            }}
            onMouseDown={e => e.stopPropagation()}
            onMouseUp={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              onMarkSelection(selection.startKm, selection.endKm);
              setSelection(null);
            }}
          >+</button>
        </div>
      )}

      {/* Terrain segment badges: [+X%] [⚙] */}
      {w > 0 && terrainSegments?.map(t => {
        const gx = kmToX(t.startKm);
        const pct = t.difficultyPercent;
        const col = terrainStroke(pct);
        const isActive = activeTerrainId === t.id;
        return (
          <div key={t.id} style={{
            position: 'absolute',
            left: Math.max(ML + 2, Math.min(ML + plotW - 70, gx)),
            top: MT + 2,
            zIndex: 22, pointerEvents: 'auto',
            display: 'flex', gap: 3, alignItems: 'center',
          }}>
            {/* % label — click to show stats */}
            <button
              style={{
                background: isActive ? col : 'rgba(0,0,0,0.55)',
                color: '#fff', border: isActive ? `1.5px solid ${col}` : '1.5px solid transparent',
                borderRadius: 3, fontSize: 10, padding: '1px 5px', cursor: 'pointer', fontWeight: 700,
                lineHeight: 1.6, boxShadow: '0 1px 4px rgba(0,0,0,.35)', whiteSpace: 'nowrap',
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                setActiveTerrainId(prev => prev === t.id ? null : t.id);
                setGearPopup(null);
              }}
            >{pct > 0 ? '+' : ''}{pct}%</button>
            {/* Gear icon — click to open settings */}
            <button
              style={{
                background: col, color: '#fff', border: 'none', borderRadius: 3,
                fontSize: 14, padding: '0px 5px', cursor: 'pointer',
                lineHeight: 1.5, boxShadow: '0 1px 4px rgba(0,0,0,.35)',
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setGearPopup({ id: t.id, clientX: rect.left, clientY: rect.bottom + 4, inputVal: String(pct) });
                setActiveTerrainId(null);
              }}
            >⚙</button>
          </div>
        );
      })}

      {/* Selection stats bar */}
      {selection && selStats && (
        <div style={{
          position: 'absolute', bottom: stripH + MB + 4, left: '50%', transform: 'translateX(-50%)',
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
        </div>
      )}

      {/* Active terrain stats bar */}
      {activeTerrainId && activeTerrainStats && (
        <div style={{
          position: 'absolute', bottom: stripH + MB + 4, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: `1px solid ${terrainStroke(activeTerrain!.difficultyPercent)}`,
          borderRadius: 8, padding: '5px 10px', fontSize: 11, lineHeight: 1.6,
          zIndex: 15, boxShadow: '0 2px 8px rgba(0,0,0,.4)',
          display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          <span style={{ color: terrainStroke(activeTerrain!.difficultyPercent), fontWeight: 700 }}>
            {activeTerrain!.difficultyPercent > 0 ? '+' : ''}{activeTerrain!.difficultyPercent}%
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {activeTerrainStats.startKm.toFixed(1)}–{activeTerrainStats.endKm.toFixed(1)} km
          </span>
          <strong>{activeTerrainStats.distKm.toFixed(1)} km</strong>
          <span>{formatPace(activeTerrainStats.avgPace)}<span style={{ color: 'var(--text-hint)', marginLeft: 2 }}>/km avg</span></span>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{fmtDur(activeTerrainStats.durationMs)}</span>
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
              +% — slower, -% — faster
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="no-spinners"
                type="number" min={-80} max={200} step={1}
                value={gearPopup.inputVal}
                onChange={e => setGearPopup(g => g ? { ...g, inputVal: e.target.value } : null)}
                style={{ width: 64, textAlign: 'right' }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') applyGear(); if (e.key === 'Escape') setGearPopup(null); }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>%</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setGearPopup(g => g ? { ...g, inputVal: String(Math.min(200, (parseInt(g.inputVal) || 0) + 1)) } : null)}
                  style={{ background: 'none', border: 'none', padding: '1px 4px', color: 'var(--green)', fontSize: 9, lineHeight: 1, cursor: 'pointer', borderRadius: 3 }}
                >▲</button>
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setGearPopup(g => g ? { ...g, inputVal: String(Math.max(-80, (parseInt(g.inputVal) || 0) - 1)) } : null)}
                  style={{ background: 'none', border: 'none', padding: '1px 4px', color: 'var(--green)', fontSize: 9, lineHeight: 1, cursor: 'pointer', borderRadius: 3 }}
                >▼</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="primary" style={{ flex: 1, fontSize: 11, padding: '3px 6px' }} onClick={applyGear}>OK</button>
              <button
                className="ghost"
                style={{ fontSize: 11, padding: '3px 6px', color: 'var(--red)', borderColor: 'var(--red)' }}
                onClick={() => { onRemoveTerrain?.(gearPopup.id); setGearPopup(null); }}
              >Delete</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
