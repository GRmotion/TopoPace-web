import type { TrackPoint, PersonalProfile, CalibrationResult } from '../models/types';
import { costFactor } from './MinettiModel';
import { smooth } from './ElevationSmoother';

interface ActivityPoint {
  distFromStart: number;
  ele: number;
  timestamp: number; // Unix ms
}

// Grade buckets: descents ... flat ... climbs
const GRADE_THRESHOLDS = [-0.45, -0.20, -0.10, -0.03, 0.03, 0.10, 0.20, 0.45];
const STEEP_CLIMB_GRADE = 0.08;   // ≥8% = steep uphill
const STEEP_DESCENT_GRADE = -0.08; // ≤-8% = steep downhill

function bucketIndex(grade: number): number {
  for (let i = 0; i < GRADE_THRESHOLDS.length - 1; i++) {
    if (grade < GRADE_THRESHOLDS[i + 1]) return i;
  }
  return GRADE_THRESHOLDS.length - 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 1.0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function linearRegression(xs: number[], ys: number[]): { slope: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0 };
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return { slope: den > 0 ? num / den : 0 };
}

export function analyzeActivity(
  rawPoints: ActivityPoint[],
  existing: CalibrationResult[]
): CalibrationResult {
  // Smooth elevation
  const asTrackPoints: TrackPoint[] = rawPoints.map(p => ({
    distFromStart: p.distFromStart, ele: p.ele, lat: 0, lon: 0,
  }));
  const smoothed = smooth(asTrackPoints, 100);

  const SEG = 50;
  const totalDistM = rawPoints[rawPoints.length - 1].distFromStart;
  const distKm = totalDistM / 1000;

  // Collect flat paces for baseline
  const flatPaces: number[] = [];
  const allSegments: Array<{ grade: number; paceSecPerKm: number; distM: number }> = [];

  for (let d = 0; d < totalDistM - SEG; d += SEG) {
    const p0 = interpPoint(rawPoints, smoothed, d);
    const p1 = interpPoint(rawPoints, smoothed, d + SEG);
    if (!p0 || !p1) continue;
    const grade = (p1.ele - p0.ele) / SEG;
    const elapsedSec = (p1.timestamp - p0.timestamp) / 1000;
    if (elapsedSec <= 0) continue;
    const speedMps = SEG / elapsedSec;
    if (speedMps < 0.3 || speedMps > 8) continue; // exclude stops and sprints
    const paceSecPerKm = 1000 / speedMps;
    allSegments.push({ grade, paceSecPerKm, distM: d });
    if (Math.abs(grade) < 0.03) flatPaces.push(paceSecPerKm);
  }

  if (flatPaces.length < 5 || allSegments.length < 20) {
    return mergeResults(existing, null);
  }

  const flatPace = percentile(flatPaces, 50); // median flat pace

  // Per-grade bucket: collect ratio of actual vs Minetti predicted
  const BUCKETS = 7;
  const bucketRatios: number[][] = Array.from({ length: BUCKETS }, () => []);
  const fatigueXs: number[] = [];
  const fatigueYs: number[] = [];

  // Steep climb / descent paces for max cap
  const steepClimbPaces: number[] = [];
  const steepDescentPaces: number[] = [];

  for (const seg of allSegments) {
    // ratio = actualPace / (flatPace * Minetti(grade)) = actualPace / minettiPace
    // This gives personal multiplier: 1.0 = same as Minetti, 1.2 = 20% slower
    const minettiCost = costFactor(seg.grade); // standard Minetti, no profile
    const minettiPace = flatPace * minettiCost;
    const ratio = seg.paceSecPerKm / minettiPace;
    if (ratio < 0.3 || ratio > 5) continue; // outlier filter

    bucketRatios[bucketIndex(seg.grade)].push(ratio);
    fatigueXs.push(seg.distM / 1000);
    fatigueYs.push(seg.paceSecPerKm / flatPace);

    if (seg.grade >= STEEP_CLIMB_GRADE) steepClimbPaces.push(seg.paceSecPerKm);
    if (seg.grade <= STEEP_DESCENT_GRADE) steepDescentPaces.push(seg.paceSecPerKm);
  }

  // climbFactor = median ratio across uphill buckets (grades ≥ 3%)
  // descentFactor = median ratio across downhill buckets (grades ≤ -3%)
  const climbValues = [4, 5, 6].flatMap(i => bucketRatios[i]);
  const descentValues = [0, 1, 2].flatMap(i => bucketRatios[i]);

  const climbFactor = climbValues.length >= 5 ? percentile(climbValues, 50) : 1.0;
  const descentFactor = descentValues.length >= 5 ? percentile(descentValues, 50) : 1.0;

  const { slope } = linearRegression(fatigueXs, fatigueYs);
  const fatigueRatePerHundredKm = Math.max(0, Math.min(0.5, slope * 100));

  // Max speed caps: 5th percentile = "fastest realistic" (lowest sec/km = fastest)
  const maxClimbPaceSecPerKm = steepClimbPaces.length >= 10
    ? percentile(steepClimbPaces, 5)
    : undefined;
  const maxDescentPaceSecPerKm = steepDescentPaces.length >= 10
    ? percentile(steepDescentPaces, 5)
    : undefined;

  const thisResult: CalibrationResult = {
    profile: { climbFactor, descentFactor, fatigueRatePerHundredKm, maxClimbPaceSecPerKm, maxDescentPaceSecPerKm },
    activityCount: 1,
    distanceKm: distKm,
  };

  return mergeResults(existing, thisResult);
}

