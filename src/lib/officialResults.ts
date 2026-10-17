import { raceStartUtc } from './raceClock';
import { RACE } from '../data/raceConfig';
import { emptyYard, yardStart, validFinish, type YardRecord } from './raceHQ';

export const OFFICIAL_RESULTS_URL = 'https://my.raceresult.com/428094/details?pid=15';
const EVENT_URL = 'https://my.raceresult.com/428094';
export type OfficialFinish = { yard: number; at: string; lapMs: number };
export type OfficialSnapshot = { checkedAt: string; finishes: OfficialFinish[]; unrecognized: number };
export function applyOfficialFinish(records: Record<string, YardRecord>, finish: OfficialFinish, now: Date) {
  if (records[finish.yard]?.finish || !Number.isFinite(finish.lapMs) || finish.lapMs <= 0 || finish.lapMs >= RACE.lapWindowMin * 60000 || !validFinish(raceStartUtc(), finish.yard, new Date(finish.at), now) || Date.parse(finish.at) - yardStart(raceStartUtc(), finish.yard).getTime() !== finish.lapMs) return records;
  return { ...records, [finish.yard]: { ...(records[finish.yard] || emptyYard()), finish: finish.at, finishSource: 'official-lap' as const, officialLapMs: finish.lapMs } };
}
type Table = { DataFields?: unknown; data?: unknown };

function rows(value: unknown, width: number): unknown[][] {
  if (!Array.isArray(value)) return [];
  if (value.length >= width && !Array.isArray(value[0]) && value[0] !== null && typeof value[0] !== 'object') return [value];
  return value.flatMap(item => rows(item, width));
}
function runnerRow(table: Table): { fields: string[]; row?: unknown[] } {
  if (!Array.isArray(table.DataFields) || !table.DataFields.every(f => typeof f === 'string')) throw new Error('Timing feed format changed. Use manual return logging.');
  const fields = table.DataFields as string[];
  const bib = fields.indexOf('BIB');
  if (bib < 0) throw new Error('Bib numbers are missing from the timing feed.');
  const matches = rows(table.data, fields.length).filter(row => String(row[bib]).trim() === '15');
  if (matches.length > 1) throw new Error('Multiple results match bib 15. Use manual return logging.');
  const row = matches[0];
  if (row) {
    const name = fields.includes('DisplayName') ? String(row[fields.indexOf('DisplayName')]) : `${row[fields.indexOf('FIRSTNAME')]} ${row[fields.indexOf('LASTNAME')]}`;
    if (name.trim().replace(/\s+/g, ' ').toLowerCase() !== 'laura komp') throw new Error('Bib 15 does not match Laura Komp. Use manual return logging.');
  }
  return { fields, row };
}

// FINISH publishes LapN durations. Calculate a return from that yard's
// configured start; keep its provenance so it is never presented as a raw stamp.
export function parseLapDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parts = /^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)(?:[.,](\d{1,3}))?$/.exec(value.trim());
  if (!parts) return null;
  const ms = ((Number(parts[1] || 0) * 60 + Number(parts[2])) * 60 + Number(parts[3])) * 1000 + Number((parts[4] || '').padEnd(3, '0'));
  return ms > 0 && ms < RACE.lapWindowMin * 60000 ? ms : null;
}
export function parseOfficialLaps(table: Table, now: Date): Pick<OfficialSnapshot, 'finishes' | 'unrecognized'> {
  const { fields, row } = runnerRow(table);
  const finishes: OfficialFinish[] = [];
  let unrecognized = 0;
  if (!row) return { finishes, unrecognized };
  fields.forEach((field, index) => {
    const match = /^Lap([1-9]\d*)$/.exec(field);
    if (!match || row[index] === '' || row[index] === null || row[index] === undefined) return;
    const yard = Number(match[1]);
    const lapMs = parseLapDuration(row[index]);
    const at = lapMs === null ? null : new Date(yardStart(raceStartUtc(), yard).getTime() + lapMs);
    if (at && lapMs !== null && validFinish(raceStartUtc(), yard, at, now)) finishes.push({ yard, at: at.toISOString(), lapMs });
    else unrecognized++;
  });
  return { finishes: finishes.sort((a, b) => a.yard - b.yard), unrecognized };
}

export async function fetchOfficialResults(signal: AbortSignal): Promise<OfficialSnapshot> {
  async function read(url: string) {
    const response = await fetch(url, { signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Official results are unavailable. Manual logging still works.');
    return response.json();
  }
  const config = await read(`${EVENT_URL}/results/config?lang=en&sanitize=true`);
  if (typeof config.key !== 'string' || !config.key) throw new Error('Timing feed configuration unavailable.');
  const host = typeof config.server === 'string' ? config.server : 'my.raceresult.com';
  if (!/^my\d*\.raceresult\.com$/.test(host)) throw new Error('Timing server changed. Use the official results link.');
  const endpoint = `https://${host}/428094/results/list?`;
  const params = (name: string) => new URLSearchParams({ key: config.key, listname: name, page: 'results', contest: '0', r: 'search', l: '0', openedGroups: '{}', term: '15' });
  const overview = await read(endpoint + params('Result Lists|FINISH'));
  if (!runnerRow(overview).row) throw new Error('Laura Komp · bib 15 was not found. Manual logging still works.');
  const now = new Date();
  return { checkedAt: now.toISOString(), ...parseOfficialLaps(overview, now) };
}
