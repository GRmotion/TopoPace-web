import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { TrackPoint, Checkpoint, TrackSegment, TerrainSegment } from '../models/types';

interface Props {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  hoverDistM?: number | null;
  defaultCenter?: [number, number];
  defaultZoom?: number;
  mapStyle?: 'osm' | 'topo' | 'satellite';
  lineMode?: 'solid' | 'elevation' | 'speed' | 'terrain';
  lineColor?: string;
  planSegments?: TrackSegment[];
  terrainSegments?: TerrainSegment[];
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
        if (ts.difficultyPercent > 0) return lerpColor('#ffd54f', '#f44336', Math.min(ts.difficultyPercent / 50, 1));
        if (ts.difficultyPercent < 0) return lerpColor('#ffd54f', '#2196f3', Math.min(-ts.difficultyPercent / 50, 1));
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
  planSegments = [], terrainSegments = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayersRef = useRef<L.Polyline[]>([]);
  const markersRef = useRef<L.Layer[]>([]);
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null);

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
    if (routeLayersRef.current.length > 0) {
      const allBounds = routeLayersRef.current.map(l => l.getBounds());
      const combined = allBounds.reduce((acc, b) => acc.extend(b));
      map.fitBounds(combined, { padding: [20, 20] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, lineMode, lineColor, planSegments, terrainSegments]);

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
          fillColor: isAid ? (cp.color || '#ffd54f') : '#8b8fa8',
          fillOpacity: 1, pane: 'markerPane',
        }).bindTooltip(cp.name || `${(cp.distM / 1000).toFixed(1)} km`, { permanent: false })
          .addTo(map)
      );
    });
  }, [points, checkpoints]);

  // Hover marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hoverDistM == null || points.length === 0) {
      hoverMarkerRef.current?.remove(); hoverMarkerRef.current = null; return;
    }
    const pt = findClosestByDist(points, hoverDistM);
    if (!pt) return;
    const latlng: L.LatLngTuple = [pt.lat, pt.lon];
    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.setLatLng(latlng);
    } else {
      hoverMarkerRef.current = L.circleMarker(latlng, {
        radius: 8, color: '#fff', weight: 2.5,
        fillColor: '#4caf50', fillOpacity: 1, interactive: false, pane: 'markerPane',
      }).addTo(map);
    }
  }, [hoverDistM, points]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 0 }} />
    </div>
  );
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
