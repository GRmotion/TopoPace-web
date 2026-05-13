/**
 * Solar elevation angle using the NOAA / Jean Meeus algorithm.
 * Accurate to < 0.01° for 2000–2100.
 *
 * Reference: NOAA Solar Calculator spreadsheet
 * https://gml.noaa.gov/grad/solcalc/
 */
export function solarElevationDeg(utcDate: Date, latDeg: number, lonDeg: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;

  // ── Julian quantities ──────────────────────────────────────────────────────
  const JD = utcDate.getTime() / 86_400_000 + 2_440_587.5;
  const T  = (JD - 2_451_545.0) / 36_525; // Julian centuries from J2000.0

  // ── Sun geometry ──────────────────────────────────────────────────────────
  // Geometric mean longitude (deg)
  const L0 = ((280.46646 + T * (36_000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  // Geometric mean anomaly (deg) — need not be normalised for sin/cos
  const M  = 357.52911 + T * (35_999.05029 - 0.0001537 * T);
  // Orbit eccentricity
  const e  = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  // Equation of center (deg)
  const Mrad = toRad(M);
  const C = (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(Mrad)
           + (0.019993 - 0.000101 * T)                  * Math.sin(2 * Mrad)
           +  0.000289                                   * Math.sin(3 * Mrad);

  // Apparent longitude (corrects for nutation + aberration, deg)
  const omega       = 125.04 - 1934.136 * T;
  const apparentLon = L0 + C - 0.00569 - 0.00478 * Math.sin(toRad(omega));

  // ── Obliquity of ecliptic ─────────────────────────────────────────────────
  const meanObliq = 23.0
    + (26.0 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60.0) / 60.0;
  const obliqCorr = meanObliq + 0.00256 * Math.cos(toRad(omega)); // corrected

  // ── Sun declination (rad) ─────────────────────────────────────────────────
  const decl = Math.asin(Math.sin(toRad(obliqCorr)) * Math.sin(toRad(apparentLon)));

  // ── Equation of Time (minutes) ────────────────────────────────────────────
  const y    = Math.tan(toRad(obliqCorr / 2)) ** 2;
  const L0r  = toRad(L0);
  const eoT  = 4.0 * (180.0 / Math.PI) * (
      y        * Math.sin(2 * L0r)
    - 2 * e   * Math.sin(Mrad)
    + 4 * e * y * Math.sin(Mrad) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r)
    - 1.25 * e * e * Math.sin(2 * Mrad)
  );

  // ── True solar time → hour angle ──────────────────────────────────────────
  // utMin: minutes elapsed since UTC midnight
  const utMin = utcDate.getUTCHours() * 60
              + utcDate.getUTCMinutes()
              + utcDate.getUTCSeconds() / 60;
  // True Solar Time (minutes): noon = 720
  const tst = ((utMin + eoT + 4.0 * lonDeg) % 1440 + 1440) % 1440;
  // Hour angle (deg): < 0 before noon, > 0 after noon
  const ha = tst / 4.0 - 180.0;

  // ── Elevation ─────────────────────────────────────────────────────────────
  const latR = toRad(latDeg);
  const sinElev = Math.sin(latR) * Math.sin(decl)
                + Math.cos(latR) * Math.cos(decl) * Math.cos(toRad(ha));
  return Math.asin(Math.max(-1.0, Math.min(1.0, sinElev))) * 180.0 / Math.PI;
}
