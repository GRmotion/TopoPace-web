import type { CheckpointResult, RunPlan } from '../models/types';
import { formatTime, formatPace } from '../algorithm/PacePlanner';

interface Props {
  plan: RunPlan;
  results: CheckpointResult[];
}

function bufferStr(min: number | null): string {
  if (min === null) return '—';
  return `${min >= 0 ? '+' : ''}${Math.round(min)}min`;
}

function generateHtml(plan: RunPlan, results: CheckpointResult[]): string {
  const goalH = Math.floor(plan.goalTimeSec / 3600);
  const goalMin = Math.floor((plan.goalTimeSec % 3600) / 60);
  const date = new Date().toLocaleDateString();

  const rows = results.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="name">${r.name}${r.note ? `<div class="note">${r.note}</div>` : ''}</td>
      <td>${(r.distM / 1000).toFixed(1)}</td>
      <td>${formatPace(r.segmentPaceSecPerKm)}</td>
      <td class="bold">${formatTime(r.etaMs)}</td>
      <td>${r.type === 'aid' ? `${r.plannedStopMin}min` : '—'}</td>
      <td class="bold">${formatTime(r.leaveAtMs)}</td>
      <td>${r.cutoffTime ?? '—'}</td>
      <td class="${r.cutoffBufferMin !== null && r.cutoffBufferMin < 10 ? 'red' : ''}">${bufferStr(r.cutoffBufferMin)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>TopoPace — ${plan.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; padding: 12mm; }
    h1 { font-size: 12pt; margin-bottom: 2mm; }
    .meta { font-size: 8pt; color: #555; margin-bottom: 5mm; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; padding: 2px 5px; border-bottom: 1.5px solid #000; text-align: center; white-space: nowrap; }
    td { padding: 2.5px 5px; border-bottom: .5px solid #ccc; text-align: center; vertical-align: top; }
    td.name { text-align: left; font-weight: 600; }
    .note { font-size: 7.5pt; font-weight: 400; color: #555; margin-top: 1px; }
    .bold { font-weight: 700; }
    .red { color: #c00; font-weight: 700; }
    footer { margin-top: 5mm; font-size: 7.5pt; color: #777; }
    @media print { @page { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>TopoPace — ${plan.name}</h1>
  <div class="meta">Start: ${plan.raceStartTime} &nbsp;·&nbsp; Goal: ${goalH}h ${goalMin}min &nbsp;·&nbsp; Generated: ${date}</div>
  <table>
    <thead>
      <tr>
        <th>#</th><th style="text-align:left">Checkpoint</th><th>km</th>
        <th>Pace</th><th>ETA</th><th>Stop</th><th>Leave</th><th>Cutoff</th><th>Buffer</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>TopoPace race planner · topopace.app</footer>
</body>
</html>`;
}

export default function PrintPlan({ plan, results }: Props) {
  function handlePrint() {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(generateHtml(plan, results));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  return (
    <button className="primary" style={{ padding: '10px 24px', width: '100%' }} onClick={handlePrint}>
      🖨 Print / Save as PDF
    </button>
  );
}
