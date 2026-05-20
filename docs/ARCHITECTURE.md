# TopoPace — Technical Architecture

## Data Flow

```
User action (upload GPX / change setting)
│
├─ parseRoute(gpxText) → ParsedRoute          [GpxParser.ts]
│    └─ ElevationSmoother.smooth() on ele[]
│
├─ App state updates (route, checkpoints, etc.)
│
├─ useMemo: buildPlan(RunPlan) → TrackSegment[]     [PacePlanner.ts]
│    ├─ buildRawSegments() — 50m segments with Minetti pace
│    └─ scale to fit goalTimeSec (linear scaling factor)
│
├─ useMemo: computeScheduleFull() → CheckpointResult[]
│    └─ walks segments, accumulates time, computes ETA at each checkpoint
│
├─ useMemo: computeGelZones() → GelResult[]          [GelAdvisor.ts]
│
└─ Render
     ├─ ElevationChart (SVG)
     ├─ RouteMap (Leaflet)
     └─ PlanTable (HTML table)
```

---

## Algorithm: PacePlanner

**File:** `src/algorithm/PacePlanner.ts`

### buildPlan(plan: RunPlan) → TrackSegment[]

1. Subtract stop time from goalTimeSec → `runTimeSec`
2. `buildRawSegments()` — for each 50 m segment:
   - Interpolate elevation at start/end → grade
   - `costFactor(grade, profile)` → relative pace (1.0 = flat Minetti pace)
   - Apply fatigue ramp: `(1 + fatigueRatePerHundredKm * t)` where t = dist fraction
   - Apply aggressiveness: `1 + aggressiveness * (1 - 2*t)` (front-loaded or back-loaded)
   - Apply terrain multiplier: `1 + difficultyPercent/100` (from TerrainSegment if covers midpoint)
3. Sum `costFactor * segmentLen` → `rawTotal`
4. Scale factor = `runTimeSec / rawTotal` → multiply all paces → `TrackSegment[]`

### computeScheduleFull() → CheckpointResult[]

Walks `TrackSegment[]` linearly, adds segment time at each step, detects when distance crosses a checkpoint → records ETA. Adds `plannedStopMin` at each checkpoint.

### Utility functions (exported, used in ElevationChart)

| Function | Description |
|---|---|
| `elapsedMsAtDist(segments, checkpoints, startTime, distM)` | ms from midnight at given distance |
| `distMAtRaceElapsedMs(segments, checkpoints, startTime, elapsedMs)` | inverse — dist at given time |
| `paceAtDist(segments, distM)` | pace (sec/km) at a distance |
| `formatTime(ms, format)` | ms → "HH:MM" or "h:mm AM/PM" |
| `formatPace(secPerKm, unit)` | sec/km → "MM:SS /km" or "/mi" |
| `formatDist(km, unit)` | km → "12.3 km" or "7.6 mi" |
| `parseTimeToMs(hhmm)` | "HH:MM" → ms from midnight |

---

## Algorithm: MinettiModel

**File:** `src/algorithm/MinettiModel.ts`

```
energyCost(grade) = 155.4i⁵ - 30.4i⁴ - 43.3i³ + 46.3i² + 19.5i + 3.6
  where i = clamp(grade, -0.45, 0.45)

costFactor(grade, profile) = energyCost(grade) / FLAT_COST * personalMultiplier
  personalMultiplier = profile.climbFactor  (if grade ≥ 0)
                     = profile.descentFactor (if grade < 0)
```

Result is a dimensionless multiplier: 1.0 = flat pace, >1 = slower, <1 = faster.

---

## Algorithm: ActivityAnalyzer

**File:** `src/algorithm/ActivityAnalyzer.ts`

1. Parse FIT file → arrays of (distM, ele, time)
2. Compute grade and pace for each GPS segment
3. Bucket into grade bins (steep up, moderate up, flat, moderate down, steep down)
4. Take 50th percentile pace in each bucket → characteristic paces
5. Normalize against Minetti model → `climbFactor`, `descentFactor`
6. Linear regression on pace vs distance → `fatigueRatePerHundredKm`
7. Record fastest observed paces → `maxClimbPaceSecPerKm`, `maxDescentPaceSecPerKm`

**Do not modify** — changes invalidate all stored calibrations.

---

