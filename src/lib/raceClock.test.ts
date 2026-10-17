import { describe, it, expect } from 'vitest';
import { zonedTimeToUtc, raceStartUtc, computeLapClock, isNapLapWindow, formatClock } from './raceClock';
import { RACE } from '../data/raceConfig';

describe('zonedTimeToUtc', () => {
  // Estonia is UTC+3 (EEST) during summer time, UTC+2 (EET) outside it.
  // Getting this wrong shifts the whole race clock by an hour.
  it('resolves a summer-time (EEST, UTC+3) wall clock', () => {
    expect(zonedTimeToUtc('2026-07-01', '15:00', 'Europe/Tallinn').toISOString()).toBe('2026-07-01T12:00:00.000Z');
  });

  it('resolves a winter-time (EET, UTC+2) wall clock', () => {
    expect(zonedTimeToUtc('2026-01-15', '15:00', 'Europe/Tallinn').toISOString()).toBe('2026-01-15T13:00:00.000Z');
  });

  it('puts race day on the summer-time side of the October changeover', () => {
    // EU DST ends on the last Sunday of October (25 Oct 2026), so 17 Oct is
    // still EEST. This is the single conversion race-day mode depends on.
    expect(raceStartUtc().toISOString()).toBe('2026-10-17T12:00:00.000Z');
  });

  it('handles the day after the changeover as winter time', () => {
    expect(zonedTimeToUtc('2026-10-26', '15:00', 'Europe/Tallinn').toISOString()).toBe('2026-10-26T13:00:00.000Z');
  });

  it('agrees with the 2024 race reference point (12:00 UTC = 15:00 Tallinn)', () => {
    expect(zonedTimeToUtc('2024-10-19', '15:00', 'Europe/Tallinn').toISOString()).toBe('2024-10-19T12:00:00.000Z');
  });
});

describe('computeLapClock', () => {
  const start = new Date('2026-10-17T12:00:00.000Z');
  const lapMs = RACE.lapWindowMin * 60_000;

  it('is on lap 1 at the gun, with a full window to the next call', () => {
    const c = computeLapClock(start, start);
    expect(c.lapNumber).toBe(1);
    expect(c.elapsedMs).toBe(0);
    expect(c.msToNextLap).toBe(lapMs);
  });

  it('stays on lap 1 until the hour is actually up', () => {
    const c = computeLapClock(start, new Date(start.getTime() + lapMs - 1000));
    expect(c.lapNumber).toBe(1);
    expect(c.msToNextLap).toBe(1000);
  });

  it('rolls to lap 2 exactly on the hour', () => {
    const c = computeLapClock(start, new Date(start.getTime() + lapMs));
    expect(c.lapNumber).toBe(2);
    expect(c.msToNextLap).toBe(lapMs);
  });

  it('counts deep into a multi-day effort', () => {
    // 27,9 h elapsed -- the 2024 race length -- lands inside lap 28.
    const c = computeLapClock(start, new Date(start.getTime() + 27.9 * 3_600_000));
    expect(c.lapNumber).toBe(28);
  });

  it('clamps to lap 1 before the start rather than going negative', () => {
    const c = computeLapClock(start, new Date(start.getTime() - 5 * 3_600_000));
    expect(c.lapNumber).toBe(1);
    expect(c.elapsedMs).toBe(0);
  });
});

describe('isNapLapWindow', () => {
  const h = (n: number) => n * 3_600_000;

  it('is quiet early on, before any nap is due', () => {
    expect(isNapLapWindow(h(0))).toBe(false);
    expect(isNapLapWindow(h(3))).toBe(false);
  });

  it('opens around the first nap at ~5,5 h', () => {
    expect(isNapLapWindow(h(5.5))).toBe(true);
    expect(isNapLapWindow(h(5.2))).toBe(true);
    expect(isNapLapWindow(h(5.9))).toBe(true);
  });

  it('closes between naps', () => {
    expect(isNapLapWindow(h(8))).toBe(false);
  });

  it('reopens on each subsequent interval', () => {
    expect(isNapLapWindow(h(11))).toBe(true); // 2nd
    expect(isNapLapWindow(h(16.5))).toBe(true); // 3rd
    expect(isNapLapWindow(h(22))).toBe(true); // 4th
  });
});

describe('formatClock', () => {
  it('omits the hour field under an hour', () => {
    expect(formatClock(59 * 60_000)).toBe('59:00');
    expect(formatClock(90_000)).toBe('1:30');
  });

  it('shows h:mm:ss once past an hour, zero-padded', () => {
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(3_661_000)).toBe('1:01:01');
  });

  it('keeps counting past a day rather than wrapping', () => {
    expect(formatClock(27.9 * 3_600_000)).toBe('27:54:00');
  });
});
