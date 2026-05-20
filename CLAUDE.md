# TopoPace — AI Context

TopoPace is a client-side web app for ultramarathon race planning. It takes a GPX route and produces a personalized pacing schedule accounting for elevation, fatigue, terrain difficulty, and gel strategy. No backend — all state lives in React hooks + localStorage.

## Commands

```bash
npm run dev            # dev server (default :5173, or pass --port XXXX)
npm run build          # tsc -b && vite build → /dist/
```

Deployment: push to `main` → GitHub Actions → GitHub Pages (auto, ~1–2 min).
Working branch: `v4.1` → merge to `main` to ship.

## File Map

```
src/
  App.tsx                  # ~2000 lines — all global state, layout, orchestration
  models/types.ts          # All TypeScript interfaces (source of truth for data shapes)
  algorithm/
    PacePlanner.ts         # buildPlan() + computeScheduleFull() + time/dist utils
    MinettiModel.ts        # energyCost() polynomial → costFactor() with personal profile
    ActivityAnalyzer.ts    # analyzeActivity() — extracts PersonalProfile from FIT data
    GelAdvisor.ts          # computeGelZones() — auto-place nutrition stations
    ElevationSmoother.ts   # smooth() — rolling-window elevation filter
  parsers/
    GpxParser.ts           # parseRoute() → ParsedRoute
    FitParser.ts           # wraps fit-file-parser npm lib
  utils/
    TopoPaceFile.ts        # serializeTopoPace() / parseTopoPace() / downloadFile()
    solar.ts               # solarElevationDeg(date, lat, lon) → degrees
  components/
    ElevationChart.tsx     # ~1100 lines — SVG chart (profile, sun, badges, terrain, notes)
    RouteMap.tsx           # ~600 lines — Leaflet map with polylines, markers, drag-to-add
    PlanTable.tsx          # Schedule table view (ETA, pace, cutoff buffer)
    CheckpointPanel.tsx    # Add/edit/delete checkpoints
    GoalTimeForm.tsx       # Goal duration + start time inputs
    ActivityUpload.tsx     # FIT upload → calibration
    AdvancedSettingsPanel.tsx  # startAggressiveness slider
    GelAdvisorPanel.tsx    # gel toggle, interval, in-schedule toggle
    PrintPlan.tsx          # PDF export via jsPDF
    TrailsModal.tsx        # Saved trails browser (localStorage + .tppa/.tppe files)
    Tutorial.tsx           # Onboarding overlay
    EmojiPicker.tsx        # Emoji selector for profile annotations
```

## Data Flow

```
Upload GPX/Plan file
  → parseRoute() / parseTopoPace()
  → route (ParsedRoute), checkpoints[], terrainSegs[]
  → buildPlan(RunPlan) → TrackSegment[]          (useMemo: segments)
  → computeScheduleFull() → CheckpointResult[]   (useMemo: results)
  → computeGelZones() → GelResult[]              (useMemo: gelResults)
  → ElevationChart + RouteMap + PlanTable render
```

## Key State (App.tsx)

| Variable | Type | Persisted |
|---|---|---|
| `route` | `ParsedRoute \| null` | no |
| `checkpoints` | `Checkpoint[]` | no |
| `segments` | `TrackSegment[]` | no (useMemo) |
| `results` | `CheckpointResult[]` | no (useMemo) |
| `profileMode` | `'table' \| 'chart'` | no |
| `calibrations` | `CalibrationResult[]` | `topopace_calibration` |
| `advancedSettings` | `AdvancedSettings` | `topopace_advanced` |
| `uiSettings` | `UISettings` | `topopace_ui` |
| `gelZones` | `GelZone[]` | no |
| `terrainSegs` | `TerrainSegment[]` | no |
| `notes`, `emojis` | `ProfileNote[]`, `ProfileEmoji[]` | no |
| `sunDate`, `sunTzOffset` | string, number | no |
| `chartHeight` | number | no |

localStorage keys: `topopace_calibration`, `topopace_advanced`, `topopace_ui`,
`topopace_trails`, `topopace_last_trail`, `topopace_sidebar_autohide`,
`topopace_autosave_enabled`, `topopace_autosave_id`, `tutorial_done`.

## ElevationChart — Coordinate System

```
ML = 50, MR = 14, MT = 10, MB = 28   (SVG margins, px)
plotW = w - ML - MR
plotH = height - MT - MB

badgeH = showScheduleLabels ? 44 : 0  (top reserved for cp badges in Profile mode)

eleToY(ele) = MT + badgeH + (1 - (ele - minEle) / eleRange) * (plotH - badgeH)
sunLineY(el) = MT + badgeH + (1 - (el + 3) / 80) * (plotH - badgeH)
               ← sun uses same formula as eleToY (bug fix: v4.1)

showScheduleLabels = (profileMode === 'chart')   ← "Profile" mode, NOT "Schedule"
```

Strip below chart (when showScheduleLabels):
- `STRIP_TICK_H = 10`, `STRIP_ROW_H = 36`
- `stripH = STRIP_TICK_H + (maxStripRow + 1) * STRIP_ROW_H + 8`
- `totalSvgH = height + stripH`

## Naming Gotcha

`profileMode === 'chart'` is the **Profile** view (elevation chart + schedule badges).
`profileMode === 'table'` is the **Schedule** view (table of splits below chart).
The UI button "Profile" sets `'chart'`, button "Schedule" sets `'table'`.

## Code Conventions

- **No external state library** — pure React hooks in App.tsx
- **Dark theme only** — CSS vars: `--bg`, `--green`, `--text`, etc. in `index.css`
- **Button classes**: `primary` (green fill), `ghost` (transparent outline)
- **No comments unless why is non-obvious** — naming is self-documenting
- **Algorithm files are pure functions** — no React, no side effects
- **All distances in metres** in types; convert to km only at display layer

## Do Not Touch

- `MinettiModel.ts` — calibrated polynomial, changing breaks all pace calculations
- `ActivityAnalyzer.ts` — delicate percentile logic, changes invalidate existing calibrations
- `ElevationSmoother.ts` — tuned window sizes; changing affects grade calculations
