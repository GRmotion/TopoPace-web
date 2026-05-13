import type { TrackPoint, Checkpoint, TerrainSegment, GelZone, AdvancedSettings, CalibrationResult, ProfileNote } from '../models/types';

export interface TopoPaceFileData {
  version: 3;
  savedAt: number;
  name: string;
  route: {
    points: TrackPoint[];
    totalDistM: number;
    totalElevGainM: number;
  };
  goalH: number;
  goalMin: number;
  raceStartTime: string;
  checkpoints: Checkpoint[];
  terrainSegments: TerrainSegment[];
  gelZones: GelZone[];
  advancedSettings: AdvancedSettings;
  notes?: ProfileNote[];
  calibration?: CalibrationResult[];
  mapView?: {
    mapStyle: 'osm' | 'topo' | 'satellite';
    lineMode: 'solid' | 'elevation' | 'speed';
    lineColor: string;
    terrainOverlay: boolean;
  };
}

export function serializeTopoPace(data: Omit<TopoPaceFileData, 'version' | 'savedAt'>): string {
  const file: TopoPaceFileData = { version: 3, savedAt: Date.now(), ...data };
  return JSON.stringify(file);
}

export function parseTopoPace(text: string): TopoPaceFileData {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('Invalid file — not valid JSON'); }
  const d = data as Record<string, unknown>;
  if (d.version !== 3) throw new Error('Unsupported file version');
  if (!Array.isArray((d.route as Record<string, unknown>)?.points)) throw new Error('File contains no route data');
  return data as TopoPaceFileData;
}

export function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
