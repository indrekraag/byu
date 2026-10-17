import type { YardRecord } from './raceHQ';

// Interim intake source until live sync exists: the JSON file from Laura's app,
// Race HQ / Lists → "Export lists and crew records" (backyard-race-headquarters.json).
export const IMPORT_KEY = 'byu-dash:imported-hq:v1';
export type ImportedIntake = { importedAt: string; fileName: string; yards: Record<string, YardRecord> };

export function parseHQExport(json: string, fileName: string, now: Date): ImportedIntake {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('Not a JSON file.'); }
  const yards = (parsed as { yards?: unknown })?.yards;
  if (!yards || typeof yards !== 'object' || Array.isArray(yards)) throw new Error('No race yards in this file. Use Race HQ → "Export lists and crew records".');
  const clean: Record<string, YardRecord> = {};
  for (const [key, value] of Object.entries(yards as Record<string, unknown>)) {
    if (!/^[1-9]\d*$/.test(key) || !value || typeof value !== 'object') continue;
    const record = value as YardRecord;
    clean[key] = { ...record, intake: Array.isArray(record.intake) ? record.intake.filter(e => e && typeof e.at === 'string') : [] };
  }
  return { importedAt: now.toISOString(), fileName, yards: clean };
}

export function loadImported(): ImportedIntake | null {
  try { const raw = localStorage.getItem(IMPORT_KEY); return raw ? JSON.parse(raw) as ImportedIntake : null; } catch { return null; }
}
export function saveImported(data: ImportedIntake) {
  try { localStorage.setItem(IMPORT_KEY, JSON.stringify(data)); } catch { /* Still shown for this session. */ }
}
