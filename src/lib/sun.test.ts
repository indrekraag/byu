import { describe, expect, it } from 'vitest';
import { sunTimes } from './sun';
import { KEILA } from './weather';

const tallinn = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' });
describe('sunTimes for Keila', () => {
  it('matches the published sunrise/sunset within a few minutes', () => {
    const t = sunTimes(new Date('2026-10-17T10:00:00Z'), KEILA.lat, KEILA.lng);
    const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
    // Open-Meteo for Keila, 17 Oct 2026: sunrise 08:04, sunset 18:09.
    expect(Math.abs(mins(tallinn(t.sunrise)) - mins('08:04'))).toBeLessThanOrEqual(3);
    expect(Math.abs(mins(tallinn(t.sunset)) - mins('18:09'))).toBeLessThanOrEqual(3);
    const t2 = sunTimes(new Date('2026-10-18T10:00:00Z'), KEILA.lat, KEILA.lng);
    expect(Math.abs(mins(tallinn(t2.sunrise)) - mins('08:07'))).toBeLessThanOrEqual(3);
    expect(Math.abs(mins(tallinn(t2.sunset)) - mins('18:06'))).toBeLessThanOrEqual(3);
  });
});
