import { emptyYard, type IntakeEvent, type YardRecord } from './raceHQ';

export type IntakeRow = { id: string; yard: number; at: string; kind: 'food' | 'drink' | null; drink_kind: string | null; ml: number | null; carbs_g: number | null; text: string; source: 'dashboard' | 'laura-app-import'; deleted_at: string | null };
export type ReturnRow = { yard: number; finish: string; lap_ms: number | null; source: 'official' | 'manual' };

export type EditPatch = Partial<Pick<IntakeRow, 'yard' | 'ml' | 'carbs_g' | 'text'>>;

export type Op =
  | { type: 'intake'; row: IntakeRow }
  | { type: 'undo'; id: string; at: string }
  | { type: 'edit'; id: string; patch: EditPatch }
  | { type: 'return'; row: ReturnRow };

const num = (v: number | null | undefined) => v === null || v === undefined ? undefined : Number(v);

/** Server rows plus not-yet-sent outbox ops, shaped like Laura's app records so the existing race maths applies. */
export function toRecords(intake: IntakeRow[], returns: ReturnRow[], outbox: Op[] = []): Record<string, YardRecord> {
  const rows = new Map(intake.map(r => [r.id, r]));
  const rets = new Map(returns.map(r => [r.yard, r]));
  for (const op of outbox) {
    if (op.type === 'intake' && !rows.has(op.row.id)) rows.set(op.row.id, op.row);
    if (op.type === 'undo') { const r = rows.get(op.id); if (r) rows.set(op.id, { ...r, deleted_at: op.at }); }
    if (op.type === 'edit') { const r = rows.get(op.id); if (r) rows.set(op.id, { ...r, ...op.patch }); }
    if (op.type === 'return' && !(op.row.source === 'manual' && rets.get(op.row.yard)?.source === 'official')) rets.set(op.row.yard, op.row);
  }
  const records: Record<string, YardRecord> = {};
  const yard = (n: number) => (records[n] ??= emptyYard());
  for (const r of rows.values()) {
    if (r.deleted_at) continue;
    const event: IntakeEvent = { id: r.id, at: r.at, text: r.text, kind: r.kind ?? undefined, drinkKind: (r.drink_kind ?? undefined) as IntakeEvent['drinkKind'], ml: num(r.ml), carbsG: num(r.carbs_g) };
    (yard(r.yard).intake ??= []).push(event);
  }
  for (const rec of Object.values(records)) rec.intake?.sort((a, b) => a.at.localeCompare(b.at));
  for (const r of rets.values()) Object.assign(yard(r.yard), { finish: r.finish, finishSource: r.source === 'official' ? 'official-lap' : 'manual', officialLapMs: num(r.lap_ms) });
  return records;
}

export function eventToRow(yard: number, e: IntakeEvent, source: IntakeRow['source']): IntakeRow {
  return { id: e.id, yard, at: e.at, kind: e.kind ?? null, drink_kind: e.drinkKind ?? null, ml: e.ml ?? null, carbs_g: e.carbsG ?? null, text: e.text ?? '', source, deleted_at: null };
}

/** Rows from Laura's Race HQ export. Keeps her ids so a second import adds only new entries. */
export function rowsFromHQ(yards: Record<string, YardRecord>): { intake: IntakeRow[]; returns: ReturnRow[] } {
  const intake: IntakeRow[] = [], returns: ReturnRow[] = [];
  for (const [key, rec] of Object.entries(yards)) {
    const yard = Number(key);
    for (const e of rec.intake ?? []) intake.push(eventToRow(yard, e, 'laura-app-import'));
    // Older free-text fields: kept as entries with unknown carbs, never guessed.
    const at = rec.intake?.[0]?.at ?? rec.finish;
    if (at && rec.food) intake.push({ ...eventToRow(yard, { id: `hq-food-${yard}`, at, text: rec.food, kind: 'food' }, 'laura-app-import') });
    if (at && rec.drink) intake.push({ ...eventToRow(yard, { id: `hq-drink-${yard}`, at, text: rec.drink, kind: 'drink' }, 'laura-app-import') });
    if (rec.finish) returns.push({ yard, finish: rec.finish, lap_ms: rec.officialLapMs ?? null, source: rec.finishSource === 'official-lap' ? 'official' : 'manual' });
  }
  return { intake, returns };
}
