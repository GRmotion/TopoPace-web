import type { TrackPoint, TrackSegment, Checkpoint, CheckpointResult, PersonalProfile, RunPlan } from '../models/types';
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

function buildSegments(points: TrackPoint[], profile: PersonalProfile): TrackSegment[] {
  const totalDistM = points[points.length - 1].distFromStart;
  const segments: TrackSegment[] = [];
  let segStart = 0;
  while (segStart < totalDistM - 1) {
    const segEnd = Math.min(segStart + SEGMENT_M, totalDistM);
    const eleStart = interpolateEle(points, segStart);
    const eleEnd = interpolateEle(points, segEnd);
    const horizDist = segEnd - segStart;
    const grade = horizDist > 0 ? (eleEnd - eleStart) / horizDist : 0;
    const fatigueRamp = 1 + profile.fatigueRatePerHundredKm * (segStart / totalDistM);
    // targetPaceSecPerKm temporarily stores cost factor; scaled below
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

export function buildPlan(plan: RunPlan): TrackSegment[] {
  const { route, checkpoints, goalTimeSec } = plan;
  const profile = plan.profile ?? DEFAULT_PROFILE;
  const totalStopSec = checkpoints.reduce((sum, cp) => sum + cp.plannedStopMin * 60, 0);
  const runTimeSec = goalTimeSec - totalStopSec;

  const rawSegs = buildSegments(route, profile);
  const flatEquiv = rawSegs.reduce((s, seg) => s + seg.targetPaceSecPerKm * (seg.endDist - seg.startDist), 0);
  const baseSecPerM = runTimeSec / flatEquiv;

  return rawSegs.map(seg => ({
    ...seg,
    targetPaceSecPerKm: baseSecPerM * seg.targetPaceSecPerKm * 1000,
  }));
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
    const runSegs = segments.filter(s => s.endDist > prevDistM && s.startDist < cp.distM);
    for (const seg of runSegs) {
      const from = Math.max(seg.startDist, prevDistM);
      const to = Math.min(seg.endDist, cp.distM);
      const distKm = (to - from) / 1000;
      elapsedMs += distKm * seg.targetPaceSecPerKm * 1000;
    }

    const etaMs = startMs + elapsedMs;
    const stopMs = cp.plannedStopMin * 60 * 1000;
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

function parseTimeToMs(time: string): number {
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
