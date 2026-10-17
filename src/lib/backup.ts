import type { IntakeRow, Op, ReturnRow } from './raceLog';

// Belt and braces for the race log, on every device:
// - journal: every change made on this device, kept forever (never cleared),
//   independent of the outbox. Used to repair the server if an entry is missing.
// - snapshots: a copy of the whole log every 10 minutes, the last 12 kept.
const JOURNAL_KEY = 'byu-dash:journal:v1';
const SNAP_KEY = 'byu-dash:snapshots:v1';
const SNAP_EVERY_MS = 10 * 60_000;
const SNAP_KEEP = 12;

export type JournalEntry = { at: string; op: Op };
export type Snapshot = { at: string; intake: IntakeRow[]; returns: ReturnRow[] };

const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };

export const readJournal = () => read<JournalEntry[]>(JOURNAL_KEY, []);
export function journal(ops: Op[]) {
  const at = new Date().toISOString();
  write(JOURNAL_KEY, [...readJournal(), ...ops.map(op => ({ at, op }))]);
}

export const readSnapshots = () => read<Snapshot[]>(SNAP_KEY, []);
export function snapshot(intake: IntakeRow[], returns: ReturnRow[], now = new Date()) {
  const list = readSnapshots();
  const last = list[list.length - 1];
  if (last && now.getTime() - Date.parse(last.at) < SNAP_EVERY_MS) return;
  write(SNAP_KEY, [...list, { at: now.toISOString(), intake, returns }].slice(-SNAP_KEEP));
}

/** Entries this device logged that the server does not have (and that are not
 *  already waiting in the outbox): re-send them. Ids make this idempotent. */
export function missingOnServer(server: IntakeRow[], outbox: Op[], log = readJournal()): Op[] {
  const have = new Set(server.map(r => r.id));
  const queued = new Set(outbox.filter(o => o.type === 'intake').map(o => (o as Extract<Op, { type: 'intake' }>).row.id));
  const seen = new Set<string>();
  const out: Op[] = [];
  for (const { op } of log) {
    if (op.type !== 'intake' || have.has(op.row.id) || queued.has(op.row.id) || seen.has(op.row.id)) continue;
    seen.add(op.row.id); out.push(op);
  }
  return out;
}

/** A spreadsheet of the race log: one row per entry. */
export function toCsv(intake: IntakeRow[], returns: ReturnRow[]) {
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['type', 'yard', 'time_utc', 'kind', 'drink', 'ml', 'carbs_g', 'text', 'undone']];
  for (const r of intake) rows.push(['intake', String(r.yard), r.at, r.kind ?? 'note', r.drink_kind ?? '', r.ml == null ? '' : String(r.ml), r.carbs_g == null ? '' : String(r.carbs_g), r.text, r.deleted_at ? 'yes' : '']);
  for (const r of returns) rows.push(['return', String(r.yard), r.finish, r.source, '', '', '', r.lap_ms == null ? '' : `lap ${Math.round(r.lap_ms / 1000)} s`, '']);
  return rows.map(r => r.map(esc).join(',')).join('\n');
}
