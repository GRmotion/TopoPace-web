import { useRef, useState, useLayoutEffect, useEffect, useMemo } from 'react';
import type { TrackPoint, Checkpoint, TrackSegment, TerrainSegment, GelZone, CheckpointResult, GelResult, ProfileNote, ProfileEmoji } from '../models/types';
import EmojiPicker from './EmojiPicker';
import { paceAtDist, elapsedMsAtDist, formatTime, formatPace, formatDist, distMAtRaceElapsedMs } from '../algorithm/PacePlanner';
import { solarElevationDeg } from '../utils/solar';

const ML = 50, MR = 14, MT = 10, MB = 28;
const NOTE_FONT = 12, NOTE_LINE_H = 17, NOTE_CHAR_W = 7, NOTE_PAD = 10;
const NOTE_MIN_W = 60;

function noteSize(text: string) {
  const lines = text ? text.split('\n') : [''];
  const textH = (lines.length - 1) * NOTE_LINE_H + NOTE_FONT;
  const maxW = Math.max(NOTE_MIN_W, ...lines.map(l => l.length * NOTE_CHAR_W));
  return {
    lines,
    boxW: maxW + NOTE_PAD * 2,
    boxH: textH + NOTE_PAD * 2,
    textH,
  };
}
const STRIP_TICK_H = 10; // px from chart baseline to first label row
const STRIP_ROW_H = 36;  // px per row

