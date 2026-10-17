import { describe, expect, it } from 'vitest';
import { pollDelay } from './useOfficialLaps';
import { raceStartUtc } from '../lib/raceClock';

const at = (yard: number, minute: number) => new Date(raceStartUtc().getTime() + ((yard - 1) * 60 + minute) * 60_000);
describe('official results check timing', () => {
  it('checks every 15 s from minute 42 until the next start', () => {
    expect(pollDelay(at(9, 42))).toBe(15_000);
    expect(pollDelay(at(9, 59.5))).toBe(15_000);
  });
  it('checks every 2 minutes earlier in the yard, waking for the fast window', () => {
    expect(pollDelay(at(9, 10))).toBe(120_000);
    expect(pollDelay(at(9, 41))).toBe(60_000);
  });
});
