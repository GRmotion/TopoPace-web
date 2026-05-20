# TopoPace — Backlog

## Bugs

<!-- Format: - [ ] Description — repro steps / affected component -->
- [ ] "New adventure" overwrites the current saved plan instead of creating a new entry. Plans must never be deleted implicitly — the only way to remove a plan is via explicit "Remove" in options. — affected: TrailsModal / autosave logic in App.tsx

## Features / Improvements

<!-- Format: - [ ] Description — priority: high/medium/low -->

## Done (recent)

- [x] Sun line drops when switching Profile <-> Schedule — `badgeH` not applied to sun Y formula (`ElevationChart.tsx`)
- [x] Checkpoint names shown as text in Schedule view — replaced with circles/triangles + numbers
- [x] Terrain segments can overlap when resizing — `handleResizeTerrain` now clamps moving edge against neighbors
- [x] Tutorial animation: profile selection plus icon wrong margin; segment creation scale-origin fixed to center
- [x] Replace fatigue factor with stamina (aerobic decoupling HR vs GAP) — `staminaDecoupling` in `PersonalProfile`, HR-based Pa:HR calculation in `ActivityAnalyzer`
