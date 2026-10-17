import { describe, it, expect } from 'vitest';
import { yardStart, validFinish, raceTime, returnTimeForYard } from './raceHQ';
import { raceStartUtc, computeLapClock } from './raceClock';
describe('race headquarters timing', () => {
  const start = raceStartUtc();
  const now = new Date('2026-10-18T13:00:00Z');
  it('keeps hourly starts through midnight and multiple days', () => {
    expect(yardStart(start, 25).toISOString()).toBe('2026-10-18T12:00:00.000Z');
    expect(raceTime(start)).toContain('15:00:00');
  });
  it('accepts actual returns only in their own yard window', () => {
    expect(validFinish(start, 1, new Date('2026-10-17T12:49:00Z'), now)).toBe(true);
    expect(validFinish(start, 1, new Date('2026-10-17T11:59:00Z'), now)).toBe(false);
    expect(validFinish(start, 1, new Date('2026-10-17T13:00:00Z'), now)).toBe(false);
    expect(validFinish(start, 0, start, now)).toBe(false);
    expect(validFinish(start, 1.5, start, now)).toBe(false);
    expect(validFinish(start, 1, new Date('bad'), now)).toBe(false);
    expect(validFinish(start, 27, yardStart(start, 27), now)).toBe(false);
  });
  it('counts the remaining pit down independently of the finish timestamp', () => {
    expect(computeLapClock(start, new Date('2026-10-17T12:50:00Z')).msToNextLap).toBe(600000);
    expect(computeLapClock(start, new Date('2026-10-17T12:55:00Z')).msToNextLap).toBe(300000);
    expect(computeLapClock(start, new Date('2026-10-17T13:00:00Z')).lapNumber).toBe(2);
  });
  it('corrects a return using the yard date in the race timezone, including after midnight', () => {
    expect(returnTimeForYard(start, 1, '15:49')?.toISOString()).toBe('2026-10-17T12:49:00.000Z');
    expect(returnTimeForYard(start, 10, '00:51:12')?.toISOString()).toBe('2026-10-17T21:51:12.000Z');
    expect(returnTimeForYard(start, 25, '15:49')?.toISOString()).toBe('2026-10-18T12:49:00.000Z');
    expect(returnTimeForYard(start, 1, '25:90')).toBeNull();
    expect(returnTimeForYard(start, 0, '15:49')).toBeNull();
  });
});