## ElevationChart SVG Coordinate System

**File:** `src/components/ElevationChart.tsx`

```
Constants:
  ML = 50  (left margin — Y axis labels)
  MR = 14  (right margin)
  MT = 10  (top margin)
  MB = 28  (bottom margin — X axis labels)

Derived:
  plotW = w - ML - MR          (w = measured SVG width)
  plotH = height - MT - MB     (height = prop from App.tsx, default 220)

Badge space (Profile mode only):
  badgeH = showScheduleLabels ? 44 : 0
  Row 1 (terrain badges): MT + 0  to MT + 22
  Row 2 (cp circles):     MT + 22 to MT + 44

Coordinate transforms:
  kmToX(km)  = ML + (km - viewStart) / viewSpan * plotW
  eleToY(ele) = MT + badgeH + (1 - (ele - minEle) / eleRange) * (plotH - badgeH)
  sunLineY(el) = MT + badgeH + (1 - (el + 3) / 80) * (plotH - badgeH)
    ← sun range: -3° (bottom) to +77° (top), same coordinate space as eleToY

Strip (below chart, Profile mode):
  STRIP_TICK_H = 10   (gap from chart baseline to first label)
  STRIP_ROW_H  = 36   (height per label row)
  stripH = STRIP_TICK_H + (maxStripRow + 1) * STRIP_ROW_H + 8
  totalSvgH = height + stripH
```

### Zoom
`zoomView: { start: number; end: number } | null` (km). When set, `kmToX` maps only the zoomed range. `chartStateRef` exposes `{ plotW, plotH, viewStart, viewEnd, ... }` to parent.

---

## Checkpoint Badge Rendering

### Profile mode (`showScheduleLabels = true`, `badgeH = 44`)
- Aid station: `<circle cx={x} cy={MT+33} r={9}>`
- POI/waypoint: rounded triangle, top at `MT+24`, bottom at `MT+40.5`
- Number text: `y = MT+36` (aid) or `MT+38` (POI)
- Vertical line: from `MT+42` to `MT+plotH`, dashed `4,3`

### Schedule mode (`showScheduleLabels = false`, `badgeH = 0`)
- Aid station: `<circle cx={x} cy={MT+9} r={9}>`
- POI/waypoint: rounded triangle, top at `MT`, bottom at `MT+16.5`
- Number text: `y = MT+12` (aid) or `MT+14` (POI)
- Vertical line: from `MT+18` to `MT+plotH`, solid

Badge numbers are sourced from `results` order (sorted by distM), not `checkpoints` array order.

---

## localStorage Schema

| Key | Value | Notes |
|---|---|---|
| `topopace_calibration` | `CalibrationResult[]` JSON | Athlete calibration history |
| `topopace_advanced` | `AdvancedSettings` JSON | Merged with DEFAULT_ADVANCED on load |
| `topopace_ui` | `UISettings` JSON | Merged with DEFAULT_UI_SETTINGS on load |
| `topopace_trails` | `TopoPaceFileData[]` JSON | Saved plans library |
| `topopace_last_trail` | string (plan id) | Last opened plan |
| `topopace_autosave_enabled` | `'0'` or absent | Auto-save off if `'0'` |
| `topopace_autosave_id` | string (plan id) | ID of the auto-save slot |
| `topopace_sidebar_autohide` | `'1'` or absent | Sidebar auto-hide if `'1'` |
| `tutorial_done` | any | Tutorial not shown if present |

---

## File Formats

### .tppa (TopoPace Plan with route)
JSON containing: route TrackPoints, checkpoints, terrainSegments, advancedSettings, notes, emojis, metadata.

### .tppe (TopoPace Plan export, no route)
Same JSON without `route` array — smaller file for sharing schedule without GPS data.

Both parsed by `TopoPaceFile.parseTopoPace()`.

---

## Rendering Performance Notes

- `ElevationChart` uses a `ResizeObserver` (via `useLayoutEffect`) to measure SVG width → `w`; re-renders on resize.
- Sun samples: 301 points computed via `useMemo` only when `sunDate` changes.
- `chartStateRef` is a mutable ref (not state) — updated every render without causing re-renders — exposes coordinate helpers to parent for hover sync.
- Terrain drag state uses `useRef` (not state) to avoid re-renders during drag.
