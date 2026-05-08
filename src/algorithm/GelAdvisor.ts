import type { TrackSegment, Checkpoint, TerrainSegment, GelZone, AdvancedSettings } from '../models/types';

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

// Build a time-indexed table: for each 50m segment, cumulative elapsed seconds at its midpoint
function buildTimeTable(segments: TrackSegment[]): Array<{ distM: number; elapsedSec: number }> {
  const table: Array<{ distM: number; elapsedSec: number }> = [];
  let elapsed = 0;
  for (const seg of segments) {
    const distM = (seg.startDist + seg.endDist) / 2;
    const segLen = seg.endDist - seg.startDist;
    elapsed += (segLen / 1000) * seg.targetPaceSecPerKm;
    table.push({ distM, elapsedSec: elapsed });
  }
  return table;
}

function distAtElapsed(table: Array<{ distM: number; elapsedSec: number }>, targetSec: number): number {
  if (targetSec <= 0) return table[0]?.distM ?? 0;
  if (targetSec >= table[table.length - 1].elapsedSec) return table[table.length - 1].distM;
  let lo = 0, hi = table.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid].elapsedSec <= targetSec) lo = mid; else hi = mid;
  }
  const t = (targetSec - table[lo].elapsedSec) / (table[hi].elapsedSec - table[lo].elapsedSec);
  return table[lo].distM + t * (table[hi].distM - table[lo].distM);
}

function gradeScore(gradePercent: number): number {
  const abs = Math.abs(gradePercent);
  if (abs < 3) return 3;
  if (gradePercent > 0 && gradePercent < 7) return 2;  // gentle uphill
  if (gradePercent < 0 && gradePercent > -7) return 1; // very gentle descent
  return -3; // steep anything
}

function isEasyTerrain(distM: number, terrainSegs: TerrainSegment[]): boolean {
  const km = distM / 1000;
  return terrainSegs.some(t => t.difficultyPercent < 0 && km >= t.startKm && km <= t.endKm);
}

function nearestAidDistM(distM: number, checkpoints: Checkpoint[]): number | null {
  const aids = checkpoints.filter(cp => cp.type === 'aid' && cp.distM > distM);
  if (aids.length === 0) return null;
  return aids.reduce((best, cp) => cp.distM < best.distM ? cp : best).distM;
}

// Width of the continuous flat zone around centerDistM (|grade| < 5%)
function flatZoneWidthKm(centerDistM: number, segments: TrackSegment[]): number {
  const center = segments.find(s => s.startDist <= centerDistM && s.endDist > centerDistM);
  if (!center) return 0.1;
  let lo = centerDistM, hi = centerDistM;
  for (const seg of segments) {
    if (seg.endDist <= centerDistM && Math.abs(seg.gradePercent) < 5) lo = seg.startDist;
    else if (seg.startDist > centerDistM && Math.abs(seg.gradePercent) < 5) { hi = seg.endDist; break; }
    else if (seg.startDist > centerDistM) break;
  }
  return clamp((hi - lo) / 1000, 0.1, 1.0);
}

export function computeGelZones(
  segments: TrackSegment[],
  checkpoints: Checkpoint[],
  terrainSegs: TerrainSegment[],
  settings: AdvancedSettings,
  _totalDistM: number,
): GelZone[] {
  if (!settings.gelEnabled || segments.length === 0) return [];

  const table = buildTimeTable(segments);
  const totalSec = table[table.length - 1].elapsedSec;
  const intervalSec = settings.gelIntervalMin * 60;

  // Ticks: start at half-interval to avoid taking gel right at the start
  const ticks: number[] = [];
  for (let t = intervalSec / 2; t < totalSec - intervalSec / 4; t += intervalSec) {
    ticks.push(t);
  }

  const windowSec = 5 * 60; // ±5 min search window around each tick

  const zones: GelZone[] = [];

  for (const tick of ticks) {
    // Collect candidate segments within the window
    const tickDistM = distAtElapsed(table, tick);
    const winStart = distAtElapsed(table, Math.max(0, tick - windowSec));
    const winEnd = distAtElapsed(table, Math.min(totalSec, tick + windowSec));

    const candidates = segments.filter(
      s => s.endDist > winStart && s.startDist < winEnd
    );

    let bestSeg: TrackSegment | null = null;
    let bestScore = -Infinity;

    const aidDistM = nearestAidDistM(tickDistM, checkpoints);

    for (const seg of candidates) {
      const midM = (seg.startDist + seg.endDist) / 2;
      let score = gradeScore(seg.gradePercent);

      // Bonus: 1–2 km before the next aid station
      if (aidDistM !== null) {
        const gap = aidDistM - midM;
        if (gap >= 1000 && gap <= 2000) score += 2;
      }

      // Bonus: easy terrain segment (blue = road/trail faster)
      if (isEasyTerrain(midM, terrainSegs)) score += 2;

      if (score > bestScore) { bestScore = score; bestSeg = seg; }
    }

    if (bestSeg) {
      const centerM = (bestSeg.startDist + bestSeg.endDist) / 2;
      zones.push({
        id: crypto.randomUUID(),
        centerKm: centerM / 1000,
        widthKm: flatZoneWidthKm(centerM, segments),
      });
    }
  }

  return zones;
}
