import { useRef, useState } from 'react';
import { parseRoute } from '../parsers/GpxParser';
import type { ParsedRoute } from '../parsers/GpxParser';

interface Props {
  onRoute: (route: ParsedRoute) => void;
}

export default function RouteUpload({ onRoute }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    setError('');
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      setError('Please select a .gpx file');
      return;
    }
    try {
      const text = await file.text();
      const route = parseRoute(text);
      onRoute(route);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div
      className="card"
      style={{
        border: `2px dashed ${dragging ? 'var(--green)' : 'var(--border)'}`,
        textAlign: 'center',
        cursor: 'pointer',
        padding: '40px 20px',
        transition: 'border-color 0.15s',
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
      <input
        ref={inputRef}
        type="file"
        accept=".gpx"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <div style={{ fontSize: 32, marginBottom: 12 }}>🏔</div>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop GPX route file here</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>or click to browse</div>
      {error && <div style={{ color: 'var(--red)', marginTop: 12, fontSize: 13 }}>{error}</div>}
    </div>
  );
}
