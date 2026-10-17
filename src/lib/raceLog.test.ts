import { describe, expect, it } from 'vitest';
import { rowsFromHQ, toRecords, type IntakeRow } from './raceLog';
import { emptyYard } from './raceHQ';

const row = (id: string, yard: number, extra: Partial<IntakeRow> = {}): IntakeRow => ({ id, yard, at: `2026-10-17T1${yard}:30:00Z`, kind: 'drink', drink_kind: 'water', ml: 250, carbs_g: 0, text: '', source: 'dashboard', deleted_at: null, ...extra });

describe('toRecords', () => {
  it('drops undone entries, including ones undone in the outbox', () => {
    const recs = toRecords([row('a', 1), row('b', 1, { deleted_at: '2026-10-17T13:00:00Z' }), row('c', 2)], [], [{ type: 'undo', id: 'c', at: 'x' }]);
    expect(recs[1].intake?.map(e => e.id)).toEqual(['a']);
    expect(recs[2]?.intake ?? []).toEqual([]);
  });
  it('shows unsent entries and keeps an official return over a manual one', () => {
    const recs = toRecords([], [{ yard: 1, finish: '2026-10-17T12:48:00Z', lap_ms: 2880000, source: 'official' }], [
      { type: 'intake', row: row('p', 1) },
      { type: 'return', row: { yard: 1, finish: '2026-10-17T12:50:00Z', lap_ms: null, source: 'manual' } },
    ]);
    expect(recs[1].intake?.[0].id).toBe('p');
    expect(recs[1]).toMatchObject({ finish: '2026-10-17T12:48:00Z', finishSource: 'official-lap', officialLapMs: 2880000 });
  });
  it('keeps unknown carbs unknown', () => {
    expect(toRecords([row('a', 1, { carbs_g: null })], [])[1].intake?.[0].carbsG).toBeUndefined();
  });
});

describe('rowsFromHQ', () => {
  it('keeps Laura ids and converts returns', () => {
    const { intake, returns } = rowsFromHQ({ 3: { ...emptyYard(), intake: [{ id: 'laura-1', at: '2026-10-17T14:50:00Z', text: 'x', kind: 'drink', drinkKind: '160', ml: 500, carbsG: 40 }], finish: '2026-10-17T14:49:00Z', finishSource: 'official-lap', officialLapMs: 2940000 } });
    expect(intake[0]).toMatchObject({ id: 'laura-1', yard: 3, drink_kind: '160', carbs_g: 40, source: 'laura-app-import' });
    expect(returns[0]).toEqual({ yard: 3, finish: '2026-10-17T14:49:00Z', lap_ms: 2940000, source: 'official' });
  });
});

describe('outbox dedupe', async () => {
  const { dedupe } = await import('../hooks/useRaceLog');
  it('collapses the same official lap written in two time formats', () => {
    const a = { type: 'return' as const, row: { yard: 1, finish: '2026-10-17T12:47:30.000Z', lap_ms: 2850000, source: 'official' as const } };
    const b = { type: 'return' as const, row: { ...a.row, finish: '2026-10-17T12:47:30+00:00' } };
    expect(dedupe([a, b, a])).toHaveLength(1);
  });
});
