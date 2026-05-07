import { useState, useMemo, useCallback } from 'react';
import type { Checkpoint, RunPlan, PersonalProfile, CalibrationResult, CheckpointResult } from './models/types';
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
  const [_step, setStep] = useState('setup');
  const [route, setRoute] = useState<ParsedRoute | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [goalH, setGoalH] = useState(10);
  const [goalMin, setGoalMin] = useState(0);
  const [raceStartTime, setRaceStartTime] = useState('06:00');
  const [calibrations, setCalibrations] = useState<CalibrationResult[]>([]);
  const [pendingDistM, setPendingDistM] = useState<number | null>(null);

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
    };
  }, [route, checkpoints, profile, goalH, goalMin, raceStartTime]);

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
    setStep('setup');
  }, []);

  const handleAdjustStop = useCallback((id: string, deltaMin: number) => {
    setCheckpoints(prev => prev.map(cp =>
      cp.id === id ? { ...cp, plannedStopMin: Math.max(0, cp.plannedStopMin + deltaMin) } : cp
    ));
  }, []);

  const canGenerate = route && goalH + goalMin > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>🏔</span>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '0.04em', color: 'var(--green)' }}>TOPOPACE</span>
          <span style={{ color: 'var(--text-hint)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Race Planner</span>
        </div>
        {route && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            <span>{route.name}</span>
            <span>·</span>
            <span>{(route.totalDistM / 1000).toFixed(1)} km</span>
            <span>·</span>
            <span>↑{Math.round(route.totalElevGainM)}m</span>
          </div>
        )}
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {!route ? (
          <div style={{ maxWidth: 560, margin: '80px auto', width: '100%', padding: '0 20px' }}>
            <h1 style={{ textAlign: 'center', marginBottom: 8, color: 'var(--green)' }}>Plan Your Race</h1>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 32 }}>
              Upload a GPX route to start building your race day schedule
            </p>
            <RouteUpload onRoute={handleRouteLoad} />
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* Left sidebar */}
            <aside style={{ width: 340, minWidth: 300, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12, padding: 16, overflowY: 'auto' }}>
              <RouteUpload onRoute={handleRouteLoad} />

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

              <ActivityUpload existing={calibrations} onCalibrate={setCalibrations} />

              {canGenerate && results.length > 0 && (
                <PrintPlan plan={{ ...plan!, segments }} results={results as CheckpointResult[]} />
              )}
            </aside>

            {/* Main content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Map */}
              <div style={{ flex: 1, minHeight: 300 }}>
                <RouteMap points={route.points} checkpoints={checkpoints} />
              </div>

              {/* Elevation + table */}
              <div style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Click on the chart to add a checkpoint
                </div>
                <ElevationChart
                  points={route.points}
                  checkpoints={checkpoints}
                  onClickDist={distM => setPendingDistM(distM)}
                />

                {results.length > 0 && (
                  <PlanTable results={results as CheckpointResult[]} onAdjustStop={handleAdjustStop} />
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
