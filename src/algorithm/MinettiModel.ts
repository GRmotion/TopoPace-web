import type { PersonalProfile } from '../models/types';

const FLAT_COST = 3.6;
const GRADE_MIN = -0.45;
const GRADE_MAX = 0.45;

function energyCost(grade: number): number {
  const i = Math.max(GRADE_MIN, Math.min(GRADE_MAX, grade));
  return (
    155.4 * Math.pow(i, 5) -
    30.4  * Math.pow(i, 4) -
    43.3  * Math.pow(i, 3) +
    46.3  * Math.pow(i, 2) +
    19.5  * i +
    3.6
  );
}

export function costFactor(grade: number, profile?: PersonalProfile): number {
  const raw = energyCost(grade) / FLAT_COST;
  if (!profile) return raw;
  // Model A: personal multiplier scales Minetti directly
  // climbFactor=1.0 means exactly Minetti; 1.2 means 20% slower on uphills
  const multiplier = grade >= 0 ? profile.climbFactor : profile.descentFactor;
  return raw * multiplier;
}
