import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { TrackPoint, Checkpoint } from '../models/types';

interface Props {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
  hoverDistM?: number | null;
}

export default function RouteMap({ points, checkpoints, hoverDistM }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.Layer[]>([]);
  const hoverMarkerRef = useRef<L.CircleMarker | null>(null);

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
