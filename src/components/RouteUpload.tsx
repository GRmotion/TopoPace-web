import { useRef, useState } from 'react';
import { parseRoute } from '../parsers/GpxParser';
import type { ParsedRoute } from '../parsers/GpxParser';

interface Props {
  onRoute: (route: ParsedRoute) => void;
  compact?: boolean;
}

export default function RouteUpload({ onRoute, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    setError('');
    if (!file.name.toLowerCase().endsWith('.gpx')) { setError('Please select a .gpx file'); return; }
    try {
      const route = parseRoute(await file.text());
      onRoute(route);
    } catch (e) { setError((e as Error).message); }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept=".gpx"
      style={{ display: 'none' }}
      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
    />
  );

  if (compact) {
    return (
      <div>
        {input}
        <button className="ghost" style={{ width: '100%', fontSize: 12 }} onClick={() => inputRef.current?.click()}>
          📂 Replace route GPX
        </button>
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{error}</div>}
      </div>
    );
  }

  const [dragging, setDragging] = useState(false);

  return (
    <div
      style={{
        border: `2px dashed ${dragging ? 'var(--green)' : 'var(--border)'}`,
        borderRadius: 12,
        textAlign: 'center',
        cursor: 'pointer',
        padding: '40px 20px',
        transition: 'border-color 0.15s',
        background: 'var(--bg-card)',
      }}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      {input}
      <div style={{ fontSize: 32, marginBottom: 12 }}>🏔</div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop GPX route file here</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>or click to browse</div>
      {error && <div style={{ color: 'var(--red)', marginTop: 12, fontSize: 13 }}>{error}</div>}
    </div>
  );
}
