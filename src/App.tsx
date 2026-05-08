import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { Checkpoint, RunPlan, PersonalProfile, CalibrationResult, CheckpointResult, TerrainSegment } from './models/types';
import { DEFAULT_PROFILE } from './models/types';
import type { ParsedRoute } from './parsers/GpxParser';
import { buildPlan, computeScheduleFull } from './algorithm/PacePlanner';

import RouteUpload from './components/RouteUpload';
import ElevationChart from './components/ElevationChart';
import RouteMap from './components/RouteMap';
import CheckpointPanel from './components/CheckpointPanel';
import GoalTimeForm from './components/GoalTimeForm';
import ActivityUpload from './components/ActivityUpload';
import PlanTable from './components/PlanTable';
import PrintPlan from './components/PrintPlan';

export default function App() {
  const [route, setRoute] = useState<ParsedRoute | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [goalH, setGoalH] = useState(10);
  const [goalMin, setGoalMin] = useState(0);
  const [raceStartTime, setRaceStartTime] = useState('06:00');
  const [calibrations, setCalibrations] = useState<CalibrationResult[]>(() => {
    try {
      const saved = localStorage.getItem('topopace_calibration');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('topopace_calibration', JSON.stringify(calibrations));
  }, [calibrations]);
  const [pendingDistM, setPendingDistM] = useState<number | null>(null);
  const [hoverDistM, setHoverDistM] = useState<number | null>(null);
  const [terrainSegs, setTerrainSegs] = useState<TerrainSegment[]>([]);

  // Resizable chart height
  const [chartHeight, setChartHeight] = useState(220);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - e.clientY;
      setChartHeight(Math.max(100, Math.min(600, dragRef.current.startH + delta)));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const profile: PersonalProfile = useMemo(() => {
    if (calibrations.length === 0) return DEFAULT_PROFILE;
    return calibrations[calibrations.length - 1].profile;
  }, [calibrations]);

  const plan: RunPlan | null = useMemo(() => {
    if (!route || route.points.length < 2) return null;
    return {
      id: 'current',
      name: route.name,
      route: route.points,
      segments: [],
      checkpoints,
      profile,
      goalTimeSec: (goalH * 60 + goalMin) * 60,
      raceStartTime,
      createdAt: Date.now(),
      terrainSegments: terrainSegs,
    };
  }, [route, checkpoints, profile, goalH, goalMin, raceStartTime, terrainSegs]);

  const { segments, results } = useMemo(() => {
    if (!plan || plan.route.length < 2 || plan.goalTimeSec <= 0) return { segments: [], results: [] };
    try {
      const segs = buildPlan(plan);
      const res = computeScheduleFull(plan, segs);
      return { segments: segs, results: res };
    } catch {
      return { segments: [], results: [] };
    }
  }, [plan]);

  const handleRouteLoad = useCallback((parsed: ParsedRoute) => {
    setRoute(parsed);
    setCheckpoints([]);
    setTerrainSegs([]);
  }, []);

  const handleAdjustStop = useCallback((id: string, deltaMin: number) => {
    setCheckpoints(prev => prev.map(cp =>
      cp.id === id ? { ...cp, plannedStopMin: Math.max(0, cp.plannedStopMin + deltaMin) } : cp
    ));
  }, []);

  const handleMapClick = useCallback((distM: number) => {
    setPendingDistM(distM);
  }, []);

  const handleMarkSelection = useCallback((startKm: number, endKm: number) => {
    setTerrainSegs(prev => [...prev, {
      id: crypto.randomUUID(),
      startKm, endKm,
      difficultyPercent: 0,
    }]);
  }, []);

  const handleUpdateTerrain = useCallback((id: string, difficultyPercent: number) => {
    setTerrainSegs(prev => prev.map(t => t.id === id ? { ...t, difficultyPercent } : t));
  }, []);

  const handleRemoveTerrain = useCallback((id: string) => {
    setTerrainSegs(prev => prev.filter(t => t.id !== id));
  }, []);

  const canPrint = route && goalH + goalMin > 0 && results.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo_topopace.svg" width="28" height="28" alt="" style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '0.04em', color: 'var(--green)' }}>TopoPace</span>
          <span style={{ color: 'var(--text-hint)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Race Planner</span>
        </div>
        {route && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{route.name}</span>
            <span>·</span>
            <span>{(route.totalDistM / 1000).toFixed(1)} km</span>
            <span>·</span>
            <span>↑{Math.round(route.totalElevGainM)}m</span>
          </div>
        )}
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!route ? (
          <div style={{ maxWidth: 560, margin: '80px auto', width: '100%', padding: '0 20px' }}>
            <h1 style={{ textAlign: 'center', marginBottom: 8, color: 'var(--green)' }}>Plan Your Race</h1>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 32 }}>
              Upload a GPX route to start building your race day schedule
            </p>
            <RouteUpload onRoute={handleRouteLoad} />
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <aside style={{ width: 320, minWidth: 280, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              {/* Scrollable top */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
                <RouteUpload onRoute={handleRouteLoad} compact />
                <GoalTimeForm
                  goalH={goalH} goalMin={goalMin}
                  raceStartTime={raceStartTime}
                  onChangeGoal={(h, m) => { setGoalH(h); setGoalMin(m); }}
                  onChangeStart={setRaceStartTime}
                />
                <CheckpointPanel
                  checkpoints={checkpoints}
                  totalDistM={route.totalDistM}
                  onChange={setCheckpoints}
                  pendingDistM={pendingDistM}
                  onPendingClear={() => setPendingDistM(null)}
                />
              </div>
              {/* Fixed bottom */}
              <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ActivityUpload existing={calibrations} onCalibrate={setCalibrations} onReset={() => setCalibrations([])} />
                {canPrint && (
                  <PrintPlan plan={{ ...plan!, segments }} results={results as CheckpointResult[]} />
                )}
              </div>
            </aside>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flex: 1, minHeight: 150, position: 'relative' }}>
                <RouteMap
                  points={route.points}
                  checkpoints={checkpoints}
                  hoverDistM={hoverDistM}
                  onClickDist={handleMapClick}
                />
              </div>

              {/* Drag handle */}
              <div
                onMouseDown={e => { dragRef.current = { startY: e.clientY, startH: chartHeight }; e.preventDefault(); }}
                style={{
                  height: 8, background: 'var(--bg-elevated)',
                  borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                  cursor: 'row-resize', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{ width: 32, height: 2, background: 'var(--border)', borderRadius: 2 }} />
              </div>

              <div style={{ background: 'var(--bg)', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                <div style={{ padding: '0 16px', paddingTop: 10 }}>
                  <ElevationChart
                    points={route.points}
                    checkpoints={checkpoints}
                    segments={segments}
                    raceStartTime={plan?.raceStartTime}
                    height={chartHeight}
                    terrainSegments={terrainSegs}
                    onClickDist={distM => setPendingDistM(distM)}
                    onHoverDist={setHoverDistM}
                    onMarkSelection={handleMarkSelection}
                    onUpdateTerrain={handleUpdateTerrain}
                    onRemoveTerrain={handleRemoveTerrain}
                  />
                </div>
                {results.length > 0 && (
                  <div style={{ padding: '0 16px 16px' }}>
                    <PlanTable results={results as CheckpointResult[]} onAdjustStop={handleAdjustStop} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
