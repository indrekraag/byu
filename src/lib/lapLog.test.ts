import { describe, it, expect } from 'vitest';
import { lapLog } from './lapLog';
import { emptyYard } from './raceHQ';
const start = new Date('2026-10-17T12:00:00Z');
const now = new Date('2026-10-18T12:00:00Z');
describe('saved lap log', () => {
  it('calculates lap and available pit time from hourly starts, newest first', () => {
    const rows = lapLog({ 1: { ...emptyYard(), finish: '2026-10-17T12:48:00Z' }, 2: { ...emptyYard(), finish: '2026-10-17T13:51:30Z', finishSource: 'official-lap' } }, start, now);
    expect(rows.map(row => row.yard)).toEqual([2, 1]);
    expect(rows[0].lapMs).toBe(3090000);
    expect(rows[0].restMs).toBe(510000);
    expect(rows[0].source).toBe('Official');
    expect(rows[1].source).toBe('Manual');
  });
  it('omits missing, undone, invalid and future returns without predicting a finish', () => {
    expect(lapLog({ 1: emptyYard(), 2: { ...emptyYard(), finish: 'invalid' }, 3: { ...emptyYard(), finish: '2026-10-17T16:01:00Z' }, 30: { ...emptyYard(), finish: '2026-10-18T17:45:00Z' } }, start, now)).toEqual([]);
  });
  it('handles midnight and corrected returns from the saved finish', () => {
    const record = { ...emptyYard(), finish: '2026-10-17T21:49:00Z' };
    const [row] = lapLog({ 10: record }, start, now);
    expect(row.start.toISOString()).toBe('2026-10-17T21:00:00.000Z');
    expect(row.lapMs).toBe(2940000);
    record.finish = '2026-10-17T21:50:00Z';
    expect(lapLog({ 10: record }, start, now)[0].lapMs).toBe(3000000);
  });
});
