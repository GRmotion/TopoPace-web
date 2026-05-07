import type { TrackPoint, PersonalProfile, CalibrationResult } from '../models/types';
import { costFactor } from './MinettiModel';
import { smooth } from './ElevationSmoother';

interface ActivityPoint {
  distFromStart: number;
  ele: number;
  timestamp: number; // Unix ms
}

// 7 grade buckets: [-0.45,-0.20), [-0.20,-0.10), [-0.10,-0.03), [-0.03,0.03), [0.03,0.10), [0.10,0.20), [0.20,0.45]
const GRADE_BUCKETS = [-0.45, -0.20, -0.10, -0.03, 0.03, 0.10, 0.20, 0.45];

function bucketIndex(grade: number): number {
  for (let i = 0; i < GRADE_BUCKETS.length - 1; i++) {
    if (grade < GRADE_BUCKETS[i + 1]) return i;
  }
  return GRADE_BUCKETS.length - 2;
}

function median(values: number[]): number {
  if (values.length === 0) return 1.0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: 1 };
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  return { slope, intercept: meanY - slope * meanX };
}

export function analyzeActivity(
  rawPoints: ActivityPoint[],
  existingResults: CalibrationResult[]
): CalibrationResult {
  // Smooth elevation
  const asTrackPoints: TrackPoint[] = rawPoints.map(p => ({
    distFromStart: p.distFromStart,
    ele: p.ele,
    lat: 0,
    lon: 0,
  }));
  const smoothed = smooth(asTrackPoints, 100);

  // Per-50m segment analysis
  const SEG = 50;
  const totalDistM = rawPoints[rawPoints.length - 1].distFromStart;
  const distKm = totalDistM / 1000;

  const bucketRatios: number[][] = Array.from({ length: 7 }, () => []);
  const fatigueXs: number[] = [];
  const fatigueYs: number[] = [];

  // Estimate flat pace from the whole activity (median of gentle-grade segments)
  const flatSegPaces: number[] = [];
  for (let d = 0; d < totalDistM - SEG; d += SEG) {
    const p0 = interp(rawPoints, smoothed, d);
    const p1 = interp(rawPoints, smoothed, d + SEG);
    if (!p0 || !p1) continue;
    const grade = (p1.ele - p0.ele) / SEG;
    if (Math.abs(grade) > 0.03) continue;
    const elapsedSec = (p1.timestamp - p0.timestamp) / 1000;
    if (elapsedSec <= 0) continue;
    const speedMps = SEG / elapsedSec;
    if (speedMps < 0.5 || speedMps > 8) continue; // exclude stops and sprints
    flatSegPaces.push(1000 / speedMps); // sec/km
  }
  const flatPace = median(flatSegPaces);
  if (flatPace <= 0 || flatSegPaces.length < 5) {
    return mergeResults(existingResults, null, distKm);
  }

  for (let d = 0; d < totalDistM - SEG; d += SEG) {
    const p0 = interp(rawPoints, smoothed, d);
    const p1 = interp(rawPoints, smoothed, d + SEG);
    if (!p0 || !p1) continue;
    const grade = (p1.ele - p0.ele) / SEG;
    const elapsedSec = (p1.timestamp - p0.timestamp) / 1000;
    if (elapsedSec <= 0) continue;
    const speedMps = SEG / elapsedSec;
    if (speedMps < 0.3 || speedMps > 8) continue;

    const actualPace = 1000 / speedMps;
    const minettiPace = flatPace * costFactor(grade);
    if (minettiPace <= 0) continue;

    const ratio = actualPace / minettiPace;
    if (ratio < 0.3 || ratio > 5) continue; // outlier filter

    bucketRatios[bucketIndex(grade)].push(ratio);
    fatigueXs.push(d / 1000);
    fatigueYs.push(actualPace / flatPace);
  }

  const climbBuckets = [4, 5, 6]; // grade ≥ 3%
  const descentBuckets = [0, 1, 2]; // grade < -3%

  const climbFactorValues = climbBuckets.flatMap(i => bucketRatios[i]);
  const descentFactorValues = descentBuckets.flatMap(i => bucketRatios[i]);

  const climbFactor = climbFactorValues.length >= 3 ? median(climbFactorValues) : 1.0;
  const descentFactor = descentFactorValues.length >= 3 ? median(descentFactorValues) : 1.0;

  const { slope } = linearRegression(fatigueXs, fatigueYs);
  // slope is pace-ratio increase per km; convert to per 100km
  const fatigueRatePerHundredKm = Math.max(0, Math.min(0.5, slope * 100));

  const thisProfile: PersonalProfile = { climbFactor, descentFactor, fatigueRatePerHundredKm };
  return mergeResults(existingResults, { profile: thisProfile, activityCount: 1, distanceKm: distKm }, distKm);
}

function mergeResults(
  existing: CalibrationResult[],
  current: CalibrationResult | null,
  _distKm: number
): CalibrationResult {
  const all = current ? [...existing, current] : existing;
  if (all.length === 0) {
    return { profile: { climbFactor: 1, descentFactor: 1, fatigueRatePerHundredKm: 0.08 }, activityCount: 0, distanceKm: 0 };
  }
  const n = all.length;
  return {
    profile: {
      climbFactor: all.reduce((s, r) => s + r.profile.climbFactor, 0) / n,
      descentFactor: all.reduce((s, r) => s + r.profile.descentFactor, 0) / n,
      fatigueRatePerHundredKm: all.reduce((s, r) => s + r.profile.fatigueRatePerHundredKm, 0) / n,
    },
    activityCount: all.reduce((s, r) => s + r.activityCount, 0),
    distanceKm: all.reduce((s, r) => s + r.distanceKm, 0),
  };
}

interface InterpResult { ele: number; timestamp: number; }

function interp(
  rawPoints: ActivityPoint[],
  smoothed: TrackPoint[],
  distM: number
): InterpResult | null {
  const n = rawPoints.length;
  if (n < 2) return null;
  let lo = 0, hi = n - 1;
  if (distM <= rawPoints[0].distFromStart) return { ele: smoothed[0].ele, timestamp: rawPoints[0].timestamp };
  if (distM >= rawPoints[hi].distFromStart) return { ele: smoothed[hi].ele, timestamp: rawPoints[hi].timestamp };
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
