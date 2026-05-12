import { useState, useEffect } from 'react';

interface Props {
  goalH: number;
  goalMin: number;
  raceStartTime: string;
  onChangeGoal: (h: number, m: number) => void;
  onChangeStart: (time: string) => void;
  timeFormat?: '12h' | '24h';
  totalDistM?: number;
  totalElevGainM?: number;
}

const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
};
const inputStyle: React.CSSProperties = { width: 88, textAlign: 'center' };

function to12h(time24: string): string {
  const parts = time24.split(':').map(Number);
  const h = parts[0] ?? 0, m = parts[1] ?? 0;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function parseStartInput(val: string): string | null {
  const m24 = val.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1]), min = parseInt(m24[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59)
      return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  }
  const m12 = val.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1]), min = parseInt(m12[2]);
    const pm = m12[3].toUpperCase() === 'PM';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59)
      return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  }
  return null;
}

function naisKm(distM: number, gainM: number): number {
  return distM / 1000 + gainM * 0.006;
}

function paceFromGoal(goalH: number, goalMin: number, distM: number, gainM: number): string {
  const nais = naisKm(distM, gainM);
  if (nais <= 0) return '';
  const paceSec = ((goalH * 60 + goalMin) * 60) / nais;
  const min = Math.floor(paceSec / 60);
  const sec = Math.round(paceSec % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function goalFromPace(paceStr: string, distM: number, gainM: number): { h: number; min: number } | null {
  const m = paceStr.trim().match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  const paceSec = parseInt(m[1]) * 60 + parseInt(m[2]);
  const totalSec = paceSec * naisKm(distM, gainM);
  const rounded = Math.round(totalSec / 60 / 5) * 5;
  return { h: Math.floor(rounded / 60), min: rounded % 60 };
}

export default function GoalTimeForm({
  goalH, goalMin, raceStartTime,
  onChangeGoal, onChangeStart,
  timeFormat = '24h', totalDistM, totalElevGainM,
}: Props) {
  const [goalStr, setGoalStr] = useState(`${goalH}:${String(goalMin).padStart(2, '0')}`);
  const [startStr, setStartStr] = useState(
    timeFormat === '12h' ? to12h(raceStartTime) : raceStartTime
  );
  const hasDist = totalDistM != null && totalElevGainM != null && totalDistM > 0;
  const [paceStr, setPaceStr] = useState(
    hasDist ? paceFromGoal(goalH, goalMin, totalDistM!, totalElevGainM!) : ''
  );

  useEffect(() => {
    setGoalStr(`${goalH}:${String(goalMin).padStart(2, '0')}`);
    if (hasDist) setPaceStr(paceFromGoal(goalH, goalMin, totalDistM!, totalElevGainM!));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalH, goalMin]);

  useEffect(() => {
    setStartStr(timeFormat === '12h' ? to12h(raceStartTime) : raceStartTime);
  }, [raceStartTime, timeFormat]);

  function commitGoal(val: string) {
    const m = val.trim().match(/^(\d+):(\d{2})$/);
    if (m) {
      const h = parseInt(m[1]);
      const min = Math.min(59, parseInt(m[2]));
      onChangeGoal(h, min);
      setGoalStr(`${h}:${String(min).padStart(2, '0')}`);
      if (hasDist) setPaceStr(paceFromGoal(h, min, totalDistM!, totalElevGainM!));
    } else {
      setGoalStr(`${goalH}:${String(goalMin).padStart(2, '0')}`);
    }
  }

  function commitPace(val: string) {
    if (!hasDist) return;
    const result = goalFromPace(val, totalDistM!, totalElevGainM!);
    if (result) {
      onChangeGoal(result.h, result.min);
      setPaceStr(paceFromGoal(result.h, result.min, totalDistM!, totalElevGainM!));
    } else {
      setPaceStr(hasDist ? paceFromGoal(goalH, goalMin, totalDistM!, totalElevGainM!) : '');
    }
  }

  function commitStart(val: string) {
    const parsed = parseStartInput(val);
    if (parsed) {
      onChangeStart(parsed);
      setStartStr(timeFormat === '12h' ? to12h(parsed) : parsed);
    } else {
      setStartStr(timeFormat === '12h' ? to12h(raceStartTime) : raceStartTime);
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-tutorial="race-setup">
      <label>Race Setup</label>

      <div style={row}>
        <label style={{ whiteSpace: 'nowrap' }}>Start time</label>
        <input
          type="text"
          value={startStr}
          placeholder={timeFormat === '12h' ? 'H:MM AM' : 'HH:MM'}
          onChange={e => setStartStr(e.target.value)}
          onBlur={e => commitStart(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitStart((e.target as HTMLInputElement).value); }}
          style={inputStyle}
        />
      </div>

      <div style={row}>
        <label style={{ whiteSpace: 'nowrap' }}>Goal time</label>
        <input
          type="text"
          value={goalStr}
          placeholder="H:MM"
          onChange={e => setGoalStr(e.target.value)}
          onBlur={e => commitGoal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitGoal((e.target as HTMLInputElement).value); }}
          style={inputStyle}
        />
      </div>

      {hasDist && (
        <div style={row}>
          <label style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }} title="Grade Adjusted Pace — elevation-equivalent flat pace (NAIS: 1 m gain ≈ 6 m flat)">avg GAP</label>
          <input
            type="text"
            value={paceStr}
            placeholder="M:SS/km"
            onChange={e => setPaceStr(e.target.value)}
            onBlur={e => commitPace(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitPace((e.target as HTMLInputElement).value); }}
            style={{ ...inputStyle, fontSize: 12, color: 'var(--text-secondary)' }}
          />
        </div>
      )}
    </div>
  );
}
