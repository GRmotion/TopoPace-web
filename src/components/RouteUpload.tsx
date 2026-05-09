import { useRef, useState } from 'react';
import { parseRoute } from '../parsers/GpxParser';
import type { ParsedRoute } from '../parsers/GpxParser';
import { parseTopoPace } from '../utils/TopoPaceFile';
import type { TopoPaceFileData } from '../utils/TopoPaceFile';

interface Props {
  onRoute: (route: ParsedRoute) => void;
  onPlan?: (data: TopoPaceFileData) => void;
  compact?: boolean;
}

export default function RouteUpload({ onRoute, onPlan, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    setError('');
    const name = file.name.toLowerCase();
    if (name.endsWith('.gpx')) {
      try {
        onRoute(parseRoute(await file.text()));
      } catch (e) { setError((e as Error).message); }
      return;
    }
    if ((name.endsWith('.tppe') || name.endsWith('.json')) && onPlan) {
      try {
        onPlan(parseTopoPace(await file.text()));
      } catch (e) { setError((e as Error).message); }
      return;
    }
    setError('Please select a .gpx or .tppe file');
  }

  const accept = onPlan ? '.gpx,.tppe,.json' : '.gpx';

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      style={{ display: 'none' }}
      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
    />
  );

  if (compact) {
    return (
      <div>
        {input}
        <button className="ghost" style={{ width: '100%', fontSize: 12 }} onClick={() => inputRef.current?.click()}>
          Replace GPX
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
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Drop GPX or TopoPace file here</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>or click to browse · .gpx / .tppe</div>
      {error && <div style={{ color: 'var(--red)', marginTop: 12, fontSize: 13 }}>{error}</div>}
    </div>
  );
}
