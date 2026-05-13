// Solar elevation angle (degrees, -90..+90) using low-precision USNO algorithm.
// Accurate to ~0.01° for dates within a few centuries of J2000.
export function solarElevationDeg(utcDate: Date, latDeg: number, lonDeg: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const JD = utcDate.getTime() / 86_400_000 + 2_440_587.5;
  const n  = JD - 2_451_545.0; // days since J2000.0

  const L      = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
  const g      = toRad(((357.528 + 0.9856003 * n) % 360 + 360) % 360);
  const lambda = toRad(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
  const eps    = toRad(23.439 - 4e-7 * n);

  const sinDec = Math.sin(eps) * Math.sin(lambda);
  const dec    = Math.asin(sinDec);
  const RA     = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));

  const UT      = utcDate.getUTCHours() + utcDate.getUTCMinutes() / 60 + utcDate.getUTCSeconds() / 3600;
  const GMST_deg = ((6.697375 + 0.0657098242 * n + UT) % 24) * 15;
  const LHA     = toRad(((GMST_deg + lonDeg - toDeg(RA)) % 360 + 360) % 360);

  const lat    = toRad(latDeg);
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(LHA);
  return toDeg(Math.asin(Math.max(-1, Math.min(1, sinAlt))));
}
