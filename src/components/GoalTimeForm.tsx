import { useState, useEffect } from 'react';

interface Props {
  goalH: number;
  goalMin: number;
  raceStartTime: string;
  onChangeGoal: (h: number, m: number) => void;
  onChangeStart: (time: string) => void;
}

const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
};

const inputStyle: React.CSSProperties = {
  width: 72, textAlign: 'center',
};

export default function GoalTimeForm({ goalH, goalMin, raceStartTime, onChangeGoal, onChangeStart }: Props) {
  const [goalStr, setGoalStr] = useState(`${goalH}:${String(goalMin).padStart(2, '0')}`);

  useEffect(() => {
    setGoalStr(`${goalH}:${String(goalMin).padStart(2, '0')}`);
  }, [goalH, goalMin]);

  function commitGoal(val: string) {
    const m = val.match(/^(\d+):(\d{2})$/);
    if (m) {
      const h = parseInt(m[1]);
      const min = Math.min(59, parseInt(m[2]));
      onChangeGoal(h, min);
      setGoalStr(`${h}:${String(min).padStart(2, '0')}`);
    } else {
      setGoalStr(`${goalH}:${String(goalMin).padStart(2, '0')}`);
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label>Race Setup</label>

      <div style={row}>
        <label style={{ whiteSpace: 'nowrap' }}>Start time</label>
        <input
          type="text"
          value={raceStartTime}
          placeholder="HH:MM"
          onChange={e => onChangeStart(e.target.value)}
          onBlur={e => {
            const m = e.target.value.match(/^(\d{1,2}):(\d{2})$/);
            if (m) onChangeStart(`${m[1].padStart(2, '0')}:${m[2]}`);
          }}
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
    </div>
  );
}
