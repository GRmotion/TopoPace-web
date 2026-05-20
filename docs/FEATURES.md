# TopoPace — Feature Inventory

Each entry: what it does, which components/state/algorithms are involved.

---

## 1. Route Loading

**What:** User uploads a GPX file (drag-drop or file picker) or opens a saved plan from TrailsModal. Route is parsed into `TrackPoint[]` (distFromStart, ele, lat, lon).

**Components:** `RouteUpload.tsx`, `TrailsModal.tsx`
**State:** `route: ParsedRoute | null`, `raceName: string`
**Algorithms:** `GpxParser.parseRoute()`, `ElevationSmoother.smooth()`
**File formats:** `.gpx` (raw upload), `.tppa` / `.tppe` (TopoPace plan files via `TopoPaceFile.ts`)

---

## 2. Pacing Schedule

**What:** Core feature. Given route + goal time + profile, divides route into 50 m segments. Each segment gets a `targetPaceSecPerKm` based on grade (Minetti model), personal factors, fatigue ramp, and terrain multipliers. Computes ETA at each checkpoint.

**Components:** `GoalTimeForm.tsx`, `PlanTable.tsx`, `ElevationChart.tsx` (strip below chart)
**State:** `goalH`, `goalMin`, `raceStartTime`, `segments` (useMemo), `results` (useMemo)
**Algorithms:** `PacePlanner.buildPlan()`, `PacePlanner.computeScheduleFull()`
**Key params:** `goalTimeSec`, `raceStartTime: "HH:MM"`, `advancedSettings.startAggressiveness`

---

## 3. Checkpoints / Aid Stations

**What:** User marks aid stations (`'aid'`) and waypoints (`'waypoint'`) on the route. Each has a distance, name, optional stop time, optional cutoff time, and color. Shown on map (markers) and chart (vertical lines with badges).

**Components:** `CheckpointPanel.tsx`, `RouteMap.tsx` (click-to-add on map), `ElevationChart.tsx` (lines + badges)
**State:** `checkpoints: Checkpoint[]`
**Badge rendering in ElevationChart:**
- Profile mode (`showScheduleLabels=true`): circle (aid, r=9) or triangle (POI) with number at `MT+33`
- Schedule mode (`showScheduleLabels=false`): same shapes at `MT+9`, line starts from `MT+18`
- Numbers come from results order (sorted by distM), fallback to distance-sorted index

---

## 4. Terrain Difficulty Segments

**What:** User drag-draws zones on the elevation chart to mark rough terrain (+% slower) or fast road (−% faster). Each zone gets a `difficultyPercent`. `PacePlanner` applies `terrainMult()` to paces in that zone.

**Components:** `ElevationChart.tsx` (drag interaction, colored overlays)
**State:** `terrainSegs: TerrainSegment[]`
**Algorithm:** `PacePlanner.terrainMult()` — uses midpoint of each 50 m segment
**Interaction:** Click-drag on chart → creates/resizes segment; drag handles on edges

---

## 5. Athlete Calibration

**What:** User uploads past Garmin FIT activity. App extracts `PersonalProfile` (climbFactor, descentFactor, fatigueRatePerHundredKm, pace caps). Multiple calibrations accumulate; latest is used.

**Components:** `ActivityUpload.tsx`
**State:** `calibrations: CalibrationResult[]` (persisted to `topopace_calibration`)
**Algorithms:** `ActivityAnalyzer.analyzeActivity()`, `FitParser.ts`
**Profile defaults:** `climbFactor=1.0, descentFactor=1.0, fatigueRatePerHundredKm=0.08`

---

## 6. Gel Strategy (Gel Advisor)

**What:** Auto-places gel zones at configurable intervals. Scores candidate positions (flat, near aid, easy terrain = better). Zones are draggable on the chart. Optional: show gel stops in schedule table and printed plan.

**Components:** `GelAdvisorPanel.tsx`, `ElevationChart.tsx` (yellow zones + drag handles)
**State:** `gelZones: GelZone[]`, `advancedSettings.gelEnabled`, `advancedSettings.gelIntervalMin`, `advancedSettings.gelInSchedule`
**Algorithm:** `GelAdvisor.computeGelZones()`
**Undo:** Deleting a gel zone shows undo toast for 5 s (`removedGel` state + `undoTimerRef`)

---

## 7. Elevation Chart

**What:** SVG chart showing elevation profile, schedule overlay, and multiple optional layers. Two view modes controlled by `profileMode`.

**Component:** `ElevationChart.tsx`