interface Props {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  segments?: TrackSegment[];
  raceStartTime?: string;
  height?: number;
  terrainSegments?: TerrainSegment[];
  hoverDistM?: number | null;
  onClickDist?: (distM: number) => void;
  onHoverDist?: (distM: number | null) => void;
  onMarkSelection?: (startKm: number, endKm: number) => void;
  onUpdateTerrain?: (id: string, difficultyPercent: number) => void;
  onRemoveTerrain?: (id: string) => void;
  onResizeTerrain?: (id: string, startKm: number, endKm: number) => void;
  notes?: ProfileNote[];
  onNotesChange?: (notes: ProfileNote[]) => void;
  emojis?: ProfileEmoji[];
  onEmojisChange?: (emojis: ProfileEmoji[]) => void;
  onMoveCheckpoint?: (id: string, distM: number) => void;
  gelZones?: GelZone[];
  onGelZonesChange?: (zones: GelZone[]) => void;
  onGelRemove?: (id: string) => void;
  onClickDistTyped?: (distM: number, type: 'aid' | 'waypoint') => void;
  onAddGelAt?: (distM: number) => void;
  results?: CheckpointResult[];
  gelResults?: GelResult[];
  showScheduleLabels?: boolean;
  sunDate?: string;
  timeFormat?: '12h' | '24h';
  distUnit?: 'km' | 'mi';
  conflictTerrainIds?: Set<string>;
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

function terrainStroke(pct: number): string {
  if (pct <= 0) return '#66bb6a';
  if (pct <= 15) return '#ffd54f';
  if (pct <= 40) return '#ff9800';
  return '#f44336';
}
function terrainColor(pct: number, alpha = 0.12): string {
  const s = terrainStroke(pct);
  const hex = s.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function ElevationChart({
  points, checkpoints, segments, raceStartTime, height = 200,
  terrainSegments, gelZones, onGelZonesChange, onGelRemove, onClickDist, onClickDistTyped, onAddGelAt, onHoverDist,
  hoverDistM,
  onMarkSelection, onUpdateTerrain, onRemoveTerrain, onResizeTerrain, onMoveCheckpoint,
  notes, onNotesChange,
  emojis, onEmojisChange,
  results, gelResults, showScheduleLabels,
  sunDate,
  timeFormat = '24h', distUnit = 'km', conflictTerrainIds,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startKm: number; startClientX: number } | null>(null);
  const chartStateRef = useRef({ minKm: 0, maxKm: 0, plotW: 1, kmSpan: 1, viewStart: 0, viewEnd: 0, viewSpan: 1, plotH: 1 });
  const notesRef = useRef<ProfileNote[]>([]);
  const editingTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [w, setW] = useState(0);
  const [hover, setHover] = useState<{ km: number; ele: number } | null>(null);
  const [selection, setSelection] = useState<{ startKm: number; endKm: number } | null>(null);
  const [pending, setPending] = useState<{ distM: number; km: number; ele: number } | null>(null);
  const [activeTerrainId, setActiveTerrainId] = useState<string | null>(null);
  const [hoveredTerrainId, setHoveredTerrainId] = useState<string | null>(null);
  const [draggingTerrain, setDraggingTerrain] = useState<{ id: string; startX: number; startPct: number; currentPct: number } | null>(null);
  const [resizingTerrain, setResizingTerrain] = useState<{ id: string; edge: 'start' | 'end'; fixedKm: number; currentKm: number } | null>(null);
  const [hoveredTerrainEdge, setHoveredTerrainEdge] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  const [draggingGelId, setDraggingGelId] = useState<string | null>(null);
  const [draggingCpId, setDraggingCpId] = useState<string | null>(null);
  const [pendingMenuOpen, setPendingMenuOpen] = useState(false);
  const [zoomView, setZoomView] = useState<{ start: number; end: number } | null>(null);
  const [addingNote, setAddingNote] = useState<'idle' | 'anchor' | 'box'>('idle');
  const [pendingAnchor, setPendingAnchor] = useState<{ km: number; ele: number } | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const editingTextRef = useRef('');
  const [draggingNote, setDraggingNote] = useState<{ id: string; startClientX: number; startClientY: number } | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const middleDragRef = useRef<{ startClientX: number; startViewStart: number; startViewEnd: number } | null>(null);
  const [midPanning, setMidPanning] = useState(false);
  const [floatingEmoji, setFloatingEmoji] = useState<string | null>(null);
  const [hoveredEmojiId, setHoveredEmojiId] = useState<string | null>(null);
  const [draggingEmojiId, setDraggingEmojiId] = useState<string | null>(null);
  const [emojiTrayOpen, setEmojiTrayOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojisRef = useRef<ProfileEmoji[]>([]);

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
  useEffect(() => {
    function onMidUp(e: MouseEvent) {
      if (e.button === 1) { middleDragRef.current = null; setMidPanning(false); }
    }
    document.addEventListener('mouseup', onMidUp);
    return () => document.removeEventListener('mouseup', onMidUp);
  }, []);
  useEffect(() => {
    if (!midPanning) return;
    function onMidMove(e: MouseEvent) {
      if (!middleDragRef.current) return;
      const { startClientX, startViewStart, startViewEnd } = middleDragRef.current;
      const { plotW: pw, minKm: mk, maxKm: mxk } = chartStateRef.current;
      const span = startViewEnd - startViewStart;
      const deltaKm = ((e.clientX - startClientX) / pw) * span;
      let ns = startViewStart - deltaKm;
      let ne = startViewEnd - deltaKm;
      if (ns < mk) { ne = Math.min(mxk, ne + (mk - ns)); ns = mk; }
      if (ne > mxk) { ns = Math.max(mk, ns - (ne - mxk)); ne = mxk; }
      if (ns <= mk + 0.001 && ne >= mxk - 0.001) setZoomView(null);
      else setZoomView({ start: ns, end: ne });
    }
    document.addEventListener('mousemove', onMidMove);
    return () => document.removeEventListener('mousemove', onMidMove);
  }, [midPanning]);
  useEffect(() => {
    if (!draggingTerrain) return;
    function onMove(e: MouseEvent) {
      const delta = e.clientX - draggingTerrain!.startX;
      const newPct = Math.round(Math.max(-80, Math.min(200, draggingTerrain!.startPct + delta)));
      setDraggingTerrain(d => d ? { ...d, currentPct: newPct } : null);
      onUpdateTerrain?.(draggingTerrain!.id, newPct);
    }
    function onUp(e: MouseEvent) {
      const moved = Math.abs(e.clientX - draggingTerrain!.startX) >= 4;
      if (!moved) setActiveTerrainId(prev => prev === draggingTerrain!.id ? null : draggingTerrain!.id);
      setDraggingTerrain(null);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [draggingTerrain, onUpdateTerrain]);

  useEffect(() => {
    if (!resizingTerrain) return;
    const { id, edge, fixedKm } = resizingTerrain;
    function onMoveResize(e: MouseEvent) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      const x = e.clientX - svgRect.left;
      const { minKm: mk, maxKm: mxk, plotW: pw, viewStart: vs, viewSpan: vsp } = chartStateRef.current;
      const km = vs + ((x - ML) / pw) * vsp;
      const clamped = Math.max(mk, Math.min(mxk, km));
      setResizingTerrain(r => r ? { ...r, currentKm: clamped } : null);
      const [newStart, newEnd] = edge === 'start'
        ? [Math.min(clamped, fixedKm), Math.max(clamped, fixedKm)]
        : [Math.min(fixedKm, clamped), Math.max(fixedKm, clamped)];
      onResizeTerrain?.(id, newStart, newEnd);
    }
    function onUpResize() { setResizingTerrain(null); }
    document.addEventListener('mousemove', onMoveResize);
    document.addEventListener('mouseup', onUpResize);
    return () => { document.removeEventListener('mousemove', onMoveResize); document.removeEventListener('mouseup', onUpResize); };
  }, [resizingTerrain, onResizeTerrain]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const { minKm, maxKm, kmSpan, plotW, viewStart, viewSpan } = chartStateRef.current;
      const svgRect = el.getBoundingClientRect();
      const x = e.clientX - svgRect.left;
      const kmAtCursor = (x >= ML && x <= ML + plotW)
        ? viewStart + ((x - ML) / plotW) * viewSpan
        : viewStart + viewSpan / 2;
      const factor = e.deltaY < 0 ? 0.8 : 1.25;
      const newSpan = Math.min(kmSpan, Math.max(0.3, viewSpan * factor));
      const ratio = (kmAtCursor - viewStart) / viewSpan;
      let ns = kmAtCursor - ratio * newSpan;
      let ne = ns + newSpan;
      if (ns < minKm) { ns = minKm; ne = Math.min(maxKm, ns + newSpan); }
      if (ne > maxKm) { ne = maxKm; ns = Math.max(minKm, ne - newSpan); }
      if (ns <= minKm + 0.001 && ne >= maxKm - 0.001) { setZoomView(null); }
      else { setZoomView({ start: ns, end: ne }); }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  notesRef.current = notes ?? [];
  emojisRef.current = emojis ?? [];
  editingTextRef.current = editingText;

  useEffect(() => {
    if (!draggingNote) return;
    const { id, startClientX, startClientY } = draggingNote;
    let moved = false;
    function onMoveNote(e: MouseEvent) {
      if (!moved && (Math.abs(e.clientX - startClientX) > 4 || Math.abs(e.clientY - startClientY) > 4)) moved = true;
      if (!moved) return;
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      const x = e.clientX - svgRect.left;
      const y = e.clientY - svgRect.top;
      const { viewStart: vs, viewSpan: vsp, plotW: pw, plotH: ph } = chartStateRef.current;
      const boxKm = Math.max(vs, Math.min(vs + vsp, vs + ((x - ML) / pw) * vsp));
      const boxFracY = Math.max(0, Math.min(1, (y - MT) / ph));
      onNotesChange?.(notesRef.current.map(n => n.id === id ? { ...n, boxKm, boxFracY } : n));
    }
    function onUpNote(_e: MouseEvent) {
      if (!moved) {
        const note = notesRef.current.find(n => n.id === id);
        setEditingNoteId(id);
        setEditingText(note?.text ?? '');
      }
      setDraggingNote(null);
    }
    document.addEventListener('mousemove', onMoveNote);
    document.addEventListener('mouseup', onUpNote);
    return () => { document.removeEventListener('mousemove', onMoveNote); document.removeEventListener('mouseup', onUpNote); };
  }, [draggingNote, onNotesChange]);

  useEffect(() => {
    const el = editingTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [editingText, editingNoteId]);

  useEffect(() => {
    if (!editingNoteId) return;
    function onDocDown(e: MouseEvent) {
      if (editingTextareaRef.current?.contains(e.target as Node)) return;
      onNotesChange?.(notesRef.current.map(n => n.id === editingNoteId ? { ...n, text: editingTextRef.current } : n));
      setEditingNoteId(null);
    }
    document.addEventListener('mousedown', onDocDown, true);
    return () => document.removeEventListener('mousedown', onDocDown, true);
  }, [editingNoteId, onNotesChange]);

  useEffect(() => {
    if (!floatingEmoji && !emojiPickerOpen) return;
    function onEscKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (emojiPickerOpen) setEmojiPickerOpen(false);
        if (floatingEmoji) setFloatingEmoji(null);
        e.preventDefault();
      }
    }
    document.addEventListener('keydown', onEscKey);
    return () => document.removeEventListener('keydown', onEscKey);
  }, [floatingEmoji, emojiPickerOpen]);

  useEffect(() => {
    if (!draggingEmojiId) return;
    function onMoveEmoji(e: MouseEvent) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;
      const x = e.clientX - svgRect.left;
      const y = e.clientY - svgRect.top;
      const { viewStart: vs, viewSpan: vsp, plotW: pw, plotH: ph } = chartStateRef.current;
      const km = Math.max(vs, Math.min(vs + vsp, vs + ((x - ML) / pw) * vsp));
      const fracY = Math.max(0, Math.min(1, (y - MT) / ph));
      onEmojisChange?.(emojisRef.current.map(em => em.id === draggingEmojiId ? { ...em, km, fracY } : em));
    }
    function onUpEmoji() { setDraggingEmojiId(null); }
    document.addEventListener('mousemove', onMoveEmoji);
    document.addEventListener('mouseup', onUpEmoji);
    return () => { document.removeEventListener('mousemove', onMoveEmoji); document.removeEventListener('mouseup', onUpEmoji); };
  }, [draggingEmojiId, onEmojisChange]);

  const data = useMemo<DPt[]>(() =>
    points
      .filter((_, i) => i % Math.max(1, Math.floor(points.length / 600)) === 0)
      .map(p => ({ km: p.distFromStart / 1000, ele: p.ele })),
    [points]);

  const avgLat = useMemo(() => points.length ? points.reduce((s, p) => s + p.lat, 0) / points.length : 0, [points]);
  const avgLon = useMemo(() => points.length ? points.reduce((s, p) => s + p.lon, 0) / points.length : 0, [points]);

  const sunSamples = useMemo(() => {
    if (!sunDate || !segments?.length || !raceStartTime || data.length < 2) return null;
    const startUTC = new Date(`${sunDate}T${raceStartTime}:00Z`);
    const step = Math.max(1, Math.floor(data.length / 150));
    const out: { km: number; el: number }[] = [];
    for (let i = 0; i < data.length; i += step) {
      const pt = data[i];
      const elMs = elapsedMsAtDist(segments, checkpoints, raceStartTime, pt.km * 1000);
      if (elMs == null) continue;
      out.push({ km: pt.km, el: solarElevationDeg(new Date(startUTC.getTime() + elMs), avgLat, avgLon) });
    }
    return out.length >= 2 ? out : null;
  }, [sunDate, segments, checkpoints, raceStartTime, data, avgLat, avgLon]);

  if (data.length < 2) return <div ref={containerRef} style={{ height }} />;

  const minKm = data[0].km;
  const maxKm = data[data.length - 1].km;
  const eles = data.map(d => d.ele);
  const minEle = Math.min(...eles), maxEle = Math.max(...eles);
  const eleRange = Math.max(maxEle - minEle, 1);
  const kmSpan = Math.max(maxKm - minKm, 0.001);
  const plotW = Math.max(1, w - ML - MR);
  const plotH = Math.max(1, height - MT - MB);

  const viewStart = zoomView ? Math.max(minKm, zoomView.start) : minKm;
  const viewEnd   = zoomView ? Math.min(maxKm, zoomView.end)   : maxKm;
  const viewSpan  = Math.max(viewEnd - viewStart, 0.001);
  const kmToX = (km: number) => ML + ((km - viewStart) / viewSpan) * plotW;
  chartStateRef.current = { minKm, maxKm, plotW, kmSpan, viewStart, viewEnd, viewSpan, plotH };
  // Reserve top space: row 1 (terrain badges, 22px) + row 2 (cp circles, 22px) = 44px
  const badgeH = showScheduleLabels ? 44 : 0;
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
    return viewStart + ((x - ML) / plotW) * viewSpan;
  }

  // Paths
  const pts = w > 0 ? data.map(d => `${kmToX(d.km).toFixed(1)},${eleToY(d.ele).toFixed(1)}`).join(' L ') : '';
  const linePath = pts ? `M ${pts}` : '';
  const areaPath = pts ? `M ${pts} L ${kmToX(maxKm).toFixed(1)},${(MT + plotH).toFixed(1)} L ${kmToX(minKm).toFixed(1)},${(MT + plotH).toFixed(1)} Z` : '';

  // Sun elevation polyline: -18° → bottom, +90° → top of plot
  const sunLinePath = (sunSamples && w > 0)
    ? `M ${sunSamples.map(s => {
        const fracY = 1 - (s.el + 18) / 108; // clamped by clipPath
        return `${kmToX(s.km).toFixed(1)},${(MT + fracY * plotH).toFixed(1)}`;
      }).join(' L ')}`
    : null;

  // Axes
  const yStep = [5, 10, 25, 50, 100, 250, 500].find(v => eleRange / v <= 8) ?? 500;
  const yTicks: { ele: number; y: number }[] = [];
  for (let e = Math.ceil(minEle / yStep) * yStep; e <= maxEle; e += yStep)
    yTicks.push({ ele: e, y: eleToY(e) });
  const xInterval = [0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100].find(v => viewSpan / v <= 12) ?? 100;
  const xTicks: number[] = [];
  for (let k = Math.ceil(viewStart / xInterval) * xInterval; k <= viewEnd + 0.001; k += xInterval) xTicks.push(k);

  // Events
  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const { x, y } = getSvgXY(e);
    setCursorPos({ x, y });
    const km = svgXToKm(x);
    if (km == null) {
      if (!dragRef.current && !draggingGelId && !draggingCpId) { setHover(null); onHoverDist?.(null); }
      setHoveredTerrainId(null);
      return;
    }
    const EDGE_PX = 8;
    let edgeHit: { id: string; edge: 'start' | 'end' } | null = null;
    if (terrainSegments && !resizingTerrain) {
      for (const t of terrainSegments) {
        if (Math.abs(x - kmToX(t.startKm)) <= EDGE_PX) { edgeHit = { id: t.id, edge: 'start' }; break; }
        if (Math.abs(x - kmToX(t.endKm)) <= EDGE_PX) { edgeHit = { id: t.id, edge: 'end' }; break; }
      }
    }
    setHoveredTerrainEdge(edgeHit);
    const hit = terrainSegments?.find(t => km >= t.startKm && km <= t.endKm) ?? null;
    setHoveredTerrainId(hit?.id ?? null);
    const nearest = bs(data, km);
    setHover({ km, ele: nearest.ele });
    onHoverDist?.(km * 1000);
    if (draggingGelId && onGelZonesChange && gelZones) {
      const clamped = Math.max(data[0].km, Math.min(data[data.length - 1].km, km));
      onGelZonesChange(gelZones.map(z => z.id === draggingGelId ? { ...z, centerKm: clamped } : z));
      return;
    }
    if (draggingCpId && onMoveCheckpoint) {
      const clamped = Math.max(data[0].km, Math.min(data[data.length - 1].km, km));
      onMoveCheckpoint(draggingCpId, clamped * 1000);
      return;
    }
    if (dragRef.current) {
      const a = Math.min(dragRef.current.startKm, km);
      const b = Math.max(dragRef.current.startKm, km);
      setSelection({ startKm: a, endKm: b });
    }
  }

  function onLeave() {
    setCursorPos(null);
    if (!dragRef.current && !draggingGelId && !draggingCpId) { setHover(null); onHoverDist?.(null); }
    if (draggingGelId) setDraggingGelId(null);
    if (draggingCpId) setDraggingCpId(null);
    setHoveredTerrainId(null);
    setHoveredTerrainEdge(null);
  }

  function onDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button === 1) {
      e.preventDefault();
      if (zoomView) {
        middleDragRef.current = { startClientX: e.clientX, startViewStart: viewStart, startViewEnd: viewEnd };
        setMidPanning(true);
      }
      return;
    }
    if (e.button !== 0) return;
    // Drop floating emoji at clicked position
    if (floatingEmoji) {
      const { x, y } = getSvgXY(e);
      const rawKm = viewStart + ((x - ML) / plotW) * viewSpan;
      const km = Math.max(viewStart, Math.min(viewEnd, rawKm));
      const fracY = Math.max(0, Math.min(1, (y - MT) / plotH));
      const newEmoji: ProfileEmoji = { id: crypto.randomUUID(), emoji: floatingEmoji, km, fracY };
      onEmojisChange?.([...emojisRef.current, newEmoji]);
      setFloatingEmoji(null);
      e.preventDefault();
      return;
    }
    // Note adding — step 1: pick anchor on elevation line
    if (addingNote === 'anchor') {
      const { x } = getSvgXY(e);
      const km = svgXToKm(x);
      if (km == null) return;
      const nearest = bs(data, km);
      setPendingAnchor({ km: nearest.km, ele: nearest.ele });
      setAddingNote('box');
      e.preventDefault();
      return;
    }
    // Note adding — step 2: place note box
    if (addingNote === 'box' && pendingAnchor) {
      const { x, y } = getSvgXY(e);
      const boxKm = svgXToKm(x) ?? (viewStart + viewSpan / 2);
      const boxFracY = Math.max(0, Math.min(1, (y - MT) / plotH));
      const newNote: ProfileNote = {
        id: crypto.randomUUID(),
        anchorKm: pendingAnchor.km,
        anchorEle: pendingAnchor.ele,
        boxKm,
        boxFracY,
        text: '',
      };
      onNotesChange?.([...(notes ?? []), newNote]);
      setEditingNoteId(newNote.id);
      setEditingText('');
      setAddingNote('idle');
      setPendingAnchor(null);
      e.preventDefault();
      return;
    }
    // Start resize on edge hover
    if (hoveredTerrainEdge) {
      const seg = terrainSegments?.find(t => t.id === hoveredTerrainEdge.id);
      if (seg) {
        e.preventDefault();
        const fixedKm = hoveredTerrainEdge.edge === 'start' ? seg.endKm : seg.startKm;
        const movingKm = hoveredTerrainEdge.edge === 'start' ? seg.startKm : seg.endKm;
        setResizingTerrain({ id: seg.id, edge: hoveredTerrainEdge.edge, fixedKm, currentKm: movingKm });
        return;
      }
    }
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
    if (draggingCpId) { setDraggingCpId(null); return; }
    if (draggingGelId) { setDraggingGelId(null); return; }
    if (!dragRef.current) return;
    const dx = Math.abs(e.clientX - dragRef.current.startClientX);
    if (dx <= 5 && (onClickDist || onClickDistTyped || onAddGelAt)) {
      if (selection) {
        setSelection(null);
        dragRef.current = null;
        return;
      }
      const km = dragRef.current.startKm;
      const nearest = bs(data, km);
      setPendingMenuOpen(false);
      setPending({
        distM: km * 1000,
        km,
        ele: nearest.ele,
      });
    }
    dragRef.current = null;
  }

  // Active terrain stats (click on % label)
  const shownTerrainId = activeTerrainId ?? resizingTerrain?.id ?? hoveredTerrainId;
  const activeTerrain = shownTerrainId
    ? terrainSegments?.find(t => t.id === shownTerrainId) ?? null
    : null;
  const shownPct = activeTerrain
    ? (draggingTerrain?.id === activeTerrain.id ? draggingTerrain.currentPct : activeTerrain.difficultyPercent)
    : 0;
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
    let gainM = 0, lossM = 0;
    const inRange = points.filter(p => p.distFromStart >= fromM && p.distFromStart <= toM);
    for (let i = 1; i < inRange.length; i++) {
      const diff = inRange[i].ele - inRange[i - 1].ele;
      if (diff > 0) gainM += diff; else lossM -= diff;
    }
    return {
      startKm: activeTerrain.startKm, endKm: activeTerrain.endKm,
      distKm: distM / 1000, avgPace: timeSec / (distM / 1000), durationMs: timeSec * 1000,
      gainM, lossM,
    };
  }, [activeTerrain, segments, points]);

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
    let gainM = 0, lossM = 0;
    const inRange = points.filter(p => p.distFromStart >= fromM && p.distFromStart <= toM);
    for (let i = 1; i < inRange.length; i++) {
      const diff = inRange[i].ele - inRange[i - 1].ele;
      if (diff > 0) gainM += diff; else lossM -= diff;
    }
    return { distKm: distM / 1000, avgPace: timeSec / (distM / 1000), durationMs: timeSec * 1000, gainM, lossM };
  }, [selection, segments, points]);

  const timeMarkers = useMemo(() => {
    if (!segments?.length || !raceStartTime) return [];
    return [6, 12, 24, 48]
      .map(h => {
        const distM = distMAtRaceElapsedMs(segments, checkpoints, raceStartTime, h * 3600 * 1000);
        return distM !== null ? { km: distM / 1000, label: `${h}h` } : null;
      })
      .filter((x): x is { km: number; label: string } => x !== null);
  }, [segments, checkpoints, raceStartTime]);

  const hoverPace = hover && segments?.length ? paceAtDist(segments, hover.km * 1000) : null;
  const hoverEta = hoverPace && segments && raceStartTime && hover
    ? elapsedMsAtDist(segments, checkpoints, raceStartTime, hover.km * 1000) : null;
  const hx = hover && w > 0 ? kmToX(hover.km) : 0;
  const hy = hover && w > 0 ? eleToY(hover.ele) : 0;

  // External hover from map — shown only when no internal hover
  const extHoverPt = !hover && hoverDistM != null && data.length > 0
    ? bs(data, hoverDistM / 1000) : null;
  const ehx = extHoverPt && w > 0 ? kmToX(extHoverPt.km) : 0;
  const ehy = extHoverPt && w > 0 ? eleToY(extHoverPt.ele) : 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: totalSvgH, userSelect: 'none' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={totalSvgH}
        style={{ display: 'block', cursor: floatingEmoji ? 'none' : draggingEmojiId ? 'grabbing' : midPanning ? 'grabbing' : addingNote !== 'idle' ? 'crosshair' : draggingCpId || hoveredTerrainEdge || resizingTerrain ? 'ew-resize' : (onClickDist || onClickDistTyped) ? 'crosshair' : 'default' }}
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
          <marker id="note-arrowhead" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto">
            <polygon className="pn-arrowhead" points="0 0.5, 6 3, 0 5.5" fill="rgba(255,255,255,0.75)" />
          </marker>
          <linearGradient id="note-bg" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0.2} />
          </linearGradient>
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

        {/* Time markers (6h, 12h, 24h, 48h) */}
        {w > 0 && timeMarkers.map(m => {
          const x = kmToX(m.km);
          return (
            <g key={m.label}>
              <line x1={x} y1={MT} x2={x} y2={MT + plotH}
                stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="5,4"
                clipPath="url(#pc)" />
              <text x={x + 3} y={MT + plotH - 5} fontSize={9}
                fill="rgba(255,255,255,0.18)" fontFamily="Arial,sans-serif"
                clipPath="url(#pc)">{m.label}</text>
            </g>
          );
        })}

        {/* Terrain regions */}
        {w > 0 && terrainSegments?.map(t => {
          const isResizing = resizingTerrain?.id === t.id;
          let segStartKm = t.startKm, segEndKm = t.endKm;
          if (isResizing && resizingTerrain) {
            if (resizingTerrain.edge === 'start') {
              segStartKm = Math.min(resizingTerrain.currentKm, resizingTerrain.fixedKm);
              segEndKm = Math.max(resizingTerrain.currentKm, resizingTerrain.fixedKm);
            } else {
              segStartKm = Math.min(resizingTerrain.fixedKm, resizingTerrain.currentKm);
              segEndKm = Math.max(resizingTerrain.fixedKm, resizingTerrain.currentKm);
            }
          }
          const x1 = kmToX(segStartKm), x2 = kmToX(segEndKm);
          const rectPct = draggingTerrain?.id === t.id ? draggingTerrain.currentPct : t.difficultyPercent;
          return (
            <g key={t.id}>
              <rect x={x1} y={MT} width={Math.max(0, x2 - x1)} height={plotH}
                fill={terrainColor(rectPct)}
                stroke={terrainStroke(rectPct)}
                strokeWidth={1.5}
                clipPath="url(#pc)"
              />
              {hoveredTerrainEdge?.id === t.id && (
                <rect
                  x={(hoveredTerrainEdge.edge === 'start' ? kmToX(t.startKm) : kmToX(t.endKm)) - 2}
                  y={MT} width={4} height={plotH}
                  fill="rgba(255,255,255,0.45)" clipPath="url(#pc)"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        })}

        {/* Conflict flash overlay */}
        {w > 0 && conflictTerrainIds && terrainSegments?.filter(t => conflictTerrainIds.has(t.id)).map(t => {
          const x1 = kmToX(t.startKm), x2 = kmToX(t.endKm);
          return (
            <rect key={`cf-${t.id}`} x={x1} y={MT} width={Math.max(0, x2 - x1)} height={plotH}
              fill="rgba(244,67,54,0.55)" clipPath="url(#pc)"
              className="terrain-conflict-flash" />
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
            const col = cp.color || (cp.type === 'aid' ? '#ffd54f' : '#8b8fa8');
            const num = cpIdxMap.get(cp.id) ?? fallbackIdx.get(cp.id) ?? 1;
            return (
              <g key={cp.id}>
                {/* Line starts from bottom of circle in schedule mode, not above it */}
                <line x1={x} y1={showScheduleLabels ? MT + 42 : MT} x2={x} y2={MT + plotH}
                  stroke={col} strokeWidth={1.5}
                  strokeDasharray={showScheduleLabels ? '4,3' : undefined}
                  clipPath="url(#pc)" />
                {showScheduleLabels ? (
                  <>
                    {cp.type === 'aid' ? (
                      <circle cx={x} cy={MT + 33} r={9} fill={col} clipPath="url(#pc)"
                        style={{ pointerEvents: 'none' }}
                      />
                    ) : (
                      /* POI: rounded triangle, circumradius≈11 → optically similar to r=9 circle */
                      <path
                        d={`M${x - 1.5} ${MT + 26.6} Q${x} ${MT + 24} ${x + 1.5} ${MT + 26.6} L${x + 8} ${MT + 37.9} Q${x + 9.5} ${MT + 40.5} ${x + 6.5} ${MT + 40.5} L${x - 6.5} ${MT + 40.5} Q${x - 9.5} ${MT + 40.5} ${x - 8} ${MT + 37.9} Z`}
                        fill={col} clipPath="url(#pc)"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                    <text x={x} y={MT + 36} textAnchor="middle" fill="#000"
                      fontSize={9} fontWeight="700" clipPath="url(#pc)"
                      style={{ pointerEvents: 'none' }}
                    >{num}</text>
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

        {/* Sun elevation line */}
        {sunLinePath && (
          <path d={sunLinePath} fill="none" stroke="#ffd54f" strokeWidth={2}
            strokeOpacity={0.5} clipPath="url(#pc)" style={{ pointerEvents: 'none' }} />
        )}

        {/* Hover hairline + dot (or + icon when picking anchor) */}
        {hover && w > 0 && (
          <>
            <line x1={hx} y1={MT} x2={hx} y2={MT + plotH}
              stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
            {addingNote === 'anchor' ? (
              <>
                <circle cx={hx} cy={hy} r={9}
                  fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.7)" strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }} />
                <line x1={hx - 5} y1={hy} x2={hx + 5} y2={hy}
                  stroke="rgba(255,255,255,0.9)" strokeWidth={2} strokeLinecap="round"
                  style={{ pointerEvents: 'none' }} />
                <line x1={hx} y1={hy - 5} x2={hx} y2={hy + 5}
                  stroke="rgba(255,255,255,0.9)" strokeWidth={2} strokeLinecap="round"
                  style={{ pointerEvents: 'none' }} />
              </>
            ) : (
              <circle cx={hx} cy={hy} r={4} fill="#4caf50" stroke="#fff" strokeWidth={2} />
            )}
          </>
        )}

        {/* External hover dot (from map) */}
        {extHoverPt && w > 0 && (
          <>
            <line x1={ehx} y1={MT} x2={ehx} y2={MT + plotH}
              stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
            <circle cx={ehx} cy={ehy} r={4} fill="#4caf50" stroke="#fff" strokeWidth={2} />
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
            fill="var(--text-secondary)" fontSize={11}>
            {distUnit === 'mi' ? `${(k * 0.621371).toFixed(0)}mi` : `${k}km`}
          </text>
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
                : (item.data as CheckpointResult).color
                  || ((item.data as CheckpointResult).type === 'aid' ? '#ffd54f' : '#8b8fa8');
              const badgeR = isGel ? 5 : 8;
              // Clamp badge so it stays inside chart x-bounds
              const bx = Math.max(ML + badgeR + 2, Math.min(ML + plotW - badgeR - 2, x));

              // Flip label left when badge is near the right edge
              const nearRight = bx > ML + plotW - 64;
              const labelAnchor = nearRight ? 'end' : 'start';
              const labelX = nearRight ? bx - badgeR - 4 : bx + badgeR + 4;
              return (
                <g key={`strip-${item.data.id}`}>
                  <line x1={x} y1={baseY} x2={x} y2={baseY + topY}
                    stroke={col} strokeWidth={1} strokeOpacity={0.38} />
                  {isGel ? (
                    <>
                      <circle cx={bx} cy={baseY + topY + badgeR} r={badgeR} fill={col} />
                      <text x={labelX} y={baseY + topY + 9} textAnchor={labelAnchor}
                        fontSize={9} fill={col} fontWeight="600" fontFamily="Arial,sans-serif">
                        {'Gel ' + (item.data as GelResult).gelNumber}
                      </text>
                      <text x={labelX} y={baseY + topY + 23} textAnchor={labelAnchor}
                        fontSize={12} fill={col} fontWeight="700" fontFamily="Arial,sans-serif">
                        {formatTime(item.data.etaMs, timeFormat)}
                      </text>
                    </>
                  ) : (
                    <>
                      {(() => {
                        const isAidBadge = (item.data as CheckpointResult).type === 'aid';
                        const cy = baseY + topY + badgeR;
                        return isAidBadge ? (
                          <circle cx={bx} cy={cy} r={badgeR} fill={col} />
                        ) : (
                          <path
                            d={`M${bx-1.3} ${cy-5.7} Q${bx} ${cy-8} ${bx+1.3} ${cy-5.7} L${bx+7.1} ${cy+4.4} Q${bx+8.4} ${cy+6.7} ${bx+5.8} ${cy+6.7} L${bx-5.8} ${cy+6.7} Q${bx-8.4} ${cy+6.7} ${bx-7.1} ${cy+4.4} Z`}
                            fill={col}
                          />
                        );
                      })()}
                      <text x={bx} y={baseY + topY + badgeR + 4}
                        textAnchor="middle" fontSize={9} fill="#000" fontWeight="800"
                        fontFamily="Arial,sans-serif">
                        {(item as { kind: 'cp'; cpIdx: number }).cpIdx}
                      </text>
                      <text x={labelX} y={baseY + topY + 11} textAnchor={labelAnchor}
                        fontSize={9} fill="var(--text-secondary)" fontFamily="Arial,sans-serif">
                        {(item.data.name ?? '').length > 12
                          ? item.data.name.slice(0, 11) + '…'
                          : item.data.name}
                      </text>
                      <text x={labelX} y={baseY + topY + 26} textAnchor={labelAnchor}
                        fontSize={13} fill="var(--text)" fontWeight="700"
                        fontFamily="Arial,sans-serif">
                        {formatTime(item.data.etaMs, timeFormat)}
                        {(item.data as CheckpointResult).type === 'aid' &&
                         (item.data as CheckpointResult).plannedStopMin > 0 && (
                          <tspan fontSize={9} fill="var(--text-hint)" fontWeight="400">
                            {' +' + (item.data as CheckpointResult).plannedStopMin + 'min'}
                          </tspan>
                        )}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </>
        )}

        {/* Checkpoint hit areas — rendered last, on top of all axis overlays, so events fire reliably */}
        {showScheduleLabels && onMoveCheckpoint && w > 0 && checkpoints.map(cp => {
          const x = kmToX(cp.distM / 1000);
          return (
            <circle key={`cp-hit-${cp.id}`}
              cx={x} cy={MT + 33} r={18}
              fill="rgba(0,0,0,0)"
              style={{ cursor: 'ew-resize', pointerEvents: 'all' }}
              onMouseDown={e => { e.stopPropagation(); setDraggingCpId(cp.id); }}
            />
          );
        })}

        {/* Gel handles */}
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

        {/* Profile notes — rendered last to stay above all chart content */}
        {w > 0 && notes?.map(note => {
          const isEditing = editingNoteId === note.id;
          const textForSize = isEditing ? editingText : note.text;
          const { lines, boxW, boxH } = noteSize(textForSize);
          const bx = kmToX(note.boxKm);
          const by = MT + note.boxFracY * plotH;
          const ax = kmToX(note.anchorKm);
          const ay = eleToY(note.anchorEle);
          const dx = ax - bx, dy = ay - by;
          const hw = boxW / 2, hh = boxH / 2;
          const tMin = Math.min(Math.abs(dx) > 0.01 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 0.01 ? hh / Math.abs(dy) : Infinity);
          const asx = bx + tMin * dx, asy = by + tMin * dy;
          const firstLineY = by - hh + NOTE_PAD + NOTE_FONT;
          const len = Math.sqrt(dx * dx + dy * dy);
          const gap = 3.5 + 20;
          const arrowEndX = len > gap ? ax - (dx / len) * gap : ax;
          const arrowEndY = len > gap ? ay - (dy / len) * gap : ay;
          const isHovered = hoveredNoteId === note.id;
          return (
            <g key={note.id}
              onMouseEnter={() => setHoveredNoteId(note.id)}
              onMouseLeave={() => setHoveredNoteId(null)}
            >
              {len >= 80 && (
                <line x1={asx} y1={asy} x2={arrowEndX} y2={arrowEndY}
                  className="pn-arrow" stroke="rgba(255,255,255,0.75)" strokeWidth={1.5}
                  markerEnd="url(#note-arrowhead)" clipPath="url(#pc)"
                  style={{ pointerEvents: 'none' }} />
              )}
              <circle cx={ax} cy={ay} r={3.5}
                className="pn-anchor" fill="rgba(255,255,255,0.85)" clipPath="url(#pc)"
                style={{ pointerEvents: 'none' }} />
              {!isEditing && (
                <rect x={bx - hw} y={by - hh} width={boxW} height={boxH}
                  rx={10} ry={10}
                  className="pn-box" fill="url(#note-bg)" stroke="rgba(255,255,255,0.8)" strokeWidth={1.5}
                  clipPath="url(#pc)"
                  style={{ cursor: 'move' }}
                  onMouseDown={e => { e.stopPropagation(); setDraggingNote({ id: note.id, startClientX: e.clientX, startClientY: e.clientY }); }}
                />
              )}
              {!isEditing && (
                <text textAnchor="middle" className="pn-text" fill="rgba(255,255,255,1)"
                  fontSize={NOTE_FONT} fontFamily="system-ui,Arial,sans-serif"
                  clipPath="url(#pc)" style={{ pointerEvents: 'none' }}>
                  {lines.map((line, i) => (
                    <tspan key={i} x={bx} y={firstLineY + i * NOTE_LINE_H}>{line || ' '}</tspan>
                  ))}
                </text>
              )}
              {!isEditing && isHovered && (
                <g className="pn-delete" style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onNotesChange?.(notesRef.current.filter(n => n.id !== note.id)); }}>
                  <circle cx={bx + hw - 11} cy={by - hh + 11} r={7} fill="rgba(0,0,0,0.5)" />
                  <text x={bx + hw - 11} y={by - hh + 11} textAnchor="middle"
                    dominantBaseline="central"
                    fill="#fff" fontSize={9} fontFamily="Arial,sans-serif"
                    style={{ pointerEvents: 'none' }}>✕</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Placed emojis */}
        {w > 0 && emojis?.map(em => {
          const ex = kmToX(em.km);
          const ey = MT + em.fracY * plotH;
          const isHov = hoveredEmojiId === em.id;
          const isDragging = draggingEmojiId === em.id;
          return (
            <g key={em.id}
              onMouseEnter={() => setHoveredEmojiId(em.id)}
              onMouseLeave={() => setHoveredEmojiId(null)}
            >
              <text x={ex} y={ey} textAnchor="middle" dominantBaseline="central"
                fontSize={30} clipPath="url(#pc)"
                style={{ userSelect: 'none', pointerEvents: 'none', opacity: isDragging ? 0.7 : 1 }}
              >{em.emoji}</text>
              {/* drag + hover hit area */}
              <rect x={ex - 16} y={ey - 16} width={32} height={32} fill="transparent" clipPath="url(#pc)"
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={e => { e.stopPropagation(); setDraggingEmojiId(em.id); }}
              />
              {isHov && !isDragging && (
                <g style={{ cursor: 'pointer' }}
                  onClick={e => { e.stopPropagation(); onEmojisChange?.(emojisRef.current.filter(e2 => e2.id !== em.id)); }}>
                  <circle cx={ex + 11} cy={ey - 11} r={7} fill="rgba(0,0,0,0.55)" />
                  <text x={ex + 11} y={ey - 11} textAnchor="middle" dominantBaseline="central"
                    fill="#fff" fontSize={9} style={{ pointerEvents: 'none' }}>✕</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Floating emoji following cursor */}
        {floatingEmoji && cursorPos && w > 0 && (
          <text x={cursorPos.x} y={cursorPos.y} textAnchor="middle" dominantBaseline="central"
            fontSize={30} style={{ pointerEvents: 'none', userSelect: 'none' }}>{floatingEmoji}</text>
        )}

        {/* Note placement preview: anchor dot + box following cursor */}
        {w > 0 && addingNote === 'box' && pendingAnchor && cursorPos && (() => {
          const { boxW, boxH } = noteSize('');
          const bx = cursorPos.x, by = cursorPos.y;
          const ax = kmToX(pendingAnchor.km), ay = eleToY(pendingAnchor.ele);
          const dx = ax - bx, dy = ay - by;
          const hw = boxW / 2, hh = boxH / 2;
          const tMin = Math.min(Math.abs(dx) > 0.01 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 0.01 ? hh / Math.abs(dy) : Infinity);
          const asx = bx + tMin * dx, asy = by + tMin * dy;
          const len = Math.sqrt(dx * dx + dy * dy);
          const gap = 3.5 + 20;
          const arrowEndX = len > gap ? ax - (dx / len) * gap : ax;
          const arrowEndY = len > gap ? ay - (dy / len) * gap : ay;
          return (
            <g style={{ pointerEvents: 'none' }}>
              <line x1={asx} y1={asy} x2={arrowEndX} y2={arrowEndY}
                stroke="rgba(255,255,255,0.75)" strokeWidth={1.5}
                markerEnd="url(#note-arrowhead)" clipPath="url(#pc)" />
              <circle cx={ax} cy={ay} r={3.5}
                fill="rgba(255,255,255,0.85)" clipPath="url(#pc)" />
              <rect x={bx - hw} y={by - hh} width={boxW} height={boxH}
                rx={10} ry={10}
                fill="rgba(255,255,255,0.4)" stroke="rgba(255,255,255,0.8)" strokeWidth={1.5}
                clipPath="url(#pc)" />
            </g>
          );
        })()}
      </svg>

      {/* Note editing textarea overlay */}
      {editingNoteId && w > 0 && (() => {
        const note = notes?.find(n => n.id === editingNoteId);
        if (!note) return null;
        const { boxW, boxH } = noteSize(editingText);
        const bx = kmToX(note.boxKm);
        const by = MT + note.boxFracY * plotH;
        return (
          <textarea
            ref={editingTextareaRef}
            value={editingText}
            onChange={e => setEditingText(e.target.value)}
            onBlur={() => {
              onNotesChange?.(notesRef.current.map(n => n.id === editingNoteId ? { ...n, text: editingTextRef.current } : n));
              setEditingNoteId(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') { setEditingNoteId(null); e.preventDefault(); }
            }}
            onMouseDown={e => e.stopPropagation()}
            autoFocus
            style={{
              position: 'absolute',
              left: bx - boxW / 2,
              top: by - boxH / 2,
              width: boxW,
              minHeight: boxH,
              height: 'auto',
              resize: 'none',
              background: 'linear-gradient(to bottom, rgba(255,255,255,0.4), rgba(255,255,255,0.2))',
              border: '1.5px solid rgba(255,255,255,0.8)',
              borderRadius: 10,
              color: 'rgba(255,255,255,1)',
              fontSize: NOTE_FONT,
              fontFamily: 'system-ui,Arial,sans-serif',
              lineHeight: `${NOTE_LINE_H}px`,
              padding: `${NOTE_PAD}px`,
              textAlign: 'center',
              outline: 'none',
              zIndex: 30,
              overflow: 'hidden',
              caretColor: '#fff',
              boxSizing: 'border-box',
            }}
          />
        );
      })()}

      {/* Hover tooltip — hidden while picking note anchor */}
      {hover && w > 0 && addingNote === 'idle' && (
        <div style={{
          position: 'absolute',
          left: Math.min(hx + 10, w - 130),
          top: Math.max(MT, hy - 70),
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 10px', fontSize: 11, lineHeight: 1.7,
          pointerEvents: 'none', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,.4)',
          opacity: hoveredNoteId || draggingEmojiId ? 0 : 1,
          transition: 'opacity 150ms ease',
        }}>
          <div style={{ color: 'var(--text-secondary)' }}>{formatDist(hover.km, distUnit)}</div>
          <div style={{ color: 'var(--green)', fontWeight: 600 }}>{Math.round(hover.ele)} m</div>
          {hoverPace && <div>{formatPace(hoverPace)}<span style={{ color: 'var(--text-hint)', marginLeft: 4 }}>/km</span></div>}
          {hoverEta && <div style={{ color: 'var(--yellow)', fontWeight: 600 }}>ETA {formatTime(hoverEta, timeFormat)}</div>}
        </div>
      )}

      {/* "+" button — hover reveals options panel; options are inline (no gap) so mouse stays in container */}
      {pending && (onClickDist || onClickDistTyped || onAddGelAt) && (() => {
        const px = Math.max(ML + 15, Math.min(ML + plotW - 15, kmToX(pending.km)));
        const py = Math.max(MT + 15, Math.min(MT + plotH - 20, eleToY(pending.ele)));
        const flipLeft = px > w - 260;
        return (
          <div
            style={{
              position: 'absolute',
              top: py,
              left: flipLeft ? px + 13 : px - 13,
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
          left: Math.max(ML, Math.min(ML + plotW - 70, kmToX(selection.startKm))) + 4,
          top: MT + 4,
          zIndex: 22, pointerEvents: 'auto',
        }}>
          <button
            style={{
              background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none',
              borderRadius: 3, fontSize: 10, padding: '0 5px', cursor: 'pointer', fontWeight: 700,
              height: 18, display: 'flex', alignItems: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,.35)',
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
        const isResizing = resizingTerrain?.id === t.id;
        const badgeStartKm = isResizing && resizingTerrain
          ? (resizingTerrain.edge === 'start'
              ? Math.min(resizingTerrain.currentKm, resizingTerrain.fixedKm)
              : Math.min(resizingTerrain.fixedKm, resizingTerrain.currentKm))
          : t.startKm;
        const gx = kmToX(badgeStartKm);
        const pct = draggingTerrain?.id === t.id ? draggingTerrain.currentPct : t.difficultyPercent;
        const col = terrainStroke(pct);
        return (
          <div key={t.id} style={{
            position: 'absolute',
            left: Math.max(ML, Math.min(ML + plotW - 70, gx)) + 4,
            top: MT + 4,
            zIndex: 22, pointerEvents: 'auto',
            display: 'flex', gap: 3, alignItems: 'center',
          }}
            onMouseEnter={() => setHoveredTerrainId(t.id)}
          >
            {/* % label — drag to change value, click to toggle stats */}
            <button
              style={{
                background: col,
                color: '#fff', border: 'none',
                borderRadius: 3, fontSize: 10, padding: '0 5px', cursor: 'ew-resize', fontWeight: 700,
                height: 18, display: 'flex', alignItems: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,.35)', whiteSpace: 'nowrap',
                userSelect: 'none',
              }}
              onMouseDown={e => {
                e.stopPropagation();
                e.preventDefault();
                setDraggingTerrain({ id: t.id, startX: e.clientX, startPct: pct, currentPct: pct });
              }}
            >{pct > 0 ? '+' : ''}{pct}%</button>
            {/* Delete button */}
            <button
              style={{
                background: col, color: '#fff', border: 'none', borderRadius: 3,
                fontSize: 8, padding: '0 5px', cursor: 'pointer',
                height: 18, display: 'flex', alignItems: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,.35)',
                opacity: hoveredTerrainId === t.id ? 1 : 0,
                transition: 'opacity 180ms',
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                onRemoveTerrain?.(t.id);
                if (activeTerrainId === t.id) setActiveTerrainId(null);
              }}
            >✕</button>
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
            {formatDist(selection.startKm, distUnit).split(' ')[0]}–{formatDist(selection.endKm, distUnit)}
          </span>
          <strong>{formatDist(selStats.distKm, distUnit)}</strong>
          <span>{formatPace(selStats.avgPace)}<span style={{ color: 'var(--text-hint)', marginLeft: 2 }}>/km avg</span></span>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{fmtDur(selStats.durationMs)}</span>
          {selStats.gainM > 1 && <span style={{ color: 'var(--green)', fontWeight: 600 }}>↗{Math.round(selStats.gainM)}m</span>}
          {selStats.lossM > 1 && <span style={{ color: '#e57373', fontWeight: 600 }}>↘{Math.round(selStats.lossM)}m</span>}
        </div>
      )}

      {/* Active terrain stats bar */}
      {shownTerrainId && activeTerrainStats && (!selection || resizingTerrain) && (
        <div style={{
          position: 'absolute', bottom: stripH + MB + 4, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: `1px solid ${terrainStroke(shownPct)}`,
          borderRadius: 8, padding: '5px 10px', fontSize: 11, lineHeight: 1.6,
          zIndex: 15, boxShadow: '0 2px 8px rgba(0,0,0,.4)',
          display: 'flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {formatDist(activeTerrainStats.startKm, distUnit).split(' ')[0]}–{formatDist(activeTerrainStats.endKm, distUnit)}
          </span>
          <strong>{formatDist(activeTerrainStats.distKm, distUnit)}</strong>
          <span>{formatPace(activeTerrainStats.avgPace)}<span style={{ color: 'var(--text-hint)', marginLeft: 2 }}>/km avg</span></span>
          <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{fmtDur(activeTerrainStats.durationMs)}</span>
          {activeTerrainStats.gainM > 1 && <span style={{ color: 'var(--green)', fontWeight: 600 }}>↗{Math.round(activeTerrainStats.gainM)}m</span>}
          {activeTerrainStats.lossM > 1 && <span style={{ color: '#e57373', fontWeight: 600 }}>↘{Math.round(activeTerrainStats.lossM)}m</span>}
        </div>
      )}

      {/* Top-right chart buttons: emoji + note */}
      <div style={{ position: 'absolute', top: MT + 4, right: MR + 6, display: 'flex', gap: 4, zIndex: 22 }}>
        {/* Emoji picker dropdown */}
        {emojiPickerOpen && onEmojisChange && (
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50 }}
            onMouseDown={e => e.stopPropagation()}>
            <EmojiPicker
              onSelect={emoji => { setFloatingEmoji(emoji); setEmojiPickerOpen(false); setEmojiTrayOpen(false); }}
              onClose={() => setEmojiPickerOpen(false)}
            />
          </div>
        )}

        {/* Emoji button with hover tray */}
        {onEmojisChange && (
          <div style={{ position: 'relative' }}
            onMouseEnter={() => { if (!emojiPickerOpen) setEmojiTrayOpen(true); }}
            onMouseLeave={() => setEmojiTrayOpen(false)}
          >
            {emojiTrayOpen && !emojiPickerOpen && (
              <div className="emoji-tray" style={{
                position: 'absolute', right: '100%', top: 0,
                display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0,
                height: 34,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8, padding: '0 4px',
                boxShadow: '0 2px 8px rgba(0,0,0,.45)',
                whiteSpace: 'nowrap',
              }}>
                {(['☀️', '💩', '💧', '🔥', '🧊'] as const).map(em => (
                  <button key={em}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); setFloatingEmoji(em); setEmojiTrayOpen(false); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: '0 3px', lineHeight: 1, borderRadius: 4 }}
                  >{em}</button>
                ))}
                {/* More emoji picker */}
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); setEmojiPickerOpen(true); setEmojiTrayOpen(false); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 3px', lineHeight: 1, display: 'flex', alignItems: 'center', borderRadius: 4 }}
                  title="More emoji…"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none"
                    stroke="var(--text-secondary)" strokeWidth="1.7" strokeLinecap="round">
                    <circle cx="10" cy="10" r="8" />
                    <line x1="10" y1="6" x2="10" y2="14" />
                    <line x1="6" y1="10" x2="14" y2="10" />
                  </svg>
                </button>
              </div>
            )}
            <button
              data-tutorial="emoji-btn"
              style={{
                background: floatingEmoji || emojiPickerOpen ? 'var(--bg-elevated)' : 'var(--bg-card)',
                border: floatingEmoji || emojiPickerOpen ? '1px solid var(--green)' : '1px solid var(--border)',
                borderRadius: 8, padding: 0, cursor: 'pointer',
                width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,.35)', userSelect: 'none', flexShrink: 0,
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                if (floatingEmoji) { setFloatingEmoji(null); return; }
                setEmojiPickerOpen(o => !o);
                setEmojiTrayOpen(false);
              }}
              title={floatingEmoji ? 'Cancel emoji' : emojiPickerOpen ? 'Close picker' : 'Add emoji'}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none"
                stroke={floatingEmoji || emojiPickerOpen ? 'var(--green)' : 'var(--text-secondary)'}
                strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="10" r="8" />
                <circle cx="7.5" cy="8.5" r="0.75"
                  fill={floatingEmoji || emojiPickerOpen ? 'var(--green)' : 'var(--text-secondary)'} stroke="none" />
                <circle cx="12.5" cy="8.5" r="0.75"
                  fill={floatingEmoji || emojiPickerOpen ? 'var(--green)' : 'var(--text-secondary)'} stroke="none" />
                <path d="M7 12 Q10 14.5 13 12" />
              </svg>
            </button>
          </div>
        )}
        {onNotesChange && (
          <button
            data-tutorial="note-btn"
            style={{
              background: addingNote !== 'idle' ? 'var(--bg-elevated)' : 'var(--bg-card)',
              border: addingNote !== 'idle' ? '1px solid var(--green)' : '1px solid var(--border)',
              borderRadius: 8, padding: 0, cursor: 'pointer',
              width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,.35)', userSelect: 'none', flexShrink: 0,
            }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              if (addingNote !== 'idle') { setAddingNote('idle'); setPendingAnchor(null); }
              else setAddingNote('anchor');
            }}
            title={addingNote !== 'idle' ? 'Cancel note' : 'Add note'}
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"
              stroke={addingNote !== 'idle' ? 'var(--green)' : 'var(--text-secondary)'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.5 2.5 L13.5 4.5 L4.5 13.5 L2 14 L2.5 11.5 Z" />
              <line x1="9.5" y1="4.5" x2="11.5" y2="6.5" />
            </svg>
          </button>
        )}
      </div>

    </div>
  );
}
