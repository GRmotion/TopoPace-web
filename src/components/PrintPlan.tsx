import { useState } from 'react';
import type { CheckpointResult, RunPlan, GelResult } from '../models/types';
import { formatTime, formatPace } from '../algorithm/PacePlanner';

interface Props {
  plan: RunPlan;
  results: CheckpointResult[];
  gelResults?: GelResult[];
  profileMode?: 'table' | 'chart';
  getChartSvgHtml?: () => { html: string; width: number; height: number } | null;
  timeFormat?: '12h' | '24h';
}

const PT_PER_PX = 72 / 96; // screen pixel → PDF point (96 dpi screen, 72 pt/inch)
const CANVAS_SCALE = 4;    // 4× for high-quality PDF rasterisation

function bufferStr(min: number | null): string {
  if (min === null) return '—';
  return `${min >= 0 ? '+' : ''}${Math.round(min)}min`;
}

function raceMetaText(plan: RunPlan): string {
  const goalH = Math.floor(plan.goalTimeSec / 3600);
  const goalMin = Math.floor((plan.goalTimeSec % 3600) / 60);
  return `Start: ${plan.raceStartTime}  ·  Goal: ${goalH}h ${goalMin}min`;
}

function generateTableHtml(plan: RunPlan, results: CheckpointResult[], gelResults: GelResult[], timeFormat: '12h' | '24h' = '24h'): string {
  const date = new Date().toLocaleDateString();
  const hasCutoff = results.some(r => r.cutoffTime);

  type Row = { kind: 'cp'; data: CheckpointResult } | { kind: 'gel'; data: GelResult };
  const allRows: Row[] = [
    ...results.map(r => ({ kind: 'cp' as const, data: r })),
    ...gelResults.map(g => ({ kind: 'gel' as const, data: g })),
  ].sort((a, b) => a.data.distM - b.data.distM);

  let cpIdx = 0;
  const rows = allRows.map(row => {
    if (row.kind === 'gel') {
      const g = row.data;
      return `<tr class="gel">
        <td>·</td>
        <td class="name" style="color:#e67e00">Gel ${g.gelNumber}</td>
        <td>${(g.distM / 1000).toFixed(1)}</td>
        <td>—</td>
        <td class="bold">${formatTime(g.etaMs, timeFormat)}</td>
        <td>—</td>
        <td class="bold">${formatTime(g.etaMs, timeFormat)}</td>
        ${hasCutoff ? '<td>—</td><td>—</td>' : ''}
      </tr>`;
    }
    const r = row.data;
    cpIdx++;
    return `<tr>
      <td>${cpIdx}</td>
      <td class="name">${r.name}${r.note ? `<div class="note">${r.note}</div>` : ''}</td>
      <td>${(r.distM / 1000).toFixed(1)}</td>
      <td>${formatPace(r.segmentPaceSecPerKm)}</td>
      <td class="bold">${formatTime(r.etaMs, timeFormat)}</td>
      <td>${r.type === 'aid' ? `${r.plannedStopMin}min` : '—'}</td>
      <td class="bold">${formatTime(r.leaveAtMs, timeFormat)}</td>
      ${hasCutoff ? `<td>${r.cutoffTime ?? '—'}</td>` : ''}
      ${hasCutoff ? `<td class="${r.cutoffBufferMin !== null && r.cutoffBufferMin < 10 ? 'red' : ''}">${bufferStr(r.cutoffBufferMin)}</td>` : ''}
    </tr>`;
  }).join('');

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
    tr.gel td { color: #e67e00; border-bottom-style: dashed; }
    footer { margin-top: 5mm; font-size: 7.5pt; color: #777; }
    @media print { @page { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>TopoPace — ${plan.name}</h1>
  <div class="meta">Start: ${plan.raceStartTime} &nbsp;·&nbsp; Generated: ${date}</div>
  <table>
    <thead>
      <tr>
        <th>#</th><th style="text-align:left">Checkpoint</th><th>km</th>
        <th>Pace</th><th>ETA</th><th>Stop</th><th>Leave</th>${hasCutoff ? '<th>Cutoff</th><th>Buffer</th>' : ''}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <footer>TopoPace race planner · topopace.run</footer>
</body>
</html>`;
}

// A4 landscape HTML for the Print button (paper-friendly)
function generateProfileHtml(plan: RunPlan, svgHtml: string): string {
  const goalH = Math.floor(plan.goalTimeSec / 3600);
  const goalMin = Math.floor((plan.goalTimeSec % 3600) / 60);
  const date = new Date().toLocaleDateString();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>TopoPace — ${plan.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 9pt; color: #000; padding: 10mm; }
    h1 { font-size: 13pt; margin-bottom: 2mm; }
    .meta { font-size: 8pt; color: #555; margin-bottom: 5mm; }
    .chart-wrap { width: 100%; line-height: 0; }
    .chart-wrap svg { width: 100%; height: auto; display: block; }
    footer { margin-top: 6mm; font-size: 7.5pt; color: #888; }
    @media print {
      @page { size: A4 landscape; margin: 10mm; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>TopoPace — ${plan.name}</h1>
  <div class="meta">Start: ${plan.raceStartTime} &nbsp;·&nbsp; Goal: ${goalH}h ${goalMin}min &nbsp;·&nbsp; Generated: ${date}</div>
  <div class="chart-wrap">${svgHtml}</div>
  <footer>TopoPace race planner · topopace.run</footer>
</body>
</html>`;
}

// Render SVG string to an HTMLCanvasElement
function svgToCanvas(svgHtml: string, svgW: number, svgH: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svgW * CANVAS_SCALE;
      canvas.height = svgH * CANVAS_SCALE;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG render failed')); };
    img.src = url;
  });
}

export default function PrintPlan({ plan, results, gelResults = [], profileMode, getChartSvgHtml, timeFormat = '24h' }: Props) {
  const [pdfLoading, setPdfLoading] = useState(false);

  function openPrintWindow(html: string) {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  function handlePrint() {
    let html: string;
    if (profileMode === 'chart' && getChartSvgHtml) {
      const result = getChartSvgHtml();
      html = result
        ? generateProfileHtml(plan, result.html)
        : generateTableHtml(plan, results, gelResults, timeFormat);
    } else {
      html = generateTableHtml(plan, results, gelResults, timeFormat);
    }
    openPrintWindow(html);
  }

  async function handleDownloadPdf() {
    if (!getChartSvgHtml || profileMode !== 'chart') { handlePrint(); return; }
    const result = getChartSvgHtml();
    if (!result) return;

    setPdfLoading(true);
    try {
      const { html, width: W, height: H } = result;

      // Rasterise SVG → canvas
      const canvas = await svgToCanvas(html, W, H);
      const imgData = canvas.toDataURL('image/png');

      // Strip dimensions (pixels → points)
      const PAD = 10;          // horizontal padding px
      const HEADER = 26;       // px above chart
      const FOOTER = 16;       // px below chart
      const pageW = (W + PAD * 2) * PT_PER_PX;
      const pageH = (H + HEADER + FOOTER) * PT_PER_PX;

      // Dynamic import keeps jsPDF out of the initial bundle
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'l', unit: 'pt', format: [pageW, pageH] });

      // White background
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageW, pageH, 'F');

      // Header: bold name + normal meta
      const tx = PAD * PT_PER_PX;
      const ty = (HEADER - 6) * PT_PER_PX;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.text(`TopoPace — ${plan.name}`, tx, ty);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      const nameW = pdf.getTextWidth(`TopoPace — ${plan.name}`) + 6 * PT_PER_PX;
      pdf.text(raceMetaText(plan), tx + nameW, ty);

      // Chart image
      pdf.addImage(imgData, 'PNG', PAD * PT_PER_PX, HEADER * PT_PER_PX, W * PT_PER_PX, H * PT_PER_PX, '', 'FAST');

      // Footer
      pdf.setFontSize(7);
      pdf.setTextColor(170, 170, 170);
      pdf.text('topopace.run', tx, (HEADER + H + FOOTER - 4) * PT_PER_PX);

      pdf.save(`${plan.name || 'plan'}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        className="ghost"
        style={{ flex: 1, padding: '9px 10px', fontSize: 13 }}
        onClick={handlePrint}
      >
        🖨 Print
      </button>
      {profileMode === 'chart' && (
        <button
          className="primary"
          style={{ flex: 1, padding: '9px 10px', fontSize: 13 }}
          onClick={handleDownloadPdf}
          disabled={pdfLoading}
        >
          {pdfLoading ? '…' : '⬇ PDF'}
        </button>
      )}
    </div>
  );
}
