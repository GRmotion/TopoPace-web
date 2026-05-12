import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { TrackPoint, Checkpoint, TrackSegment, TerrainSegment, GelResult } from '../models/types';

interface Props {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  hoverDistM?: number | null;
  defaultCenter?: [number, number];
  defaultZoom?: number;
  mapStyle?: 'osm' | 'topo' | 'satellite';
  lineMode?: 'solid' | 'elevation' | 'speed';
  lineColor?: string;
  terrainOverlay?: boolean;
  planSegments?: TrackSegment[];
  terrainSegments?: TerrainSegment[];
  onClickDist?: (distM: number, type: 'aid' | 'waypoint') => void;
  onAddGelAt?: (distM: number) => void;
  onHoverDist?: (distM: number | null) => void;
  gelResults?: GelResult[];
  showGels?: boolean;
}

const TILE_URLS: Record<string, string> = {
  osm:       'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  topo:      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
};
const TILE_ATTRS: Record<string, string> = {
  osm:       '© OpenStreetMap contributors',
  topo:      '© OpenTopoMap contributors',
  satellite: '© Esri, Maxar, Earthstar Geographics',
};

function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const r = Math.round(((ah >> 16) & 0xff) * (1 - t) + ((bh >> 16) & 0xff) * t);
  const g = Math.round(((ah >> 8) & 0xff) * (1 - t) + ((bh >> 8) & 0xff) * t);
  const bl = Math.round((ah & 0xff) * (1 - t) + (bh & 0xff) * t);
  return `rgb(${r},${g},${bl})`;
}

function elevationColor(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.25) return lerpColor('#2196f3', '#00bcd4', c * 4);
  if (c < 0.5)  return lerpColor('#00bcd4', '#4caf50', (c - 0.25) * 4);
  if (c < 0.75) return lerpColor('#4caf50', '#ffd54f', (c - 0.5) * 4);
  return lerpColor('#ffd54f', '#f44336', (c - 0.75) * 4);
}

interface ColoredSeg { latlngs: L.LatLngTuple[]; color: string; }

function buildColoredSegments(
  points: TrackPoint[],
  mode: string,
  solidColor: string,
  planSegs: TrackSegment[],
  terrainSegs: TerrainSegment[],
): ColoredSeg[] {
  if (points.length < 2) return [];

  let minEle = Infinity, maxEle = -Infinity;
  let minPace = Infinity, maxPace = -Infinity;

  if (mode === 'elevation') {
    for (const p of points) { if (p.ele < minEle) minEle = p.ele; if (p.ele > maxEle) maxEle = p.ele; }
  } else if (mode === 'speed' && planSegs.length > 0) {
    for (const s of planSegs) {
      if (s.targetPaceSecPerKm < minPace) minPace = s.targetPaceSecPerKm;
      if (s.targetPaceSecPerKm > maxPace) maxPace = s.targetPaceSecPerKm;
    }
  }

  const result: ColoredSeg[] = [];
  let curColor = '';
  let curLatlngs: L.LatLngTuple[] = [];

  const getColor = (p: TrackPoint): string => {
    if (mode === 'elevation') {
      const t = maxEle > minEle ? (p.ele - minEle) / (maxEle - minEle) : 0;
      return elevationColor(t);
    }
    if (mode === 'speed' && planSegs.length > 0) {
      let seg = planSegs.find(s => p.distFromStart >= s.startDist && p.distFromStart < s.endDist);
      if (!seg) seg = p.distFromStart < planSegs[0].startDist ? planSegs[0] : planSegs[planSegs.length - 1];
      const t = maxPace > minPace ? (seg.targetPaceSecPerKm - minPace) / (maxPace - minPace) : 0;
      return lerpColor('#4caf50', '#f44336', t);
    }
    if (mode === 'terrain') {
      const km = p.distFromStart / 1000;
      const ts = terrainSegs.find(t => km >= t.startKm && km < t.endKm);
      if (ts) {
        if (ts.difficultyPercent > 0) return lerpColor('#ffd54f', '#f44336', Math.min(ts.difficultyPercent / 5, 1));
        if (ts.difficultyPercent < 0) return lerpColor('#ffd54f', '#2196f3', Math.min(-ts.difficultyPercent / 5, 1));
        return '#8b8fa8';
      }
    }
    return solidColor;
  };

  for (let i = 0; i < points.length; i++) {
    const color = getColor(points[i]);
    if (color !== curColor) {
      if (curLatlngs.length >= 2) result.push({ latlngs: curLatlngs, color: curColor });
      curColor = color;
      curLatlngs = i > 0
        ? [[points[i - 1].lat, points[i - 1].lon], [points[i].lat, points[i].lon]]
        : [[points[i].lat, points[i].lon]];
    } else {
      curLatlngs.push([points[i].lat, points[i].lon]);
    }
  }
  if (curLatlngs.length >= 2) result.push({ latlngs: curLatlngs, color: curColor });
  return result;
}