### Layers (bottom to top in SVG):
1. Elevation area fill + line (`#4caf50`)
2. Terrain difficulty overlays (colored rectangles)
3. Gel zones (yellow semi-transparent bands)
4. Sun elevation line (`#ffd54f`, 50% opacity) — optional
5. Checkpoint vertical lines + badges
6. Notes (text boxes with connector lines)
7. Emojis
8. Hover hairline + dot
9. Axis labels (Y: elevation, X: distance)
10. Schedule strip below chart (Profile mode only)

### View Modes:
- **Profile mode** (`profileMode === 'chart'`, `showScheduleLabels=true`): 44px top reserved for cp badges, strip below chart with checkpoint/gel labels
- **Schedule mode** (`profileMode === 'table'`, `showScheduleLabels=false`): no reserved top space, no strip; `PlanTable` shown below chart instead

### Interactions:
- Hover → hairline + ETA tooltip
- Click on terrain → select/delete
- Drag on terrain edge → resize
- Drag empty area → new terrain segment
- Drag gel zone → reposition
- Drag checkpoint line → move checkpoint (when `onMoveCheckpoint` provided)
- Click chart with note mode → place note anchor

---

## 8. Route Map

**What:** Leaflet map with route polyline, checkpoint markers, and optional terrain/gel overlays. Supports click-to-add checkpoints in "adding" mode.

**Component:** `RouteMap.tsx`
**State:** `uiSettings.mapStyle` (`'osm' | 'topo' | 'satellite'`), `uiSettings.lineMode`, `uiSettings.lineColor`, `uiSettings.terrainOverlay`
**Map tiles:** OSM standard, OpenTopoMap, Esri satellite
**Interactions:** Click map → add checkpoint at nearest route point; drag checkpoint marker → move

---

## 9. Plan Export

**What (PDF):** Exports printable race plan. Includes race name, goal time, chart SVG, and schedule table with ETA, pace, stop time, cutoff.
**Component:** `PrintPlan.tsx` (uses jsPDF)

**What (file):** Saves full plan state as `.tppa` (with route) or `.tppe` (without route, smaller). JSON format.
**Util:** `TopoPaceFile.ts` — `serializeTopoPace()`, `downloadFile()`

---

## 10. Saved Trails (My Trails)

**What:** localStorage-based trail library. User can save current plan, reopen, rename, duplicate, delete, or export as `.tppa`. Auto-save option saves on every change.

**Component:** `TrailsModal.tsx`
**Storage:** `topopace_trails` (array of serialized plans), `topopace_last_trail`, `topopace_autosave_id`, `topopace_autosave_enabled`

---

## 11. Sun Elevation Overlay

**What:** Draws a line on the elevation chart showing the sun's angle above horizon at each point in the route (based on race date, time, and position). Useful for planning night sections.

**Activation:** Sun icon button → `SunDialog` modal (date picker + UTC offset selector)
**State:** `sunDate: string` (ISO date), `sunTzOffset: number` (hours)
**Util:** `solar.solarElevationDeg(utcDate, lat, lon)` → degrees
**Rendering:** Catmull-Rom spline, 301 samples along route, `#ffd54f` at 50% opacity
**Scale:** -3° = bottom of plot, +77° = top of plot (same coordinate space as eleToY)

---

## 12. Profile Annotations (Notes + Emojis)

**What:** User places text notes or emoji icons on the elevation chart. Notes have a connector line from a chart anchor point to a draggable text box. Emojis snap to the elevation line.

**Components:** `ElevationChart.tsx` (rendering + drag), `EmojiPicker.tsx`
**State:** `notes: ProfileNote[]`, `emojis: ProfileEmoji[]`
**Note fields:** `anchorKm, anchorEle` (fixed point on chart), `boxKm, boxFracY` (draggable box position)

---

## 13. Advanced Settings

**What:** `startAggressiveness` slider (−0.20 to +0.20). Positive = go out faster (positive split), negative = conservative start (negative split). Applied as a linear time-varying multiplier in `buildRawSegments`.

**Component:** `AdvancedSettingsPanel.tsx`
**State:** `advancedSettings.startAggressiveness` (persisted to `topopace_advanced`)
**Algorithm:** In `PacePlanner.buildRawSegments()`: `aggrFactor = 1 + aggressiveness * (1 - 2 * t)` where `t` = fractional distance

---

## 14. Tutorial / Onboarding

**What:** Step-by-step overlay that highlights UI elements via `data-tutorial` attributes. Shown on first visit.

**Component:** `Tutorial.tsx`
**Storage:** `tutorial_done` in localStorage
**Trigger:** Auto-shown on first load; can be re-opened via help button

---

## 15. UI Settings Panel

**What:** Gear icon opens settings panel with: map style, route line mode/color, terrain overlay toggle, time format (12h/24h), distance unit (km/mi), gel display toggle.

**State:** `uiSettings: UISettings` (persisted to `topopace_ui`)
**Defaults:** 24h, km, satellite map, elevation color line, gels shown
