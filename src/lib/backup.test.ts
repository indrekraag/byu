import { describe, expect, it } from 'vitest';
import { missingOnServer, toCsv } from './backup';
import type { IntakeRow, Op } from './raceLog';

const row = (id: string): IntakeRow => ({ id, yard: 1, at: '2026-10-17T12:30:00Z', kind: 'food', drink_kind: null, ml: null, carbs_g: 25, text: 'Ate prepared food: gel, "big"', source: 'dashboard', deleted_at: null });
const op = (id: string): Op => ({ type: 'intake', row: row(id) });

describe('self-repair', () => {
  it('re-sends only entries the server lacks and that are not already queued', () => {
    const journal = [op('a'), op('b'), op('c'), op('c')].map(o => ({ at: 'x', op: o }));
    expect(missingOnServer([row('a')], [op('b')], journal).map(o => o.type === 'intake' && o.row.id)).toEqual(['c']);
  });
  it('ignores edits, undos and returns', () => {
    const journal = [{ at: 'x', op: { type: 'undo', id: 'z', at: 'y' } as Op }];
    expect(missingOnServer([], [], journal)).toEqual([]);
  });
});

describe('CSV', () => {
  it('quotes text with commas and quotes', () => {
    const csv = toCsv([row('a')], [{ yard: 1, finish: '2026-10-17T12:47:30Z', lap_ms: 2850000, source: 'official' }]);
    expect(csv.split('\n')[1]).toContain('"Ate prepared food: gel, ""big"""');
    expect(csv.split('\n')[2]).toBe('return,1,2026-10-17T12:47:30Z,official,,,,lap 2850 s,');
  });
});
