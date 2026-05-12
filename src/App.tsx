import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { Checkpoint, RunPlan, PersonalProfile, CalibrationResult, CheckpointResult, TerrainSegment, GelZone, AdvancedSettings, UISettings } from './models/types';
import { DEFAULT_PROFILE, DEFAULT_ADVANCED, DEFAULT_UI_SETTINGS } from './models/types';
import { computeGelZones } from './algorithm/GelAdvisor';
import type { ParsedRoute } from './parsers/GpxParser';
import { buildPlan, computeScheduleFull, elapsedMsAtDist } from './algorithm/PacePlanner';
import { parseRoute } from './parsers/GpxParser';
import { parseTopoPace } from './utils/TopoPaceFile';
import type { TopoPaceFileData } from './utils/TopoPaceFile';

import ElevationChart from './components/ElevationChart';
import RouteMap from './components/RouteMap';
import CheckpointPanel from './components/CheckpointPanel';
import GoalTimeForm from './components/GoalTimeForm';
import ActivityUpload from './components/ActivityUpload';
import PlanTable from './components/PlanTable';
import PrintPlan from './components/PrintPlan';
import AdvancedSettingsPanel from './components/AdvancedSettingsPanel';
import GelAdvisorPanel from './components/GelAdvisorPanel';
import TrailsModal, { loadTrails, persistTrails, AUTOSAVE_ENABLED_KEY, AUTOSAVE_ID_KEY } from './components/TrailsModal';
import Tutorial, { TUTORIAL_DONE_KEY } from './components/Tutorial';

const MOUNTAIN_CENTERS: [number, number][] = [
  [46.5, 8.0], [47.0, 12.5], [45.9, 6.9],
  [49.2, 19.9], [50.74, 15.74], [42.6, 0.5],
  [43.3, -0.9], [47.5, 10.7],
];

