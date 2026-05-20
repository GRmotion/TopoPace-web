import type { ParsedActivity } from './GpxParser';

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// fit-file-parser uses a callback-style API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FitRecord = Record<string, any>;

export async function parseFitActivity(buffer: ArrayBuffer): Promise<ParsedActivity> {
  // Dynamic import to avoid SSR issues
  const FitParser = (await import('fit-file-parser')).default;

  return new Promise((resolve, reject) => {
    const parser = new FitParser({ force: true, speedUnit: 'm/s', lengthUnit: 'm', elapsedRecordField: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.parse(buffer, (error: any, data: any) => {
      if (error) { reject(new Error(String(error))); return; }

      const records: FitRecord[] = ((data?.records ?? []) as FitRecord[]).filter(
        r => r.position_lat != null && r.position_long != null && r.timestamp != null
      );

      if (records.length < 10) { reject(new Error('FIT file has fewer than 10 valid GPS records')); return; }

      let dist = 0;
      const points = records.map((r, i) => {
        const lat = r.position_lat;
        const lon = r.position_long;
        if (i > 0) {
          dist += haversineM(records[i - 1].position_lat, records[i - 1].position_long, lat, lon);
        }
        return {
          distFromStart: dist,
          ele: r.altitude ?? r.enhanced_altitude ?? 0,
          timestamp: r.timestamp instanceof Date ? r.timestamp.getTime() : Number(r.timestamp) * 1000,
          heartRate: r.heart_rate != null ? Number(r.heart_rate) : undefined,
        };
      });

      const durationSec = (points[points.length - 1].timestamp - points[0].timestamp) / 1000;
      resolve({ points, totalDistM: dist, durationSec });
    });
  });
}
