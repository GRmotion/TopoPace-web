import type { TrackPoint, TrackSegment, Checkpoint, CheckpointResult, RunPlan, TerrainSegment } from '../models/types';
import { DEFAULT_PROFILE } from '../models/types';
import { costFactor } from './MinettiModel';

const SEGMENT_M = 50.0;

function interpolateEle(points: TrackPoint[], distM: number): number {
  if (distM <= points[0].distFromStart) return points[0].ele;
  if (distM >= points[points.length - 1].distFromStart) return points[points.length - 1].ele;
  let lo = 0, hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distFromStart <= distM) lo = mid; else hi = mid;
  }
  const p0 = points[lo], p1 = points[hi];
  const t = (distM - p0.distFromStart) / (p1.distFromStart - p0.distFromStart);
  return p0.ele + t * (p1.ele - p0.ele);
}

function buildRawSegments(points: TrackPoint[], profile: typeof DEFAULT_PROFILE, aggressiveness = 0): TrackSegment[] {
  const totalDistM = points[points.length - 1].distFromStart;
  const segments: TrackSegment[] = [];
  let segStart = 0;
  while (segStart < totalDistM - 1) {
    const segEnd = Math.min(segStart + SEGMENT_M, totalDistM);
    const eleStart = interpolateEle(points, segStart);
    const eleEnd = interpolateEle(points, segEnd);
    const horizDist = segEnd - segStart;
    const grade = horizDist > 0 ? (eleEnd - eleStart) / horizDist : 0;
    const t = segStart / totalDistM;
    const aggrFactor = aggressiveness !== 0 ? 1 + aggressiveness * (1 - 2 * t) : 1;
    const fatigueRamp = (1 + profile.fatigueRatePerHundredKm * t) * aggrFactor;
    segments.push({
      startDist: segStart,
      endDist: segEnd,
      gradePercent: grade * 100,
      targetPaceSecPerKm: costFactor(grade, profile) * fatigueRamp,
    });
    segStart = segEnd;
  }
  return segments;
}

// Returns terrain multiplier for a 50m route segment (uses midpoint)
function terrainMult(terrain: TerrainSegment[], startM: number, endM: number): number {
  const midKm = (startM + endM) / 2000;
  for (const t of terrain) {
    if (midKm >= t.startKm && midKm <= t.endKm) return 1 + t.difficultyPercent / 100;
  }
  return 1;
}

export function buildPlan(plan: RunPlan): TrackSegment[] {
  const profile = plan.profile ?? DEFAULT_PROFILE;
  const terrain = plan.terrainSegments ?? [];
  const totalStopSec = plan.checkpoints.reduce((sum, cp) => sum + cp.plannedStopMin * 60, 0);
  const runTimeSec = plan.goalTimeSec - totalStopSec;

  const aggressiveness = plan.advancedSettings?.startAggressiveness ?? 0;
  const rawSegs = buildRawSegments(plan.route, profile, aggressiveness);
  const mults = rawSegs.map(seg => terrainMult(terrain, seg.startDist, seg.endDist));

  // Base scale: ignore terrain so terrain zones get exactly ±X% relative to their no-terrain pace
  const baseFlatEquiv = rawSegs.reduce((s, seg) =>
    s + seg.targetPaceSecPerKm * (seg.endDist - seg.startDist), 0);
  const basePaceScalePerM = baseFlatEquiv > 0 ? runTimeSec / baseFlatEquiv : 0;

  // Time consumed by terrain-adjusted segments at their exact pace
  const terrainTimeSec = rawSegs.reduce((s, seg, i) => {
    const tm = mults[i];
    if (tm === 1) return s;
    return s + basePaceScalePerM * seg.targetPaceSecPerKm * (seg.endDist - seg.startDist) * tm;
  }, 0);

  // Non-terrain segments absorb the remaining time budget
  const nonTerrainFlatEquiv = rawSegs.reduce((s, seg, i) =>
    mults[i] === 1 ? s + seg.targetPaceSecPerKm * (seg.endDist - seg.startDist) : s, 0);
  const ntPaceScalePerM = nonTerrainFlatEquiv > 0
    ? (runTimeSec - terrainTimeSec) / nonTerrainFlatEquiv
    : basePaceScalePerM;

  return rawSegs.map((seg, i) => {
    const tm = mults[i];
    const scalePerM = tm !== 1 ? basePaceScalePerM : ntPaceScalePerM;
    let pace = scalePerM * seg.targetPaceSecPerKm * 1000 * tm;
    if (seg.gradePercent >= 8 && profile.maxClimbPaceSecPerKm) {
      pace = Math.max(pace, profile.maxClimbPaceSecPerKm);
    }
    if (seg.gradePercent <= -8 && profile.maxDescentPaceSecPerKm) {
      pace = Math.max(pace, profile.maxDescentPaceSecPerKm);
    }
    return { ...seg, targetPaceSecPerKm: pace };
  });
}

