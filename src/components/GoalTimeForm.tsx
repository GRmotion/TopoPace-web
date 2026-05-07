interface Props {
  goalH: number;
  goalMin: number;
  raceStartTime: string;
  onChangeGoal: (h: number, m: number) => void;
  onChangeStart: (time: string) => void;
}

export default function GoalTimeForm({ goalH, goalMin, raceStartTime, onChangeGoal, onChangeStart }: Props) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label>Race Setup</label>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label>Race start time</label>
          <input type="time" value={raceStartTime} onChange={e => onChangeStart(e.target.value)} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label>Goal time</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number" min={0} max={99} value={goalH}
              onChange={e => onChangeGoal(parseInt(e.target.value) || 0, goalMin)}
              style={{ width: 60 }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>h</span>
            <input
              type="number" min={0} max={59} value={goalMin}
              onChange={e => onChangeGoal(goalH, parseInt(e.target.value) || 0)}
              style={{ width: 60 }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>min</span>
          </div>
        </div>
      </div>
    </div>
  );
}
