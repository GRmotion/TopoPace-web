import type { TrackPoint } from '../models/types';
import { smooth } from '../algorithm/ElevationSmoother';

export interface ParsedRoute {
  points: TrackPoint[];
  totalDistM: number;
  totalElevGainM: number;
  name: string;
}

export interface ParsedActivity {
  points: Array<{ distFromStart: number; ele: number; timestamp: number }>;
  totalDistM: number;
  durationSec: number;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseTrkpts(doc: Document): Array<{ lat: number; lon: number; ele: number; time?: number }> {
  const tags = ['trkpt', 'rtept', 'wpt'];
  for (const tag of tags) {
    const nodes = doc.getElementsByTagName(tag);
    if (nodes.length === 0) continue;
    const pts = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const lat = parseFloat(n.getAttribute('lat') ?? '0');
      const lon = parseFloat(n.getAttribute('lon') ?? '0');
      const eleNode = n.getElementsByTagName('ele')[0];
      const ele = eleNode ? parseFloat(eleNode.textContent ?? '0') : 0;
      const timeNode = n.getElementsByTagName('time')[0];
      const time = timeNode ? new Date(timeNode.textContent ?? '').getTime() : undefined;
      if (!isNaN(lat) && !isNaN(lon)) pts.push({ lat, lon, ele, time });
    }
    if (pts.length > 0) return pts;
  }
  return [];
}

function interpolatePoints(pts: TrackPoint[], maxSegM = 30): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    if (i === pts.length - 1) break;
    const a = pts[i], b = pts[i + 1];
    const seg = b.distFromStart - a.distFromStart;
    if (seg <= maxSegM) continue;
    const n = Math.ceil(seg / maxSegM);
    for (let j = 1; j < n; j++) {
      const t = j / n;
      out.push({
        lat: a.lat + t * (b.lat - a.lat),
        lon: a.lon + t * (b.lon - a.lon),
        ele: a.ele + t * (b.ele - a.ele),
        distFromStart: a.distFromStart + t * seg,
      });
    }
  }
  return out;
}

export function parseRoute(text: string): ParsedRoute {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const nameNode = doc.getElementsByTagName('name')[0];
  const name = nameNode?.textContent?.trim() ?? 'Route';

  const raw = parseTrkpts(doc);
  if (raw.length < 2) throw new Error('GPX file contains no valid track points');

  // Build cumulative distance
  let dist = 0;
  const pts: TrackPoint[] = raw.map((p, i) => {
    if (i > 0) dist += haversineM(raw[i - 1].lat, raw[i - 1].lon, p.lat, p.lon);
    return { distFromStart: dist, ele: p.ele, lat: p.lat, lon: p.lon };
  });

  const smoothed = smooth(pts, 100);
  const interpolated = interpolatePoints(smoothed);
  const totalDistM = interpolated[interpolated.length - 1].distFromStart;

  let gain = 0;
  for (let i = 1; i < interpolated.length; i++) {
    const delta = interpolated[i].ele - interpolated[i - 1].ele;
    if (delta > 0) gain += delta;
  }

  return { points: interpolated, totalDistM, totalElevGainM: gain, name };
}

export function parseActivity(text: string): ParsedActivity {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const raw = parseTrkpts(doc);

  const withTime = raw.filter(p => p.time !== undefined && !isNaN(p.time!));
  if (withTime.length < 10) throw new Error('GPX activity needs <time> tags (at least 10 points)');

  let dist = 0;
  const points = withTime.map((p, i) => {
    if (i > 0) dist += haversineM(withTime[i - 1].lat, withTime[i - 1].lon, p.lat, p.lon);
    return { distFromStart: dist, ele: p.ele, timestamp: p.time! };
  });

  const durationSec = (points[points.length - 1].timestamp - points[0].timestamp) / 1000;
  return { points, totalDistM: dist, durationSec };
}
