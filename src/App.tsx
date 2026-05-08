import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { Checkpoint, RunPlan, PersonalProfile, CalibrationResult, CheckpointResult, TerrainSegment, GelZone, AdvancedSettings } from './models/types';
import { DEFAULT_PROFILE, DEFAULT_ADVANCED } from './models/types';
import { computeGelZones } from './algorithm/GelAdvisor';
import type { ParsedRoute } from './parsers/GpxParser';
import { buildPlan, computeScheduleFull, elapsedMsAtDist } from './algorithm/PacePlanner';

import RouteUpload from './components/RouteUpload';
import ElevationChart from './components/ElevationChart';
import RouteMap from './components/RouteMap';
import CheckpointPanel from './components/CheckpointPanel';
import GoalTimeForm from './components/GoalTimeForm';
import ActivityUpload from './components/ActivityUpload';
import PlanTable from './components/PlanTable';
import PrintPlan from './components/PrintPlan';
import AdvancedSettingsPanel from './components/AdvancedSettingsPanel';
import GelAdvisorPanel from './components/GelAdvisorPanel';

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
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('topopace_advanced') ?? 'null');
      return saved ? { ...DEFAULT_ADVANCED, ...saved } : DEFAULT_ADVANCED;
    } catch { return DEFAULT_ADVANCED; }
  });
  useEffect(() => {
    localStorage.setItem('topopace_advanced', JSON.stringify(advancedSettings));
  }, [advancedSettings]);

  const [gelZones, setGelZones] = useState<GelZone[]>([]);
  const [profileMode, setProfileMode] = useState<'table' | 'chart'>('chart');
  const chartWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profileMode === 'chart') setChartHeight(h => Math.max(h, 300));
  }, [profileMode]);

  const [pendingDistM, setPendingDistM] = useState<number | null>(null);
  const [hoverDistM, setHoverDistM] = useState<number | null>(null);
  const [terrainSegs, setTerrainSegs] = useState<TerrainSegment[]>([]);

  // Resizable chart + table heights
  const [chartHeight, setChartHeight] = useState(220);
  const [tableHeight, setTableHeight] = useState(160);
  const dragRef = useRef<{ startY: number; startH: number; startH2?: number; target: 'chart' | 'table' } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      if (dragRef.current.target === 'chart') {
        const delta = dragRef.current.startY - e.clientY;
        setChartHeight(Math.max(100, Math.min(600, dragRef.current.startH + delta)));
      } else {
        // drag UP = bigger table, chart shrinks by same delta
        const delta = dragRef.current.startY - e.clientY;
        setTableHeight(Math.max(80, Math.min(600, dragRef.current.startH + delta)));
        if (dragRef.current.startH2 !== undefined)
          setChartHeight(Math.max(100, Math.min(600, dragRef.current.startH2 - delta)));
      }
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
      advancedSettings,
    };
  }, [route, checkpoints, profile, goalH, goalMin, raceStartTime, terrainSegs, advancedSettings]);

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

  useEffect(() => {
    if (!advancedSettings.gelEnabled || segments.length === 0 || !route) {
      setGelZones([]);
      return;
    }
    setGelZones(computeGelZones(segments, checkpoints, terrainSegs, advancedSettings, route.totalDistM));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedSettings.gelEnabled, advancedSettings.gelIntervalMin, segments, checkpoints, terrainSegs]);

  const handleGelZonesChange = useCallback((zones: GelZone[]) => setGelZones(zones), []);

  const gelResults = useMemo(() => {
    if (!gelZones.length || !segments.length) return [];
    return gelZones
      .slice()
      .sort((a, b) => a.centerKm - b.centerKm)
      .map((zone, i) => ({
        id: zone.id,
        distM: zone.centerKm * 1000,
        etaMs: elapsedMsAtDist(segments, checkpoints, raceStartTime, zone.centerKm * 1000),
        gelNumber: i + 1,
      }));
  }, [gelZones, segments, checkpoints, raceStartTime]);

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

  const getChartSvgHtml = useCallback((): string | null => {
    const svgEl = chartWrapRef.current?.querySelector('svg');
    if (!svgEl) return null;
    const rect = svgEl.getBoundingClientRect();
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('viewBox', `0 0 ${Math.round(rect.width)} ${Math.round(rect.height)}`);
    clone.setAttribute('width', '100%');
    clone.setAttribute('height', String(Math.round(rect.height)));
    clone.style.cursor = '';
    let svg = new XMLSerializer().serializeToString(clone);
    // Replace CSS variables with print-safe colours (light background)
    svg = svg
      .replace(/var\(--border\)/g, '#d0d4de')
      .replace(/var\(--bg\)/g, '#ffffff')
      .replace(/var\(--bg-card\)/g, '#f6f7f9')
      .replace(/var\(--bg-elevated\)/g, '#ececec')
      .replace(/var\(--text-secondary\)/g, '#555e78')
      .replace(/var\(--text-hint\)/g, '#8892aa')
      .replace(/var\(--text\)/g, '#111827')
      .replace(/var\(--green\)/g, '#2e7d32')
      .replace(/var\(--yellow\)/g, '#b8860b')
      .replace(/var\(--red\)/g, '#b71c1c');
    return svg;
  }, []);

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
                <GelAdvisorPanel
                  settings={advancedSettings}
                  onChange={setAdvancedSettings}
                  gelCount={gelZones.length}
                />
              </div>
              {/* Fixed bottom */}
              <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <AdvancedSettingsPanel settings={advancedSettings} onChange={setAdvancedSettings} />
                <ActivityUpload existing={calibrations} onCalibrate={setCalibrations} onReset={() => setCalibrations([])} />
                {canPrint && (
                  <PrintPlan
                    plan={{ ...plan!, segments }}
                    results={results as CheckpointResult[]}
                    gelResults={advancedSettings.gelInSchedule ? gelResults : []}
                    profileMode={profileMode}
                    getChartSvgHtml={getChartSvgHtml}
                  />
                )}
              </div>
            </aside>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              <div style={{ flex: 1, minHeight: 150, position: 'relative' }}>
                <RouteMap
                  points={route.points}
                  checkpoints={checkpoints}
                  hoverDistM={hoverDistM}
                />
              </div>

              {/* Chart drag handle */}
              <div
                onMouseDown={e => { dragRef.current = { startY: e.clientY, startH: chartHeight, target: 'chart' }; e.preventDefault(); }}
                style={{
                  height: 8, background: 'var(--bg-elevated)',
                  borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                  cursor: 'row-resize', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{ width: 32, height: 2, background: 'var(--border)', borderRadius: 2 }} />
              </div>

              <div style={{ background: 'var(--bg)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
                {/* Schedule / Profile toggle */}
                {results.length > 0 && (
                  <div style={{ padding: '8px 16px 0', display: 'flex', gap: 4 }}>
                    <button
                      className={profileMode === 'table' ? 'primary' : 'ghost'}
                      style={{ fontSize: 11, padding: '3px 14px' }}
                      onClick={() => setProfileMode('table')}
                    >Schedule</button>
                    <button
                      className={profileMode === 'chart' ? 'primary' : 'ghost'}
                      style={{ fontSize: 11, padding: '3px 14px' }}
                      onClick={() => setProfileMode('chart')}
                    >Profile</button>
                  </div>
                )}
                <div ref={chartWrapRef} style={{ padding: '0 16px', paddingTop: 10 }}>
                  <ElevationChart
                    points={route.points}
                    checkpoints={checkpoints}
                    segments={segments}
                    raceStartTime={plan?.raceStartTime}
                    height={chartHeight}
                    terrainSegments={terrainSegs}
                    gelZones={gelZones}
                    onGelZonesChange={handleGelZonesChange}
                    onClickDist={distM => setPendingDistM(distM)}
                    onHoverDist={setHoverDistM}
                    onMarkSelection={handleMarkSelection}
                    onUpdateTerrain={handleUpdateTerrain}
                    onRemoveTerrain={handleRemoveTerrain}
                    results={results as CheckpointResult[]}
                    gelResults={advancedSettings.gelInSchedule ? gelResults : []}
                    showScheduleLabels={profileMode === 'chart'}
                  />
                </div>
                {results.length > 0 && profileMode === 'table' && (
                  <>
                    {/* Table drag handle */}
                    <div
                      onMouseDown={e => { dragRef.current = { startY: e.clientY, startH: tableHeight, startH2: chartHeight, target: 'table' }; e.preventDefault(); }}
                      style={{
                        height: 8, background: 'var(--bg-elevated)',
                        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                        cursor: 'row-resize', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <div style={{ width: 32, height: 2, background: 'var(--border)', borderRadius: 2 }} />
                    </div>
                    <div style={{ height: tableHeight, overflow: 'auto', padding: '0 16px 16px' }}>
                      <PlanTable results={results as CheckpointResult[]} gelResults={advancedSettings.gelInSchedule ? gelResults : []} onAdjustStop={handleAdjustStop} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
