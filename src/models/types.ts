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
  color?: string;         // custom dot color for aid stations
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

export interface TerrainSegment {
  id: string;
  startKm: number;
  endKm: number;
  difficultyPercent: number; // positive = slower (rough), negative = faster (road)
}

export interface GelZone {
  id: string;
  centerKm: number;
  widthKm: number;
}

export interface AdvancedSettings {
  startAggressiveness: number; // -0.20 to +0.20 (negative = conservative/negative split)
  gelEnabled: boolean;
  gelIntervalMin: number;
  gelInSchedule: boolean;     // show gel zones in race schedule + print
}

export const DEFAULT_ADVANCED: AdvancedSettings = {
  startAggressiveness: 0,
  gelEnabled: false,
  gelIntervalMin: 40,
  gelInSchedule: true,
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
  terrainSegments?: TerrainSegment[];
  advancedSettings?: AdvancedSettings;
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

export interface GelResult {
  id: string;
  distM: number;
  etaMs: number;
  gelNumber: number;
}