export function computeScheduleFull(plan: RunPlan, segments: TrackSegment[]): CheckpointResult[] {
  const startMs = parseTimeToMs(plan.raceStartTime);
  const totalDistM = plan.route[plan.route.length - 1].distFromStart;

  const cps: Checkpoint[] = [
    ...plan.checkpoints.slice().sort((a, b) => a.distM - b.distM),
    { id: 'finish', name: 'Finish', distM: totalDistM, type: 'waypoint', plannedStopMin: 0 },
  ];

  let elapsedMs = 0;
  let prevDistM = 0;

  return cps.map(cp => {
    elapsedMs += integrateSegmentMs(segments, prevDistM, cp.distM);
    const etaMs = startMs + elapsedMs;
    const stopMs = cp.plannedStopMin * 60000;
    const leaveAtMs = etaMs + stopMs;
    elapsedMs += stopMs;

    const cutoffBufferMin = cp.cutoffTime
      ? (parseTimeToMs(cp.cutoffTime) - etaMs) / 60000
      : null;

    const segPace = averagePaceInRange(segments, prevDistM, cp.distM);
    prevDistM = cp.distM;

    return { ...cp, etaMs, leaveAtMs, cutoffBufferMin, segmentPaceSecPerKm: segPace };
  });
}

export function paceAtDist(segments: TrackSegment[], distM: number): number {
  for (const seg of segments) {
    if (distM >= seg.startDist && distM < seg.endDist) return seg.targetPaceSecPerKm;
  }
  return segments.length > 0 ? segments[segments.length - 1].targetPaceSecPerKm : 300;
}

export function elapsedMsAtDist(
  segments: TrackSegment[],
  checkpoints: Checkpoint[],
  raceStartTime: string,
  targetDistM: number,
): number {
  const startMs = parseTimeToMs(raceStartTime);
  const sortedCps = checkpoints
    .filter(cp => cp.distM < targetDistM)
    .sort((a, b) => a.distM - b.distM);

  let elapsedMs = 0;
  let prevDistM = 0;
  for (const cp of sortedCps) {
    elapsedMs += integrateSegmentMs(segments, prevDistM, cp.distM);
    elapsedMs += cp.plannedStopMin * 60000;
    prevDistM = cp.distM;
  }
  elapsedMs += integrateSegmentMs(segments, prevDistM, targetDistM);
  return startMs + elapsedMs;
}

function integrateSegmentMs(segments: TrackSegment[], from: number, to: number): number {
  let ms = 0;
  for (const seg of segments) {
    if (seg.endDist <= from || seg.startDist >= to) continue;
    const cover = Math.min(seg.endDist, to) - Math.max(seg.startDist, from);
    ms += (cover / 1000) * seg.targetPaceSecPerKm * 1000;
  }
  return ms;
}

function averagePaceInRange(segments: TrackSegment[], fromDist: number, toDist: number): number {
  let paceSum = 0, distSum = 0;
  for (const seg of segments) {
    if (seg.endDist <= fromDist || seg.startDist >= toDist) continue;
    const cover = Math.min(seg.endDist, toDist) - Math.max(seg.startDist, fromDist);
    paceSum += seg.targetPaceSecPerKm * cover;
    distSum += cover;
  }
  return distSum > 0 ? paceSum / distSum : 300;
}

export function parseTimeToMs(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return ((h * 60 + m) * 60) * 1000;
}

export function formatTime(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function formatPace(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
