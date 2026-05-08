import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { TrackPoint, Checkpoint } from '../models/types';

interface Props {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  hoverDistM?: number | null;
  onClickDist?: (distM: number) => void;
}

export default function RouteMap({ points, checkpoints, hoverDistM, onClickDist }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.Layer[]>([]);
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null);
  const [addMode, setAddMode] = useState(false);
  const addModeRef = useRef(false);

  useEffect(() => { addModeRef.current = addMode; }, [addMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(mapRef.current);
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.off('click');
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!addModeRef.current || !onClickDist) return;
      const nearest = findNearest(points, e.latlng.lat, e.latlng.lng);
      if (nearest) { onClickDist(nearest.distFromStart); setAddMode(false); }
    });
  }, [points, onClickDist]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    routeLayerRef.current?.remove();
    const latlngs = points.map(p => [p.lat, p.lon] as L.LatLngTuple);
    routeLayerRef.current = L.polyline(latlngs, { color: '#ffd54f', weight: 3 }).addTo(map);
    map.fitBounds(routeLayerRef.current.getBounds(), { padding: [20, 20] });
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    checkpoints.forEach(cp => {
      const pt = findClosestByDist(points, cp.distM);
      if (!pt) return;
      const isAid = cp.type === 'aid';
      const marker = L.circleMarker([pt.lat, pt.lon] as L.LatLngTuple, {
        radius: 7,
        color: '#000',
        weight: 2,
        fillColor: isAid ? (cp.color || '#ffd54f') : '#8b8fa8',
        fillOpacity: 1,
        pane: 'markerPane',
      }).bindTooltip(cp.name || `${(cp.distM / 1000).toFixed(1)} km`, { permanent: false });
      markersRef.current.push(marker.addTo(map));
    });
  }, [points, checkpoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hoverDistM == null || points.length === 0) {
      hoverMarkerRef.current?.remove();
      hoverMarkerRef.current = null;
      return;
    }
    const pt = findClosestByDist(points, hoverDistM);
    if (!pt) return;
    const latlng: L.LatLngTuple = [pt.lat, pt.lon];
    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.setLatLng(latlng);
    } else {
      hoverMarkerRef.current = L.circleMarker(latlng, {
        radius: 8,
        color: '#fff',
        weight: 2.5,
        fillColor: '#4caf50',
        fillOpacity: 1,
        interactive: false,
        pane: 'markerPane',
      }).addTo(map);
    }
  }, [hoverDistM, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().style.cursor = addMode ? 'crosshair' : '';
  }, [addMode]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 0 }} />
      {onClickDist && (
        <button
          onClick={() => setAddMode(m => !m)}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 1000,
            padding: '6px 12px',
            fontSize: 12,
            background: addMode ? '#ffd54f' : 'var(--bg-elevated)',
            color: addMode ? '#000' : 'var(--text)',
            border: `1px solid ${addMode ? '#ffd54f' : 'var(--border)'}`,
            borderRadius: 8,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,.4)',
            fontWeight: addMode ? 700 : 400,
          }}
        >
          {addMode ? '📍 Click on map…' : '📍 Add checkpoint'}
        </button>
      )}
    </div>
  );
}

function findNearest(points: TrackPoint[], lat: number, lon: number): TrackPoint | null {
  if (points.length === 0) return null;
  let best = points[0];
  let bestD = Infinity;
  for (const pt of points) {
    const dx = pt.lat - lat, dy = pt.lon - lon;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = pt; }
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
