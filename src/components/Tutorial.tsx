import { useEffect, useState, useLayoutEffect, useRef } from 'react';

interface Step {
  id: string;
  title: string;
  body: string;
  target: string;
  placement: 'right' | 'left' | 'bottom' | 'top';
}

const STEPS: Step[] = [
  {
    id: 'trails',
    title: 'My Trails',
    body: 'All your plans are saved here. Open, duplicate, or export any of them. You can also import a new GPX or .tppa file.',
    target: 'trails-btn',
    placement: 'right',
  },
  {
    id: 'race-setup',
    title: 'Race Setup',
    body: 'Set your goal time and race start time here. Enter time directly or use the avg pace field — TopoPace will convert automatically using your route\'s elevation profile.',
    target: 'race-setup',
    placement: 'right',
  },
  {
    id: 'checkpoints',
    title: 'Checkpoints',
    body: 'Add aid stations and waypoints. Click on the profile to place them, or use the panel here. Set planned stop time at each aid station.',
    target: 'checkpoints',
    placement: 'right',
  },
  {
    id: 'gel-advisor',
    title: 'Gel Advisor',
    body: 'Plan your nutrition. Enable the gel advisor and set your target interval — gels will appear on the profile and in the schedule.',
    target: 'gel-advisor',
    placement: 'right',
  },
  {
    id: 'run-style',
    title: 'Run Style',
    body: 'Fine-tune your pacing model. Slide left for a conservative (negative split) strategy, right for an aggressive start.',
    target: 'run-style',
    placement: 'right',
  },
  {
    id: 'calibration',
    title: 'Personal Calibration',
    body: 'Upload past Strava or Garmin activities to calibrate the model to your climbing and descending strengths. The more activities, the more accurate the schedule.',
    target: 'calibration',
    placement: 'right',
  },
  {
    id: 'elevation-chart',
    title: 'Route Profile',
    body: 'Hover anywhere on the profile to see elevation, pace, and ETA. Click to open the point menu — add an aid station, POI, or gel directly on the chart.',
    target: 'elevation-chart',
    placement: 'top',
  },
  {
    id: 'selection',
    title: 'Selection Data',
    body: 'Click and drag on the profile to select a range. The info bar shows distance, avg pace, duration, and elevation gain/loss (↗↘) for the selection.',
    target: 'elevation-chart',
    placement: 'top',
  },
  {
    id: 'terrain',
    title: 'Terrain Segments',
    body: 'After selecting a range, click + to add a terrain segment. Hover it to reveal the ✕ to remove it. The segment starts at 0% — no change to pace yet.',
    target: 'elevation-chart',
    placement: 'top',
  },
  {
    id: 'terrain-drag',
    title: 'Adjusting Difficulty',
    body: 'Drag the % value left for faster terrain (downhill, road), right for harder terrain (rocky trail, mud). The info bar updates instantly — showing the time impact on that segment.',
    target: 'elevation-chart',
    placement: 'top',
  },
  {
    id: 'notes',
    title: 'Profile Notes',
    body: 'Add text notes anchored to any point on the profile. Click the pencil button to enter note mode, then click the elevation line to set the anchor and again to place the text box. Drag to reposition; hover to reveal the delete button.',
    target: 'note-btn',
    placement: 'left',
  },
  {
    id: 'emoji',
    title: 'Emoji Stickers',
    body: 'Drop emoji stickers anywhere on the profile. Hover the smiley button to choose from quick presets, or click it to open the full emoji browser with search. Click to drop — drag placed stickers to reposition them.',
    target: 'emoji-btn',
    placement: 'left',
  },
  {
    id: 'mode-toggle',
    title: 'Schedule / Profile',
    body: 'Switch between the race schedule table and the visual profile strip. The strip shows ETA at every checkpoint laid out under the elevation chart — great for printing.',
    target: 'mode-toggle',
    placement: 'top',
  },
  {
    id: 'map-settings',
    title: 'Map Settings',
    body: 'Hover the ⚙ panel to switch map style (Street / Topo / Satellite), change line colour, toggle terrain and gel overlays, and set a race date to see the sun elevation curve on the profile — a yellow line showing how high the sun is at each point of your race.',
    target: 'map-settings',
    placement: 'left',
  },
  {
    id: 'print',
    title: 'Print',
    body: 'Export your race plan as a PDF. Open the print view with the current mode — table or profile strip — and save or print from your browser.',
    target: 'print',
    placement: 'top',
  },
  {
    id: 'race-name',
    title: 'Race Name',
    body: 'Click the race name in the header to rename your plan. The name is used for exported files.',
    target: 'race-name',
    placement: 'bottom',
  },
  {
    id: 'settings-btn',
    title: 'Options',
    body: 'Toggle between 12h / 24h time display and km / miles distance unit. Settings are saved to your browser.',
    target: 'settings-btn',
    placement: 'bottom',
  },
  { id: 'end', title: '', body: '', target: '', placement: 'right' },
];