export default function RouteMap({
  points, checkpoints, hoverDistM, defaultCenter, defaultZoom = 10,
  mapStyle = 'osm', lineMode = 'solid', lineColor = '#ffd54f',
  terrainOverlay = false, planSegments = [], terrainSegments = [],
  onClickDist, onAddGelAt, onHoverDist, gelResults = [], showGels = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayersRef = useRef<L.Polyline[]>([]);
  const terrainOverlayLayersRef = useRef<L.Polyline[]>([]);
  const markersRef = useRef<L.Layer[]>([]);
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null);
  const hoverFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hitPolylineRef = useRef<L.Polyline | null>(null);
  const pendingMarkerRef = useRef<L.Marker | null>(null);
  const gelMarkersRef = useRef<L.Layer[]>([]);
  const onClickDistRef = useRef(onClickDist);
  onClickDistRef.current = onClickDist;
  const onAddGelAtRef = useRef(onAddGelAt);
  onAddGelAtRef.current = onAddGelAt;
  const onHoverDistRef = useRef(onHoverDist);
  onHoverDistRef.current = onHoverDist;
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // Map init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, { zoomControl: true });
    if (points.length === 0 && defaultCenter) mapRef.current.setView(defaultCenter, defaultZoom);
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tile layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileLayerRef.current?.remove();
    tileLayerRef.current = L.tileLayer(TILE_URLS[mapStyle], {
      attribution: TILE_ATTRS[mapStyle],
      maxZoom: mapStyle === 'topo' ? 17 : 19,
    }).addTo(map);
  }, [mapStyle]);

  // Fit bounds only when route changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    const bounds = L.polyline(points.map(p => [p.lat, p.lon] as L.LatLngTuple)).getBounds();
    map.fitBounds(bounds, { padding: [20, 20] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Hit polyline — transparent wide line for map→chart hover
  useEffect(() => {
    const map = mapRef.current;
    hitPolylineRef.current?.remove();
    hitPolylineRef.current = null;
    if (!map || points.length === 0) return;
    const poly = L.polyline(points.map(p => [p.lat, p.lon] as L.LatLngTuple), {
      weight: 80, opacity: 0, interactive: true,
    }).addTo(map);
    poly.on('mousemove', (e: L.LeafletMouseEvent) => {
      const pt = findClosestByLatLng(pointsRef.current, e.latlng);
      if (pt) onHoverDistRef.current?.(pt.distFromStart);
    });
    poly.on('mouseout', () => onHoverDistRef.current?.(null));
    hitPolylineRef.current = poly;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { poly.remove(); hitPolylineRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Route line
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    routeLayersRef.current.forEach(l => l.remove());
    routeLayersRef.current = [];

    const segs = buildColoredSegments(points, lineMode, lineColor, planSegments, terrainSegments);
    segs.forEach(seg => {
      routeLayersRef.current.push(
        L.polyline(seg.latlngs, { color: seg.color, weight: 3, smoothFactor: lineMode === 'solid' ? 1 : 0 }).addTo(map)
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, lineMode, lineColor, planSegments, terrainSegments]);

  // Terrain overlay — dashed colored polylines per segment
  useEffect(() => {
    const map = mapRef.current;
    terrainOverlayLayersRef.current.forEach(l => l.remove());
    terrainOverlayLayersRef.current = [];
    if (!map || !terrainOverlay || terrainSegments.length === 0 || points.length === 0) return;
    terrainSegments.forEach(seg => {
      const segPts = points.filter(p => {
        const km = p.distFromStart / 1000;
        return km >= seg.startKm && km <= seg.endKm;
      });
      if (segPts.length < 2) return;
      const pct = seg.difficultyPercent;
      const color = pct > 0
        ? lerpColor('#ffd54f', '#f44336', Math.min(pct / 5, 1))
        : pct < 0
          ? lerpColor('#ffd54f', '#2196f3', Math.min(-pct / 5, 1))
          : '#8b8fa8';
      terrainOverlayLayersRef.current.push(
        L.polyline(segPts.map(p => [p.lat, p.lon] as L.LatLngTuple), {
          color, weight: 5, dashArray: '8 6', opacity: 0.85,
        }).addTo(map)
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrainOverlay, terrainSegments, points]);

  // Checkpoint markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    checkpoints.forEach(cp => {
      const pt = findClosestByDist(points, cp.distM);
      if (!pt) return;
      const isAid = cp.type === 'aid';
      markersRef.current.push(
        L.circleMarker([pt.lat, pt.lon], {
          radius: 7, color: '#000', weight: 2,
          fillColor: cp.color || (isAid ? '#ffd54f' : '#8b8fa8'),
          fillOpacity: 1, pane: 'markerPane',
        }).bindTooltip(cp.name || `${(cp.distM / 1000).toFixed(1)} km`, { permanent: false })
          .addTo(map)
      );
    });
  }, [points, checkpoints]);

  // Gel markers
  useEffect(() => {
    const map = mapRef.current;
    gelMarkersRef.current.forEach(m => (m as L.Layer).remove());
    gelMarkersRef.current = [];
    if (!map || !showGels || gelResults.length === 0 || points.length === 0) return;
    gelResults.forEach(g => {
      const pt = findClosestByDist(points, g.distM);
      if (!pt) return;
      gelMarkersRef.current.push(
        L.circleMarker([pt.lat, pt.lon], {
          radius: 6, color: '#fff', weight: 1.5,
          fillColor: '#ff9800', fillOpacity: 1, pane: 'markerPane',
        }).bindTooltip(`Gel ${g.gelNumber}`, { permanent: false }).addTo(map)
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGels, gelResults, points]);

  // Clear pending pin when route changes
  useEffect(() => {
    pendingMarkerRef.current?.remove();
    pendingMarkerRef.current = null;
  }, [points]);

  // Map click → snapped "+" pin with hover menu
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const clearPending = () => {
      pendingMarkerRef.current?.remove();
      pendingMarkerRef.current = null;
    };
    const handler = (e: L.LeafletMouseEvent) => {
      // Second click outside pin → dismiss
      if (pendingMarkerRef.current) { clearPending(); return; }
      const dist = onClickDistRef.current;
      const gel = onAddGelAtRef.current;
      if (!dist && !gel) return;
      const pts = pointsRef.current;
      if (pts.length === 0) return;
      const closest = findClosestByLatLng(pts, e.latlng);
      if (!closest) return;
      const snapped: L.LatLngTuple = [closest.lat, closest.lon];
      const containerPt = map.latLngToContainerPoint(snapped);
      const flipLeft = containerPt.x > map.getSize().x - 170;
      const menuPos = flipLeft
        ? 'right:18px;top:0;transform:translateY(-50%);'
        : 'left:18px;top:0;transform:translateY(-50%);';
      const btns = [
        ...(dist ? [
          `<button data-act="aid" style="cursor:pointer;border:none;border-radius:6px;padding:4px 9px;background:#4caf50;color:#000;font-weight:600;font-size:11px;white-space:nowrap;font-family:inherit;">Aid Station</button>`,
          `<button data-act="poi" style="cursor:pointer;border:1px solid #2a2d3a;border-radius:6px;padding:4px 9px;background:transparent;color:#8b8fa8;font-size:11px;white-space:nowrap;font-family:inherit;">POI</button>`,
        ] : []),
        ...(gel ? [
          `<button data-act="gel" style="cursor:pointer;border:1px solid #2a2d3a;border-radius:6px;padding:4px 9px;background:transparent;color:#8b8fa8;font-size:11px;white-space:nowrap;font-family:inherit;">Gel</button>`,
        ] : []),
      ];
      const html = `<div class="map-pin-wrap" style="position:relative;width:0;height:0;overflow:visible;pointer-events:all;">
        <div class="map-pin-dot" style="width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,0.55);border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;position:absolute;transform:translate(-50%,-50%);cursor:default;">
          <svg width="12" height="12" viewBox="0 0 12 12"><line x1="6" y1="1" x2="6" y2="11" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>
        </div>
        <div class="map-pin-menu" style="display:none;position:absolute;${menuPos}gap:5px;align-items:center;background:#181b24;border:1px solid #2a2d3a;border-radius:8px;padding:5px 8px;box-shadow:0 3px 12px rgba(0,0,0,.45);white-space:nowrap;z-index:1000;">${btns.join('')}</div>
      </div>`;
      const icon = L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
      const marker = L.marker(snapped, { icon, zIndexOffset: 1000 }).addTo(map);
      pendingMarkerRef.current = marker;
      requestAnimationFrame(() => {
        const el = marker.getElement();
        if (!el) return;
        L.DomEvent.disableClickPropagation(el);
        const dot = el.querySelector('.map-pin-dot') as HTMLElement;
        const menu = el.querySelector('.map-pin-menu') as HTMLElement;
        if (!dot || !menu) return;
        // Show immediately — cursor is at the click position
        menu.style.display = 'flex';
        let hideTimer: ReturnType<typeof setTimeout> | null = null;
        const show = () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } menu.style.display = 'flex'; };
        const hide = () => { hideTimer = setTimeout(() => { menu.style.display = 'none'; }, 120); };
        dot.addEventListener('mouseenter', show);
        dot.addEventListener('mouseleave', hide);
        menu.addEventListener('mouseenter', show);
        menu.addEventListener('mouseleave', hide);
        el.querySelector('[data-act="aid"]')?.addEventListener('click', () => { onClickDistRef.current?.(closest.distFromStart, 'aid'); clearPending(); });
        el.querySelector('[data-act="poi"]')?.addEventListener('click', () => { onClickDistRef.current?.(closest.distFromStart, 'waypoint'); clearPending(); });
        el.querySelector('[data-act="gel"]')?.addEventListener('click', () => { onAddGelAtRef.current?.(closest.distFromStart); clearPending(); });
      });
    };
    map.on('click', handler);
    return () => { map.off('click', handler); clearPending(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hover marker (with 50ms fade in/out)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (hoverFadeTimerRef.current) { clearTimeout(hoverFadeTimerRef.current); hoverFadeTimerRef.current = null; }

    if (hoverDistM == null || points.length === 0) {
      const el = hoverMarkerRef.current?.getElement?.();
      if (el && hoverMarkerRef.current) {
        el.style.opacity = '0';
        const m = hoverMarkerRef.current;
        hoverFadeTimerRef.current = setTimeout(() => {
          m.remove();
          if (hoverMarkerRef.current === m) hoverMarkerRef.current = null;
          hoverFadeTimerRef.current = null;
        }, 110);
      }
      return;
    }

    const pt = findClosestByDist(points, hoverDistM);
    if (!pt) return;
    const latlng: L.LatLngTuple = [pt.lat, pt.lon];

    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.setLatLng(latlng);
      const el = hoverMarkerRef.current.getElement?.();
      if (el) el.style.opacity = '1';
    } else {
      const marker = L.circleMarker(latlng, {
        radius: 8, color: '#fff', weight: 2.5,
        fillColor: '#4caf50', fillOpacity: 1, interactive: false, pane: 'markerPane',
        className: 'lf-hover-dot',
      }).addTo(map);
      hoverMarkerRef.current = marker;
      const el = marker.getElement?.();
      if (el) {
        el.style.opacity = '0';
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; }));
      }
    }
  }, [hoverDistM, points]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 0 }} />
    </div>
  );
}

function findClosestByLatLng(points: TrackPoint[], latlng: L.LatLng): TrackPoint | null {
  if (points.length === 0) return null;
  let best = points[0], bestD2 = Infinity;
  for (const p of points) {
    const dlat = p.lat - latlng.lat, dlon = p.lon - latlng.lng;
    const d2 = dlat * dlat + dlon * dlon;
    if (d2 < bestD2) { bestD2 = d2; best = p; }
  }
  return best;
}

function findClosestByDist(points: TrackPoint[], distM: number): TrackPoint | null {
  if (points.length === 0) return null;
  let lo = 0, hi = points.length - 1;
  if (distM <= points[0].distFromStart) return points[0];
  if (distM >= points[hi].distFromStart) return points[hi];
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distFromStart <= distM) lo = mid; else hi = mid;
  }
  return Math.abs(points[lo].distFromStart - distM) < Math.abs(points[hi].distFromStart - distM)
    ? points[lo] : points[hi];
}
