import { RACE } from '../data/raceConfig';
import { zonedTimeToUtc } from './raceClock';
export type IntakeEvent = { id: string; at: string; text: string; kind?: 'food' | 'drink'; drinkKind?: 'water' | 'varska' | '160' | '320' | 'arctic-greip' | 'arctic-apple' | 'oshee' | 'cido' | 'other'; ml?: number; carbsG?: number };
export type YardRecord = { intake?: IntakeEvent[]; napChoice?: 'try' | 'skip'; finish?: string; finishSource?: 'manual' | 'official-lap'; officialLapMs?: number; preparation?: { food: string; bottle: string; extra: string }; checks: Record<string, boolean>; food: string; drink: string; gear: string; rest: string; note: string };
export const emptyYard = (): YardRecord => ({ checks: {}, food: '', drink: '', gear: '', rest: '', note: '' });
export function yardStart(start: Date, yard: number) { return new Date(start.getTime() + (yard - 1) * RACE.lapWindowMin * 60000); }
export function returnTimeForYard(start: Date, yard: number, time: string): Date | null {
  if (!Number.isInteger(yard) || yard < 1 || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: RACE.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(yardStart(start, yard));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const date = zonedTimeToUtc(`${part('year')}-${part('month')}-${part('day')}`, time.slice(0, 5), RACE.timezone);
  date.setTime(date.getTime() + Number(time.slice(6) || 0) * 1000);
  return date;
}
export function validFinish(start: Date, yard: number, finish: Date, now: Date) {
  return Number.isInteger(yard) && yard >= 1 && Number.isFinite(finish.getTime()) && finish >= yardStart(start, yard) && finish < yardStart(start, yard + 1) && finish <= now;
}
export function raceTime(date: Date) { return date.toLocaleString('en-GB', { timeZone: RACE.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