interface TargetRect { top: number; left: number; width: number; height: number; }
interface SimPlot { l: number; t: number; w: number; h: number; }

interface Props {
  onDone: () => void;
}

export const TUTORIAL_DONE_KEY = 'topopace_tutorial_done';

// Easing helpers
function eo(t: number): number { const c = Math.min(1, Math.max(0, t)); return 1 - (1 - c) * (1 - c); }
function ei(t: number): number { const c = Math.min(1, Math.max(0, t)); return c * c; }
function seg(t: number, start: number, end: number): number { return Math.min(1, Math.max(0, (t - start) / (end - start))); }

function fmtSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
function fmtPace(secPerKm: number): string {
  const s = Math.max(0, Math.round(secPerKm));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function Tutorial({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [simPlot, setSimPlot] = useState<SimPlot | null>(null);
  const [animT, setAnimT] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const current = STEPS[step];
  const isEnd = current.id === 'end';
  const total = STEPS.length - 1;
  const isSimStep = !isEnd && (current.id === 'selection' || current.id === 'terrain' || current.id === 'terrain-drag');

  // Measure target element rect
  useLayoutEffect(() => {
    if (!current.target) { setRect(null); return; }
    const el = document.querySelector(`[data-tutorial="${current.target}"]`);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step, current.target]);

  // Measure SVG plot area (clipPath rect) for simulation overlay
  useLayoutEffect(() => {
    if (!isSimStep || !rect) { setSimPlot(null); return; }
    const chartEl = document.querySelector('[data-tutorial="elevation-chart"]');
    if (!chartEl) return;
    const svg = chartEl.querySelector('svg');
    if (!svg) return;
    const cp = svg.querySelector('clipPath rect');
    if (!cp) return;
    const svgBr = svg.getBoundingClientRect();
    const elBr = chartEl.getBoundingClientRect();
    const x = parseFloat(cp.getAttribute('x') ?? '50');
    const y = parseFloat(cp.getAttribute('y') ?? '10');
    const w = parseFloat(cp.getAttribute('width') ?? '0');
    const h = parseFloat(cp.getAttribute('height') ?? '0');
    setSimPlot({
      l: svgBr.left - elBr.left + x,
      t: svgBr.top - elBr.top + y,
      w, h,
    });
  }, [isSimStep, step, rect]);

  // Window resize
  useEffect(() => {
    function onResize() {
      if (!current.target) return;
      const el = document.querySelector(`[data-tutorial="${current.target}"]`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [current.target]);

  // Animation loop
  useEffect(() => {
    if (!isSimStep || !simPlot) { setAnimT(0); return; }
    const CYCLE = current.id === 'terrain' ? 4000 : current.id === 'terrain-drag' ? 5000 : 2500;
    startRef.current = performance.now();
    function tick(now: number) {
      setAnimT(((now - startRef.current) % CYCLE) / CYCLE);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [isSimStep, current.id, simPlot]);

  function skip() { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); onDone(); }
  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); onDone(); }
  }

  // ── Simulation derived values ──────────────────────────────────────────────
  let selGrow = 0, selAlpha = 0, infoAlpha = 0, simKm = 0;
  let plusAlpha = 0, plusScale = 1;
  let terrainAlpha = 0;
  let dragAlpha = 0, dragPct = 0, leftArrowAlpha = 0, rightArrowAlpha = 0;

  if (isSimStep && simPlot) {
    if (current.id === 'selection') {
      // Cycle 2500ms — each element appears in 150ms, staggered by 50ms
      // 0–150ms:   sel grows          [0,     0.060]
      // 50–200ms:  info fades in      [0.020, 0.080]  (starts while sel still growing)
      // hold 200ms–1800ms
      // 1800–2000ms: fade out         [0.720, 0.800]
      selGrow          = eo(seg(animT, 0,     0.060));
      const infoIn     = eo(seg(animT, 0.020, 0.080));
      const fade       = ei(seg(animT, 0.720, 0.800));
      selAlpha         = 1 - fade;
      infoAlpha        = infoIn * (1 - fade);
    } else {
      // Cycle 4000ms — 150ms appearances, staggered
      // 0–150ms:    sel grows         [0,      0.0375]
      // 50–200ms:   info fades in     [0.0125, 0.050 ]
      // 250–400ms:  + button appears  [0.0625, 0.100 ]
      // hold 400ms–1500ms
      // 1500–1650ms: click — + pulse + fade, sel fade  [0.375, 0.4125]
      // 1650–1800ms: terrain fades in [0.4125, 0.450 ]
      // hold 1800ms–3000ms
      // 3000–3200ms: global fade      [0.750,  0.800 ]
      // 3200–4000ms: gap
      selGrow = eo(seg(animT, 0, 0.0375));

      const selFade    = eo(seg(animT, 0.375, 0.4125));
      const globalFade = ei(seg(animT, 0.750, 0.800));
      selAlpha         = (1 - selFade) * (1 - globalFade);

      const infoIn     = eo(seg(animT, 0.0125, 0.050));
      infoAlpha        = infoIn * (1 - globalFade);

      const plusIn     = eo(seg(animT, 0.0625, 0.100));
      const plusOut    = eo(seg(animT, 0.375,  0.4125));
      plusAlpha        = Math.max(0, plusIn * (1 - plusOut));
      const pulse      = Math.sin(Math.PI * seg(animT, 0.375, 0.4125));
      plusScale        = 1 + 0.35 * pulse;

      terrainAlpha     = eo(seg(animT, 0.4125, 0.450)) * (1 - globalFade);
    }
    simKm = 6.5 * selGrow;

    if (current.id === 'terrain-drag') {
      // 5000ms cycle: fade-in → drag left (0→-30%) → hold → drag right (-30→+40%) → hold → fade-out → gap
      dragAlpha = eo(seg(animT, 0, 0.04)) * (1 - ei(seg(animT, 0.86, 0.95)));
      const leftDrag  = eo(seg(animT, 0.04, 0.36));
      const rightDrag = eo(seg(animT, 0.46, 0.76));
      dragPct = leftDrag * (-30) + rightDrag * 70;
      leftArrowAlpha  = eo(seg(animT, 0.04, 0.08)) * (1 - eo(seg(animT, 0.33, 0.36)));
      rightArrowAlpha = eo(seg(animT, 0.46, 0.50)) * (1 - eo(seg(animT, 0.73, 0.76)));
    }
  }

  const simDurSec  = 2242 * (simKm / 6.5);
  const simEndKm   = (25.0 + simKm).toFixed(1);
  const simGainM   = Math.round(320 * simKm / 6.5);
  const simLossM   = Math.round(85  * simKm / 6.5);

  const dragCol = dragPct <= 0 ? '#66bb6a' : dragPct <= 15 ? '#ffd54f' : dragPct <= 40 ? '#ff9800' : '#f44336';
  const dragBg  = dragPct <= 0 ? 'rgba(102,187,106,0.12)' : dragPct <= 15 ? 'rgba(255,213,79,0.12)' : dragPct <= 40 ? 'rgba(255,152,0,0.12)' : 'rgba(244,67,54,0.12)';
  const dragPaceSecPerKm = 345 * (1 + dragPct / 100);
  const dragDurSec = Math.round(2242 * (1 + dragPct / 100));

  // ── Tooltip placement ─────────────────────────────────────────────────────
  const PAD = 16, TW = 280;
  let tipStyle: React.CSSProperties = {};

  if (isEnd) {
    tipStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 340 };
  } else if (rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    let placement = current.placement;
    if (placement === 'right'  && rect.left + rect.width + PAD + TW > vw) placement = 'left';
    if (placement === 'left'   && rect.left - PAD - TW < 0)               placement = 'bottom';
    if (placement === 'bottom' && rect.top + rect.height + PAD + 180 > vh) placement = 'top';

    if (placement === 'right') {
      const top = Math.max(PAD, Math.min(vh - 200, cy - 90));
      tipStyle = { position: 'fixed', left: rect.left + rect.width + PAD, top, width: TW };
    } else if (placement === 'left') {
      const top = Math.max(PAD, Math.min(vh - 200, cy - 90));
      tipStyle = { position: 'fixed', left: rect.left - PAD - TW, top, width: TW };
    } else if (placement === 'bottom') {
      const left = Math.max(PAD, Math.min(vw - TW - PAD, cx - TW / 2));
      tipStyle = { position: 'fixed', top: rect.top + rect.height + PAD, left, width: TW };
    } else {
      const left   = Math.max(PAD, Math.min(vw - TW - PAD, cx - TW / 2));
      const bottom = vh - rect.top + PAD;
      tipStyle = { position: 'fixed', bottom, left, width: TW };
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Dimmed overlay */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 4000, pointerEvents: 'auto' }} />

      {/* Spotlight ring */}
      {rect && !isEnd && (
        <div style={{
          position: 'fixed',
          top: rect.top - 4, left: rect.left - 4,
          width: rect.width + 8, height: rect.height + 8,
          borderRadius: 10,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.58)',
          border: '2px solid var(--green)',
          zIndex: 4001, pointerEvents: 'none',
          transition: 'all 180ms cubic-bezier(0.3,0,0,1)',
        }} />
      )}

      {!rect && !isEnd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.58)', zIndex: 4001, pointerEvents: 'none' }} />
      )}

      {/* ── Simulation overlay ── */}
      {isSimStep && rect && simPlot && (() => {
        // Centre-x of the selection (mid of its final width)
        const selLeft  = simPlot.l + simPlot.w * 0.5;
        const selW     = simPlot.w * 0.07;
        const infoCx   = selLeft + selW * 0.5;             // mid of selection
        const infoBot  = rect.height - (simPlot.t + simPlot.h) + 4; // from bottom of overlay

        // Border color: interpolate from --border (#2a2d3a) to segment red (#f44336)
        const t = terrainAlpha;
        const infoBorderColor = t > 0
          ? `rgb(${Math.round(42 + 202 * t)},${Math.round(45 + 22 * t)},${Math.round(58 - 4 * t)})`
          : 'var(--border)';

        return (
          <div style={{
            position: 'fixed',
            top: rect.top, left: rect.left,
            width: rect.width, height: rect.height,
            zIndex: 4002, pointerEvents: 'none',
          }}>
            {/* Selection rectangle — all 4 borders, grows via scaleX */}
            {selAlpha > 0.01 && (
              <div style={{
                position: 'absolute',
                left: selLeft, top: simPlot.t,
                width: selW, height: simPlot.h,
                transformOrigin: 'left center',
                transform: `scaleX(${selGrow})`,
                opacity: selAlpha,
                background: 'rgba(255,213,79,0.18)',
                border: '1.5px solid #ffd54f',
                boxSizing: 'border-box',
              }} />
            )}

            {/* Terrain rect — rendered before info bar so it sits behind it */}
            {current.id === 'terrain' && terrainAlpha > 0.01 && (
              <div style={{
                position: 'absolute',
                left: selLeft, top: simPlot.t,
                width: selW, height: simPlot.h,
                opacity: terrainAlpha,
                background: 'rgba(244,67,54,0.12)',
                border: '1.5px solid #f44336',
                boxSizing: 'border-box',
              }} />
            )}

            {/* Info bar — border color transitions to segment color when terrain visible */}
            {infoAlpha > 0.01 && (
              <div style={{
                position: 'absolute',
                left: infoCx, bottom: infoBot,
                transform: 'translateX(-50%)',
                opacity: infoAlpha,
                background: 'var(--bg-card)',
                border: `1px solid ${infoBorderColor}`,
                borderRadius: 8, padding: '5px 10px',
                fontSize: 11, lineHeight: 1.6,
                whiteSpace: 'nowrap', display: 'flex', gap: 8, alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>25.0–{simEndKm} km</span>
                <strong>{simKm.toFixed(1)} km</strong>
                <span>5:45<span style={{ color: 'var(--text-hint)', marginLeft: 2 }}>/km avg</span></span>
                <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{fmtSec(simDurSec)}</span>
                {simGainM > 0 && <span style={{ color: 'var(--green)', fontWeight: 600 }}>↗{simGainM}m</span>}
                {simLossM > 0 && <span style={{ color: '#e57373', fontWeight: 600 }}>↘{simLossM}m</span>}
              </div>
            )}

            {/* "+" button — terrain step only, synced with selection growth */}
            {current.id === 'terrain' && plusAlpha > 0.01 && (
              <div style={{
                position: 'absolute',
                top: simPlot.t + 2, left: selLeft - 1,
                transform: `scale(${plusScale})`,
                transformOrigin: 'left top',
                opacity: plusAlpha,
                background: 'rgba(0,0,0,0.55)', color: '#fff',
                border: '1.5px solid transparent', borderRadius: 3,
                fontSize: 14, fontWeight: 700, lineHeight: '1.5', padding: '0 4px',
                boxShadow: '0 1px 4px rgba(0,0,0,.35)',
              }}>+</div>
            )}

            {/* Terrain badge (after click) — % + ✕, no gear */}
            {current.id === 'terrain' && terrainAlpha > 0.01 && (
              <div style={{
                position: 'absolute',
                top: simPlot.t + 4, left: selLeft + 4,
                opacity: terrainAlpha,
                display: 'flex', gap: 3, alignItems: 'center',
              }}>
                <div style={{
                  background: 'rgba(0,0,0,0.55)', color: '#fff',
                  border: '1.5px solid transparent', borderRadius: 3,
                  fontSize: 10, padding: '0 5px', fontWeight: 700,
                  height: 18, display: 'flex', alignItems: 'center',
                  boxShadow: '0 1px 4px rgba(0,0,0,.35)', whiteSpace: 'nowrap',
                }}>0%</div>
                <div style={{
                  background: '#f44336', color: '#fff', borderRadius: 3, border: 'none',
                  fontSize: 8, padding: '0 5px',
                  height: 18, display: 'flex', alignItems: 'center',
                  boxShadow: '0 1px 4px rgba(0,0,0,.35)',
                }}>✕</div>
              </div>
            )}
            {/* terrain-drag step */}
            {current.id === 'terrain-drag' && dragAlpha > 0.01 && (
              <>
                {/* Terrain rect — color follows dragPct */}
                <div style={{
                  position: 'absolute',
                  left: selLeft, top: simPlot.t,
                  width: selW, height: simPlot.h,
                  opacity: dragAlpha,
                  background: dragBg,
                  border: `1.5px solid ${dragCol}`,
                  boxSizing: 'border-box',
                }} />

                {/* Badge row: ← % ✕ → */}
                <div style={{
                  position: 'absolute',
                  top: simPlot.t + 4, left: selLeft + 4,
                  opacity: dragAlpha,
                  display: 'flex', gap: 3, alignItems: 'center',
                }}>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, opacity: leftArrowAlpha, textShadow: '0 1px 3px rgba(0,0,0,.7)', minWidth: 10 }}>←</span>
                  <div style={{
                    background: dragCol, color: '#fff', borderRadius: 3,
                    fontSize: 10, padding: '0 5px', fontWeight: 700,
                    height: 18, display: 'flex', alignItems: 'center',
                    boxShadow: '0 1px 4px rgba(0,0,0,.35)', cursor: 'ew-resize',
                  }}>{Math.round(dragPct) > 0 ? '+' : ''}{Math.round(dragPct)}%</div>
                  <div style={{
                    background: dragCol, color: '#fff', borderRadius: 3,
                    fontSize: 8, padding: '0 5px',
                    height: 18, display: 'flex', alignItems: 'center',
                    boxShadow: '0 1px 4px rgba(0,0,0,.35)',
                  }}>✕</div>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, opacity: rightArrowAlpha, textShadow: '0 1px 3px rgba(0,0,0,.7)', minWidth: 10 }}>→</span>
                </div>

                {/* Info bar — border and duration update with dragPct */}
                <div style={{
                  position: 'absolute',
                  left: infoCx, bottom: infoBot,
                  transform: 'translateX(-50%)',
                  opacity: dragAlpha,
                  background: 'var(--bg-card)',
                  border: `1px solid ${dragCol}`,
                  borderRadius: 8, padding: '5px 10px',
                  fontSize: 11, lineHeight: 1.6,
                  whiteSpace: 'nowrap', display: 'flex', gap: 8, alignItems: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,.4)',
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>25.0–31.5 km</span>
                  <strong>6.5 km</strong>
                  <span>{fmtPace(dragPaceSecPerKm)}<span style={{ color: 'var(--text-hint)', marginLeft: 2 }}>/km avg</span></span>
                  <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{fmtSec(dragDurSec)}</span>
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>↗320m</span>
                  <span style={{ color: '#e57373', fontWeight: 600 }}>↘85m</span>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Tooltip */}
      <div className="anim-pop" style={{
        ...tipStyle,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12, padding: '18px 20px',
        boxShadow: '0 6px 32px rgba(0,0,0,0.55)',
        zIndex: 4004, pointerEvents: 'auto',
      }}>
        {isEnd ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🏔</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>You're all set!</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              Have ideas or feature requests? We'd love to hear from you.
            </div>
            <a href="mailto:hello@topopace.run" style={{
              display: 'block', color: 'var(--green)', fontWeight: 600, fontSize: 13, marginBottom: 20,
            }}>hello@topopace.run</a>
            <button className="primary" style={{ width: '100%', padding: '10px 0' }} onClick={next}>
              Start planning
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{current.title}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.65, marginBottom: 16 }}>
              {current.body}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{step + 1} / {total}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="ghost" style={{ fontSize: 12, padding: '5px 14px' }} onClick={skip}>Skip</button>
                {step > 0 && (
                  <button className="ghost" style={{ fontSize: 12, padding: '5px 14px' }} onClick={() => setStep(s => s - 1)}>←</button>
                )}
                <button className="primary" style={{ fontSize: 12, padding: '5px 18px' }} onClick={next}>
                  {step < STEPS.length - 2 ? 'Next' : 'Finish'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
