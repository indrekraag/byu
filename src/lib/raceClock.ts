import { RACE } from '../data/raceConfig';

/**
 * Converts a wall-clock date/time in a given IANA zone to the correct UTC
 * instant, DST-aware. Standard round-trip trick: format the same instant in
 * both the target zone and UTC, re-parse both as if local, and the
 * difference is the zone's offset at that date -- the parsing machine's own
 * timezone cancels out since it's applied identically both times.
 */
export function zonedTimeToUtc(dateIso: string, timeHHmm: string, timeZone: string): Date {
  const guess = new Date(`${dateIso}T${timeHHmm}:00Z`);
  const asZone = new Date(guess.toLocaleString('en-US', { timeZone }));
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = asUtc.getTime() - asZone.getTime();
  return new Date(guess.getTime() + offsetMs);
}

export function raceStartUtc(): Date {
  return zonedTimeToUtc(RACE.date, RACE.startTimeLocal, RACE.timezone);
}

export interface LapClock {
  elapsedMs: number;
  lapNumber: number;
  msToNextLap: number;
}

/** Lap 1 starts at `start`; a new lap/corral call happens every lapWindowMin from there. */
export function computeLapClock(start: Date, now: Date): LapClock {
  const lapWindowMs = RACE.lapWindowMin * 60_000;
  const elapsedMs = Math.max(0, now.getTime() - start.getTime());
  const lapNumber = Math.floor(elapsedMs / lapWindowMs) + 1;
  const msIntoLap = elapsedMs % lapWindowMs;
  return { elapsedMs, lapNumber, msToNextLap: lapWindowMs - msIntoLap };
}

const NAP_INTERVAL_HOURS = 5.5; // midpoint of the "every 5-6 hours" nap-lap rule
const NAP_WINDOW_HALF_HOURS = 0.5;

/** True while elapsed time sits within the nap-lap rule's window (every ~5.5h). */
export function isNapLapWindow(elapsedMs: number): boolean {
  const elapsedHours = elapsedMs / 3_600_000;
  if (elapsedHours < NAP_INTERVAL_HOURS - NAP_WINDOW_HALF_HOURS) return false;
  const nearest = Math.round(elapsedHours / NAP_INTERVAL_HOURS) * NAP_INTERVAL_HOURS;
  return Math.abs(elapsedHours - nearest) <= NAP_WINDOW_HALF_HOURS;
}

export function formatClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
