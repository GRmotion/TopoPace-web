import { useEffect, useState, useLayoutEffect } from 'react';

interface Step {
  id: string;
  title: string;
  body: string;
  target: string; // data-tutorial attribute value, or '' for end screen
  placement: 'right' | 'left' | 'bottom' | 'top';
}

const STEPS: Step[] = [
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
    body: 'After selecting a range, click the + button to mark it as a tougher or easier terrain segment. Great for technical single-track vs. road sections.',
    target: 'elevation-chart',
    placement: 'top',
  },
  {
    id: 'mode-toggle',
    title: 'Schedule / Profile',
    body: 'Switch between the race schedule table and the visual profile strip. The strip shows ETA at every checkpoint laid out under the elevation chart — great for printing.',
    target: 'mode-toggle',
    placement: 'top',
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
  {
    id: 'trails',
    title: 'My Trails',
    body: 'All your plans are saved here. Open, duplicate, or export any of them. You can also import a new GPX or .tppa file.',
    target: 'trails-btn',
    placement: 'right',
  },
  { id: 'end', title: '', body: '', target: '', placement: 'right' },
];

interface TargetRect { top: number; left: number; width: number; height: number; }

interface Props {
  onDone: () => void;
}

export const TUTORIAL_DONE_KEY = 'topopace_tutorial_done';

export default function Tutorial({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  const current = STEPS[step];
  const isEnd = current.id === 'end';
  const total = STEPS.length - 1; // exclude end

  useLayoutEffect(() => {
    if (!current.target) { setRect(null); return; }
    const el = document.querySelector(`[data-tutorial="${current.target}"]`);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step, current.target]);

  // Recompute rect on window resize
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

  function skip() { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); onDone(); }
  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); onDone(); }
  }

  // Tooltip placement logic
  const PAD = 16;
  const TW = 280;
  let tipStyle: React.CSSProperties = {};
  let arrowStyle: React.CSSProperties = {};
  let arrowClass = '';

  if (isEnd) {
    tipStyle = {
      position: 'fixed',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 340,
    };
  } else if (rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // pick placement based on available space
    let placement = current.placement;
    if (placement === 'right' && rect.left + rect.width + PAD + TW > vw) placement = 'left';
    if (placement === 'left' && rect.left - PAD - TW < 0) placement = 'bottom';
    if (placement === 'bottom' && rect.top + rect.height + PAD + 180 > vh) placement = 'top';

    if (placement === 'right') {
      const top = Math.max(PAD, Math.min(vh - 200, cy - 90));
      tipStyle = { position: 'fixed', left: rect.left + rect.width + PAD, top, width: TW };
      arrowStyle = { position: 'fixed', left: rect.left + rect.width + 6, top: top + 16, border: '7px solid transparent', borderRightColor: 'var(--border)' };
      arrowClass = 'right';
    } else if (placement === 'left') {
      const top = Math.max(PAD, Math.min(vh - 200, cy - 90));
      tipStyle = { position: 'fixed', left: rect.left - PAD - TW, top, width: TW };
      arrowStyle = { position: 'fixed', left: rect.left - 13, top: top + 16, border: '7px solid transparent', borderLeftColor: 'var(--border)' };
      arrowClass = 'left';
    } else if (placement === 'bottom') {
      const left = Math.max(PAD, Math.min(vw - TW - PAD, cx - TW / 2));
      tipStyle = { position: 'fixed', top: rect.top + rect.height + PAD, left, width: TW };
      arrowStyle = { position: 'fixed', top: rect.top + rect.height + 6, left: cx - 7, border: '7px solid transparent', borderBottomColor: 'var(--border)' };
      arrowClass = 'bottom';
    } else {
      const left = Math.max(PAD, Math.min(vw - TW - PAD, cx - TW / 2));
      const bottom = vh - rect.top + PAD;
      tipStyle = { position: 'fixed', bottom, left, width: TW };
      arrowStyle = { position: 'fixed', bottom: bottom - 13, left: cx - 7, border: '7px solid transparent', borderTopColor: 'var(--border)' };
      arrowClass = 'top';
    }
    void arrowClass; // used for key only
  }

  return (
    <>
      {/* Dimmed overlay */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 4000, pointerEvents: 'auto' }} />

      {/* Spotlight ring over target element */}
      {rect && !isEnd && (
        <div style={{
          position: 'fixed',
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          borderRadius: 10,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.58)',
          border: '2px solid var(--green)',
          zIndex: 4001,
          pointerEvents: 'none',
          transition: 'all 180ms cubic-bezier(0.3,0,0,1)',
        }} />
      )}

      {/* No-route overlay (entire screen) when no target */}
      {!rect && !isEnd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.58)', zIndex: 4001, pointerEvents: 'none' }} />
      )}

      {/* Arrow */}
      {rect && !isEnd && <div style={{ ...arrowStyle, zIndex: 4003, pointerEvents: 'none' }} />}

      {/* Tooltip */}
      <div className="anim-pop" style={{
        ...tipStyle,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '18px 20px',
        boxShadow: '0 6px 32px rgba(0,0,0,0.55)',
        zIndex: 4004,
        pointerEvents: 'auto',
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
