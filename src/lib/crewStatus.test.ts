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

describe('amountIn (last amount for stepper tiles)', async () => {
  const { FOODS, amountIn, portionOf } = await import('../data/foods');
  const food = (id: string) => FOODS.find(f => f.id === id)!;
  it('reads counts, older fixed texts and percentages back', () => {
    expect(amountIn(food('gummies'), 'Ate prepared food: 4 × Party Fred gummies')).toBe(4);
    expect(amountIn(food('gummies'), 'Ate prepared food: 3 Party Fred gummies')).toBe(3);
    expect(amountIn(food('solid-c'), `Ate prepared food: ${portionOf(food('solid-c'), 0.3).text}`)).toBe(0.3);
    expect(amountIn(food('solid-c'), 'Ate prepared food: Maurten Solid C 160')).toBe(1);
    expect(amountIn(food('potato-half'), 'Ate prepared food: 3 small potato halves')).toBe(3);
    expect(amountIn(food('gummies'), 'Ate prepared food: 2 × palaleib with ham and pickle')).toBeNull();
  });
  it('prices gummies per piece', () => {
    expect(portionOf(food('gummies'), 3).carbsG).toBe(22.3);
    expect(portionOf(food('gummies'), 5).carbsG).toBe(37.2);
  });
});

describe('amountIn for gram/segment foods and typed-in foods', async () => {
  const { FOODS, amountIn, portionOf, customFood } = await import('../data/foods');
  const food = (id: string) => FOODS.find(f => f.id === id)!;
  it('reads older fixed entries as their amount', () => {
    expect(amountIn(food('orange'), 'Ate prepared food: 4 peeled orange segments')).toBe(4);
    expect(amountIn(food('potatoes'), 'Ate prepared food: 100 g cooked boiled potatoes in 1 bowl')).toBe(100);
    expect(amountIn(food('mash'), 'Ate prepared food: 100 g prepared familiar mash in 1 bowl')).toBe(100);
    expect(amountIn(food('bread'), 'Ate prepared food: 30 g white bread + 10 g familiar smooth jam')).toBe(1);
  });
  it('writes and reads new amounts, with carbs', () => {
    expect(portionOf(food('potatoes'), 150)).toEqual({ text: '150 g cooked boiled potatoes', carbsG: 22.5 });
    expect(amountIn(food('potatoes'), 'Ate prepared food: 150 g cooked boiled potatoes')).toBe(150);
    expect(portionOf(food('orange'), 2).carbsG).toBe(3.1);
  });
  it('treats typed-in foods as portions', () => {
    const t = customFood('Tactical', 15);
    expect(amountIn(t, 'Ate prepared food: Tactical')).toBe(1);
    expect(amountIn(t, 'Ate prepared food: 2 × Tactical')).toBe(2);
    expect(portionOf(t, 2)).toEqual({ text: '2 × Tactical', carbsG: 30 });
  });
});
