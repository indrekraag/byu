import { describe, expect, it } from 'vitest';
import { caffeineOf, portionOf, FOODS } from '../data/foods';
import { caffeineStatus, sinceLast } from './crewStatus';
import { toRecords, type IntakeRow } from './raceLog';
import { raceStartUtc } from './raceClock';

const start = raceStartUtc(); // 2026-10-17 12:00Z = 15:00 Tallinn
const row = (id: string, at: string, extra: Partial<IntakeRow> = {}): IntakeRow => ({ id, yard: 1, at, kind: 'food', drink_kind: null, ml: null, carbs_g: 25, text: 'x', source: 'dashboard', deleted_at: null, ...extra });

describe('food catalogue', () => {
  it('reads caffeine from portions', () => {
    const solid = FOODS.find(f => f.id === 'solid-c')!;
    expect(caffeineOf(`Ate prepared food: ${portionOf(solid, 0.5).text}`)).toBe(25);
    expect(caffeineOf('Ate prepared food: Maurten Gel 100 CAF 100')).toBe(100);
    expect(caffeineOf('Ate prepared food: 3 Party Fred gummies')).toBe(0);
  });
  it('counts palaleib pieces at 15 g each', () => {
    expect(portionOf(FOODS.find(f => f.id === 'palaleib')!, 3)).toEqual({ text: '3 × palaleib with ham and pickle', carbsG: 45 });
  });
});

describe('notes', () => {
  it('keeps notes out of intake totals', () => {
    const recs = toRecords([row('n', '2026-10-17T12:30:00Z', { kind: null, carbs_g: null, text: 'note:Stomach' })], []);
    expect(recs[1].intake ?? []).toEqual([]);
    expect(recs[1].notes?.[0].text).toBe('Stomach');
  });
});

describe('since last / caffeine', () => {
  const recs = toRecords([
    row('a', '2026-10-17T18:00:00Z', { text: 'Ate prepared food: Maurten Gel 100 CAF 100' }), // 21:00 local
    row('b', '2026-10-17T19:30:00Z', { kind: 'drink', carbs_g: 0, ml: 250 }),
  ], []);
  it('measures minutes since carbs and since a drink', () => {
    expect(sinceLast(recs, start, new Date('2026-10-17T20:00:00Z'))).toEqual({ carbsMin: 120, drinkMin: 30 });
  });
  it('holds caffeine until 22:00, then spaces doses 2–3 h', () => {
    const at = (iso: string) => caffeineStatus(recs, start, new Date(iso));
    expect(at('2026-10-17T18:30:00Z').state).toBe('before');
    expect(at('2026-10-17T19:30:00Z').state).toBe('wait'); // 22:30 local: dose at 21:00, next from 23:00
    expect(at('2026-10-17T20:30:00Z').state).toBe('ok');
    expect(at('2026-10-17T21:30:00Z').state).toBe('due');
    expect(at('2026-10-17T21:30:00Z').total).toBe(100);
  });
});
