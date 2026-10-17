import { describe, it, expect } from 'vitest';
import { raceSummaryRows } from './raceSummary';
import { emptyYard } from './raceHQ';
const start = new Date('2026-10-17T12:00:00Z');
describe('separate race summary', () => {
  it('shows each elapsed yard and current yard, distinguishing no logs from known zero', () => {
    const rows = raceSummaryRows({ 1: { ...emptyYard(), intake: [{ id: 'water', at: '2026-10-17T12:30:00Z', kind: 'drink', text: 'Water', ml: 250, carbsG: 0 }] } }, start, new Date('2026-10-17T14:10:00Z'));
    expect(rows.map(row => row.yard)).toEqual([3, 2, 1]);
    expect(rows[0].current).toBe(true);
    expect(rows[1].hasEntries).toBe(false);
    expect(rows[2]).toMatchObject({ hasEntries: true, carbs: 0, fluid: 250 });
  });
  it('keeps unknown food visible and does not include pre-race or future events', () => {
    const rows = raceSummaryRows({ 1: { ...emptyYard(), finish: '2026-10-17T12:48:00Z', intake: [{ id: 'banana', at: '2026-10-17T12:50:00Z', kind: 'food', text: 'Half banana' }, { id: 'practice', at: '2026-10-16T12:00:00Z', text: 'Practice', carbsG: 100 }, { id: 'future', at: '2026-10-18T12:00:00Z', text: 'Future', carbsG: 100 }] } }, start, new Date('2026-10-17T13:10:00Z'));
    expect(rows[1]).toMatchObject({ carbs: 0, incomplete: true, food: ['Half banana'] });
    expect(rows[1].lap?.lapMs).toBe(2880000);
  });
  it('shows no race rows before start and preserves input records', () => {
    const records = { 1: emptyYard() }; const before = JSON.stringify(records);
    expect(raceSummaryRows(records, start, new Date('2026-10-16T12:00:00Z'))).toEqual([]);
    expect(JSON.stringify(records)).toBe(before);
  });
});