function mergeResults(existing: CalibrationResult[], current: CalibrationResult | null): CalibrationResult {
  const all = current ? [...existing, current] : existing;
  if (all.length === 0) {
    return { profile: { climbFactor: 1, descentFactor: 1, fatigueRatePerHundredKm: 0.08 }, activityCount: 0, distanceKm: 0 };
  }
  const n = all.length;
  const avg = (key: keyof PersonalProfile) =>
    all.reduce((s, r) => s + (r.profile[key] as number ?? 0), 0) / n;

  const climbCaps = all.map(r => r.profile.maxClimbPaceSecPerKm).filter(v => v != null) as number[];
  const descentCaps = all.map(r => r.profile.maxDescentPaceSecPerKm).filter(v => v != null) as number[];

  return {
    profile: {
      climbFactor: avg('climbFactor'),
      descentFactor: avg('descentFactor'),
      fatigueRatePerHundredKm: avg('fatigueRatePerHundredKm'),
      maxClimbPaceSecPerKm: climbCaps.length > 0 ? climbCaps.reduce((a, b) => a + b, 0) / climbCaps.length : undefined,
      maxDescentPaceSecPerKm: descentCaps.length > 0 ? descentCaps.reduce((a, b) => a + b, 0) / descentCaps.length : undefined,
    },
    activityCount: all.reduce((s, r) => s + r.activityCount, 0),
    distanceKm: all.reduce((s, r) => s + r.distanceKm, 0),
  };
}

interface InterpResult { ele: number; timestamp: number }

function interpPoint(rawPoints: ActivityPoint[], smoothed: TrackPoint[], distM: number): InterpResult | null {
  const n = rawPoints.length;
  if (n < 2) return null;
  if (distM <= rawPoints[0].distFromStart) return { ele: smoothed[0].ele, timestamp: rawPoints[0].timestamp };
  if (distM >= rawPoints[n - 1].distFromStart) return { ele: smoothed[n - 1].ele, timestamp: rawPoints[n - 1].timestamp };
  let lo = 0, hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (rawPoints[mid].distFromStart <= distM) lo = mid; else hi = mid;
  }
  const t = (distM - rawPoints[lo].distFromStart) / (rawPoints[hi].distFromStart - rawPoints[lo].distFromStart);
  return {
    ele: smoothed[lo].ele + t * (smoothed[hi].ele - smoothed[lo].ele),
    timestamp: rawPoints[lo].timestamp + t * (rawPoints[hi].timestamp - rawPoints[lo].timestamp),
  };
}