export default function App() {
  const [route, setRoute] = useState<ParsedRoute | null>(null);
  const [raceName, setRaceName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [goalH, setGoalH] = useState(10);
  const [goalMin, setGoalMin] = useState(0);
  const [raceStartTime, setRaceStartTime] = useState('08:00');
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
  const gelZonesLockedRef = useRef(false);
  const [removedGel, setRemovedGel] = useState<{ zone: GelZone; gelNumber: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [profileMode, setProfileMode] = useState<'table' | 'chart'>('chart');
  const [trailsOpen, setTrailsOpen] = useState(false);
  const [tutorialActive, setTutorialActive] = useState(false);
  const [autoSave, setAutoSave] = useState(() => localStorage.getItem(AUTOSAVE_ENABLED_KEY) === '1');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saving' | 'saved' | null>(null);
  const autoSaveIdRef = useRef<string>(localStorage.getItem(AUTOSAVE_ID_KEY) ?? '');
  const clearSavedRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defaultMapCenter = useMemo<[number, number]>(
    () => MOUNTAIN_CENTERS[Math.floor(Math.random() * MOUNTAIN_CENTERS.length)], []
  );
  const [uiSettings, setUiSettings] = useState<UISettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('topopace_ui') ?? 'null');
      return saved ? { ...DEFAULT_UI_SETTINGS, ...saved } : DEFAULT_UI_SETTINGS;
    } catch { return DEFAULT_UI_SETTINGS; }
  });
  useEffect(() => {
    localStorage.setItem('topopace_ui', JSON.stringify(uiSettings));
  }, [uiSettings]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profileMode === 'chart') setChartHeight(h => Math.max(h, 300));
  }, [profileMode]);

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
    if (gelZonesLockedRef.current) { gelZonesLockedRef.current = false; return; }
    if (!advancedSettings.gelEnabled || segments.length === 0 || !route) {
      setGelZones([]);
      return;
    }
    setGelZones(computeGelZones(segments, checkpoints, terrainSegs, advancedSettings, route.totalDistM));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advancedSettings.gelEnabled, advancedSettings.gelIntervalMin, segments, checkpoints, terrainSegs]);

  const handleGelZonesChange = useCallback((zones: GelZone[]) => setGelZones(zones), []);

  const handleAddGelAt = useCallback((distM: number) => {
    setGelZones(prev => [...prev, { id: crypto.randomUUID(), centerKm: distM / 1000, widthKm: 0.3 }]);
  }, []);

  const handleGelRemove = useCallback((id: string) => {
    const sorted = gelZones.slice().sort((a, b) => a.centerKm - b.centerKm);
    const idx = sorted.findIndex(z => z.id === id);
    const zone = gelZones.find(z => z.id === id);
    if (!zone) return;
    setGelZones(prev => prev.filter(z => z.id !== id));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setRemovedGel({ zone, gelNumber: idx + 1 });
    undoTimerRef.current = setTimeout(() => { setRemovedGel(null); undoTimerRef.current = null; }, 5000);
  }, [gelZones]);

  const handleGelUndo = useCallback(() => {
    if (!removedGel) return;
    if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
    setGelZones(prev => [...prev, removedGel.zone]);
    setRemovedGel(null);
  }, [removedGel]);

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
    setRaceName(parsed.name);
    setCheckpoints([]);
    setTerrainSegs([]);
    setGelZones([]);
    const estSec = ((parsed.totalDistM / 1000) * 420 + parsed.totalElevGainM * 6) * 0.75;
    const roundedMin = Math.round(estSec / 60 / 15) * 15;
    setGoalH(Math.floor(roundedMin / 60));
    setGoalMin(roundedMin % 60);
    if (!localStorage.getItem(TUTORIAL_DONE_KEY)) {
      setTimeout(() => setTutorialActive(true), 400);
    }
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
  const currentPlanData: TopoPaceFileData | null = useMemo(() => route ? {
    version: 3,
    savedAt: Date.now(),
    name: raceName || route.name,
    route: { points: route.points, totalDistM: route.totalDistM, totalElevGainM: route.totalElevGainM },
    goalH, goalMin, raceStartTime,
    checkpoints, terrainSegments: terrainSegs, gelZones, advancedSettings,
  } : null, [route, raceName, goalH, goalMin, raceStartTime, checkpoints, terrainSegs, gelZones, advancedSettings]);

  useEffect(() => {
    if (!autoSave || !currentPlanData) return;
    setAutoSaveStatus('saving');
    if (clearSavedRef.current) clearTimeout(clearSavedRef.current);
    const t = setTimeout(() => {
      const trails = loadTrails();
      const existingIdx = autoSaveIdRef.current
        ? trails.findIndex(tr => tr.trailId === autoSaveIdRef.current)
        : -1;
      if (existingIdx >= 0) {
        trails[existingIdx] = { ...currentPlanData, trailId: trails[existingIdx].trailId, savedAt: Date.now() };
      } else {
        const id = crypto.randomUUID();
        autoSaveIdRef.current = id;
        localStorage.setItem(AUTOSAVE_ID_KEY, id);
        trails.unshift({ ...currentPlanData, trailId: id, savedAt: Date.now() });
      }
      persistTrails(trails);
      setAutoSaveStatus('saved');
      clearSavedRef.current = setTimeout(() => setAutoSaveStatus(null), 2000);
    }, 300);
    return () => clearTimeout(t);
  }, [autoSave, currentPlanData]);

  const handleLoadPlan = useCallback((data: TopoPaceFileData) => {
    const parsedRoute: ParsedRoute = {
      points: data.route.points,
      totalDistM: data.route.totalDistM,
      totalElevGainM: data.route.totalElevGainM,
      name: data.name,
    };
    setRoute(parsedRoute);
    setRaceName(data.name);
    setGoalH(data.goalH);
    setGoalMin(data.goalMin);
    setRaceStartTime(data.raceStartTime);
    setCheckpoints(data.checkpoints ?? []);
    setTerrainSegs(data.terrainSegments ?? []);
    setGelZones(data.gelZones ?? []);
    setAdvancedSettings(prev => ({ ...prev, ...(data.advancedSettings ?? {}) }));
    if (data.calibration?.length) setCalibrations(data.calibration);
    if (data.gelZones?.length) gelZonesLockedRef.current = true;
    if ('trailId' in data) {
      autoSaveIdRef.current = (data as { trailId: string }).trailId;
      localStorage.setItem(AUTOSAVE_ID_KEY, autoSaveIdRef.current);
    }
  }, []);

  const handleAutoSaveChange = useCallback((v: boolean) => {
    setAutoSave(v);
    localStorage.setItem(AUTOSAVE_ENABLED_KEY, v ? '1' : '0');
  }, []);

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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {route && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              {editingName ? (
                <input
                  autoFocus
                  value={raceName}
                  onChange={e => setRaceName(e.target.value)}
                  onBlur={() => { setEditingName(false); if (!raceName.trim()) setRaceName(route.name); }}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { setEditingName(false); if (!raceName.trim()) setRaceName(route.name); } }}
                  style={{ fontWeight: 600, fontSize: 13, background: 'transparent', border: 'none', borderBottom: '1px solid var(--green)', color: 'var(--text)', outline: 'none', padding: '0 2px', minWidth: 80, maxWidth: 260 }}
                />
              ) : (
                <span
                  data-tutorial="race-name"
                  style={{ fontWeight: 600, cursor: 'text', borderBottom: '1px solid transparent' }}
                  title="Click to rename"
                  onClick={() => setEditingName(true)}
                >{raceName || route.name}</span>
              )}
              <span>·</span>
              <span>{(route.totalDistM / 1000).toFixed(1)} km</span>
              <span>·</span>
              <span>↑{Math.round(route.totalElevGainM)}m</span>
            </div>
          )}
          {/* Tutorial "?" button — visible only when route is loaded */}
          {route && (
            <button
              className="ghost"
              style={{ fontSize: 13, padding: '4px 8px', lineHeight: 1, color: 'var(--text-secondary)' }}
              title="Start tutorial"
              onClick={() => setTutorialActive(true)}
            >?</button>
          )}
          {/* Settings cog */}
          <div style={{ position: 'relative' }}>
            <button
              ref={settingsBtnRef}
              data-tutorial="settings-btn"
              className="ghost"
              style={{ fontSize: 16, padding: '4px 8px', lineHeight: 1 }}
              title="Settings"
              onClick={() => setSettingsOpen(o => !o)}
            >⚙</button>
            {settingsOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setSettingsOpen(false)} />
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '12px 14px', zIndex: 1000,
                  boxShadow: '0 4px 20px rgba(0,0,0,.5)', minWidth: 180, fontSize: 12,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: 5, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Time format</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(['24h', '12h'] as const).map(f => (
                        <button key={f}
                          className={uiSettings.timeFormat === f ? 'primary' : 'ghost'}
                          style={{ flex: 1, fontSize: 11, padding: '3px 0' }}
                          onClick={() => setUiSettings(s => ({ ...s, timeFormat: f }))}
                        >{f}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: 5, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Distance unit</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(['km', 'mi'] as const).map(u => (
                        <button key={u}
                          className={uiSettings.distUnit === u ? 'primary' : 'ghost'}
                          style={{ flex: 1, fontSize: 11, padding: '3px 0' }}
                          onClick={() => setUiSettings(s => ({ ...s, distUnit: u }))}
                        >{u}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-secondary)', marginBottom: 5, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tutorial</div>
                    <button
                      className="ghost"
                      style={{ width: '100%', fontSize: 11, padding: '3px 0' }}
                      onClick={() => { localStorage.removeItem(TUTORIAL_DONE_KEY); setTutorialActive(true); setSettingsOpen(false); }}
                    >Start tutorial</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* ── Sidebar ── */}
          <aside style={{ width: 320, minWidth: 280, background: 'var(--bg-card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
              {/* Trails button — always visible */}
              <button
                data-tutorial="trails-btn"
                className="ghost"
                style={{ width: '100%', fontSize: 12, padding: '6px 0' }}
                onClick={() => setTrailsOpen(true)}
              >🏔 My Trails</button>

              {route ? (
                <>
                  <GoalTimeForm
                    goalH={goalH} goalMin={goalMin}
                    raceStartTime={raceStartTime}
                    onChangeGoal={(h, m) => { setGoalH(h); setGoalMin(m); }}
                    onChangeStart={setRaceStartTime}
                    timeFormat={uiSettings.timeFormat}
                    totalDistM={route.totalDistM}
                    totalElevGainM={route.totalElevGainM}
                  />
                  <div data-tutorial="checkpoints">
                    <CheckpointPanel checkpoints={checkpoints} totalDistM={route.totalDistM} onChange={setCheckpoints} />
                  </div>
                  <div data-tutorial="gel-advisor">
                    <GelAdvisorPanel settings={advancedSettings} onChange={setAdvancedSettings} gelCount={gelZones.length} />
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px 8px', color: 'var(--text-hint)', fontSize: 13, lineHeight: 1.7 }}>
                  Open a trail from My Trails or drag a GPX onto the map
                </div>
              )}
            </div>

            {route && (
              <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div data-tutorial="run-style">
                  <AdvancedSettingsPanel settings={advancedSettings} onChange={setAdvancedSettings} />
                </div>
                <div data-tutorial="calibration">
                  <ActivityUpload existing={calibrations} onCalibrate={setCalibrations} onReset={() => setCalibrations([])} />
                </div>
                {canPrint && (
                  <div data-tutorial="print">
                    <PrintPlan
                      plan={{ ...plan!, segments }}
                      results={results as CheckpointResult[]}
                      gelResults={advancedSettings.gelInSchedule ? gelResults : []}
                      profileMode={profileMode}
                      getChartSvgHtml={getChartSvgHtml}
                      timeFormat={uiSettings.timeFormat}
                    />
                  </div>
                )}
              </div>
            )}
          </aside>

          {/* ── Right column (map + chart) ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {/* Map — always visible */}
            <div style={{ flex: 1, minHeight: route ? 150 : 0, position: 'relative' }}>
              <RouteMap
                points={route?.points ?? []}
                checkpoints={route ? checkpoints : []}
                hoverDistM={hoverDistM}
                defaultCenter={defaultMapCenter}
                defaultZoom={10}
              />
            </div>

            {route && (
              <>
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
                    <div data-tutorial="mode-toggle" style={{ padding: '8px 16px 0', display: 'flex', gap: 4 }}>
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
                  <div data-tutorial="elevation-chart" ref={chartWrapRef} style={{ padding: '0 16px', paddingTop: 10 }}>
                    <ElevationChart
                      points={route.points}
                      checkpoints={checkpoints}
                      segments={segments}
                      raceStartTime={plan?.raceStartTime}
                      height={chartHeight}
                      terrainSegments={terrainSegs}
                      gelZones={gelZones}
                      onGelZonesChange={handleGelZonesChange}
                      onClickDistTyped={(distM, type) => {
                        const distKm = distM / 1000;
                        setCheckpoints(prev => [...prev, {
                          id: crypto.randomUUID(),
                          name: type === 'aid' ? `Aid ${distKm.toFixed(1)}km` : `POI ${distKm.toFixed(1)}km`,
                          distM, type,
                          plannedStopMin: type === 'aid' ? 5 : 0,
                        }]);
                      }}
                      onAddGelAt={advancedSettings.gelEnabled ? handleAddGelAt : undefined}
                      onHoverDist={setHoverDistM}
                      onMarkSelection={handleMarkSelection}
                      onUpdateTerrain={handleUpdateTerrain}
                      onRemoveTerrain={handleRemoveTerrain}
                      results={results as CheckpointResult[]}
                      gelResults={advancedSettings.gelInSchedule ? gelResults : []}
                      showScheduleLabels={profileMode === 'chart'}
                      onGelRemove={handleGelRemove}
                      timeFormat={uiSettings.timeFormat}
                      distUnit={uiSettings.distUnit}
                    />
                  </div>
                  {results.length > 0 && profileMode === 'table' && (
                    <>
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
                        <PlanTable results={results as CheckpointResult[]} gelResults={advancedSettings.gelInSchedule ? gelResults : []} onAdjustStop={handleAdjustStop} timeFormat={uiSettings.timeFormat} distUnit={uiSettings.distUnit} />
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Drop zone when no route */}
            {!route && (
              <div
                style={{ flex: 0, padding: '16px', display: 'flex', justifyContent: 'center' }}
                onDragOver={e => e.preventDefault()}
                onDrop={async e => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (!file) return;
                  const n = file.name.toLowerCase();
                  try {
                    const text = await file.text();
                    if (n.endsWith('.gpx')) handleRouteLoad(parseRoute(text));
                    else if (n.endsWith('.tppa') || n.endsWith('.tppe') || n.endsWith('.json')) handleLoadPlan(parseTopoPace(text));
                  } catch { /* ignore */ }
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--text-hint)' }}>Drag a GPX or .tppa here to load</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Gel undo toast */}
      {removedGel && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '10px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          fontSize: 13, zIndex: 9999, whiteSpace: 'nowrap',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>Gel {removedGel.gelNumber} removed</span>
          <button className="primary" style={{ fontSize: 12, padding: '3px 12px' }} onClick={handleGelUndo}>Undo</button>
        </div>
      )}

      {/* Trails modal */}
      {trailsOpen && (
        <TrailsModal
          onClose={() => setTrailsOpen(false)}
          onOpenTrail={handleLoadPlan}
          onNewRoute={handleRouteLoad}
          currentPlan={currentPlanData}
          autoSave={autoSave}
          onAutoSaveChange={handleAutoSaveChange}
          autoSaveStatus={autoSaveStatus}
        />
      )}

      {/* Tutorial overlay */}
      {tutorialActive && <Tutorial onDone={() => setTutorialActive(false)} />}
    </div>
  );
}
