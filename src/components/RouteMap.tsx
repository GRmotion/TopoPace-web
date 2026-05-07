import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { TrackPoint, Checkpoint } from '../models/types';

interface Props {
  points: TrackPoint[];
  checkpoints: Checkpoint[];
}

export default function RouteMap({ points, checkpoints }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(mapRef.current);
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;

    routeLayerRef.current?.remove();
    const latlngs = points.map(p => [p.lat, p.lon] as L.LatLngTuple);
    routeLayerRef.current = L.polyline(latlngs, { color: '#4caf50', weight: 2.5 }).addTo(map);
    map.fitBounds(routeLayerRef.current.getBounds(), { padding: [20, 20] });
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    checkpoints.forEach(cp => {
      const closestPt = findClosest(points, cp.distM);
      if (!closestPt) return;
      const color = cp.type === 'aid' ? '#ffd54f' : '#8b8fa8';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #000;"></div>`,
        iconAnchor: [5, 5],
      });
      const marker = L.marker([closestPt.lat, closestPt.lon], { icon })
        .bindTooltip(cp.name, { permanent: false })
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [points, checkpoints]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }} />
  );
}

function findClosest(points: TrackPoint[], distM: number): TrackPoint | null {
  if (points.length === 0) return null;
  let lo = 0, hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distFromStart <= distM) lo = mid; else hi = mid;
  }
  return Math.abs(points[lo].distFromStart - distM) < Math.abs(points[hi].distFromStart - distM)
    ? points[lo] : points[hi];
}
