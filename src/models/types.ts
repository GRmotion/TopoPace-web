export interface TrackPoint {
  distFromStart: number; // metres
  ele: number;           // metres
  lat: number;
  lon: number;
}

export interface TrackSegment {
  startDist: number;          // metres
  endDist: number;
  gradePercent: number;
  targetPaceSecPerKm: number;
}

export type CheckpointType = 'aid' | 'waypoint';

export interface Checkpoint {
  id: string;
  name: string;
  distM: number;
  type: CheckpointType;
  plannedStopMin: number; // 0 for waypoints
  cutoffTime?: string;    // "HH:MM" or undefined
  note?: string;
}

export interface PersonalProfile {
  climbFactor: number;               // pace multiplier vs Minetti (1.0 = Minetti, 1.2 = 20% slower)
  descentFactor: number;
  fatigueRatePerHundredKm: number;   // additional slowdown per 100 km (0.08 = 8%)
  maxClimbPaceSecPerKm?: number;     // fastest observed pace on steep uphills — hard cap
  maxDescentPaceSecPerKm?: number;   // fastest observed pace on steep downhills — hard cap
}

export const DEFAULT_PROFILE: PersonalProfile = {
  climbFactor: 1.0,
  descentFactor: 1.0,
  fatigueRatePerHundredKm: 0.08,
};

export interface RunPlan {
  id: string;
  name: string;
  route: TrackPoint[];
  segments: TrackSegment[];
  checkpoints: Checkpoint[];
  profile: PersonalProfile;
  goalTimeSec: number;
  raceStartTime: string; // "HH:MM"
  createdAt: number;
}

export interface CheckpointResult extends Checkpoint {
  etaMs: number;         // wall-clock ms from midnight on race day
  leaveAtMs: number;
  cutoffBufferMin: number | null;
  segmentPaceSecPerKm: number; // avg pace of segment leading to this checkpoint
}

export interface CalibrationResult {
  profile: PersonalProfile;
  activityCount: number;
  distanceKm: number;
}
