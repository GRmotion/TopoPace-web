import type { TrackPoint } from '../models/types';

const MAX_SPIKE_M = 50.0;

function removeSpikes(points: TrackPoint[]): TrackPoint[] {
  const result = [...points];
  for (let i = 1; i < result.length - 1; i++) {
    const prev = result[i - 1].ele;
    const curr = result[i].ele;
    const next = result[i + 1].ele;
    if (Math.abs(curr - prev) > MAX_SPIKE_M && Math.abs(curr - next) > MAX_SPIKE_M) {
      result[i] = { ...result[i], ele: (prev + next) / 2 };
    }
  }
  return result;
}

function gaussianSmooth(points: TrackPoint[], sigmaM: number): TrackPoint[] {
  const sigma2 = sigmaM * sigmaM;
  const cutoff = 3.0 * sigmaM;

  return points.map((point, i) => {
    const dist0 = point.distFromStart;
    let weightedEle = 0;
    let totalWeight = 0;

    for (let j = i; j >= 0; j--) {
      const d = dist0 - points[j].distFromStart;
      if (d > cutoff) break;
      const w = Math.exp(-(d * d) / (2 * sigma2));
      weightedEle += w * points[j].ele;
      totalWeight += w;
    }
    for (let j = i + 1; j < points.length; j++) {
      const d = points[j].distFromStart - dist0;
      if (d > cutoff) break;
      const w = Math.exp(-(d * d) / (2 * sigma2));
      weightedEle += w * points[j].ele;
      totalWeight += w;
    }

    return { ...point, ele: totalWeight > 0 ? weightedEle / totalWeight : point.ele };
  });
}

export function smooth(points: TrackPoint[], sigmaM = 100.0): TrackPoint[] {
  if (points.length < 3) return points;
  return gaussianSmooth(removeSpikes(points), sigmaM);
}
