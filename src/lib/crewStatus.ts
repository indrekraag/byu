import { RACE } from '../data/raceConfig';
import { caffeineOf } from '../data/foods';
import { zonedTimeToUtc } from './raceClock';
import type { YardRecord } from './raceHQ';

// Since-last and caffeine status, from the whole race log.
// Caffeine rule (her plan, CAFFEINE_RULE in raceConfig): none before 22:00
// race night, then 50–100 mg every 2–3 h.
export const CAFFEINE_FROM = '22:00';
export const CAFFEINE_GAP_MIN_H = 2;
export const CAFFEINE_GAP_MAX_H = 3;

const events = (records: Record<string, YardRecord>, start: Date, now: Date) =>
  Object.values(records).flatMap(r => r.intake ?? []).filter(e => Date.parse(e.at) >= start.getTime() && Date.parse(e.at) <= now.getTime());

export function sinceLast(records: Record<string, YardRecord>, start: Date, now: Date) {
  const all = events(records, start, now);
  const latest = (pred: (e: (typeof all)[number]) => boolean) => { const t = all.filter(pred).map(e => Date.parse(e.at)); return t.length ? Math.max(...t) : null; };
  const carbs = latest(e => (e.carbsG ?? 0) > 0 || (e.kind === 'food' && e.carbsG === undefined));
  const drink = latest(e => e.kind === 'drink');
  return { carbsMin: carbs === null ? null : Math.floor((now.getTime() - carbs) / 60000), drinkMin: drink === null ? null : Math.floor((now.getTime() - drink) / 60000) };
}

export function caffeineStatus(records: Record<string, YardRecord>, start: Date, now: Date) {
  const doses = events(records, start, now).map(e => ({ at: Date.parse(e.at), mg: e.kind === 'food' ? caffeineOf(e.text) : 0 })).filter(d => d.mg > 0).sort((a, b) => a.at - b.at);
  const total = doses.reduce((s, d) => s + d.mg, 0);
  const from = zonedTimeToUtc(RACE.date, CAFFEINE_FROM, RACE.timezone).getTime();
  const last = doses[doses.length - 1];
  const nextFrom = Math.max(from, last ? last.at + CAFFEINE_GAP_MIN_H * 3600000 : from);
  const nextBy = last ? last.at + CAFFEINE_GAP_MAX_H * 3600000 : null;
  const state: 'before' | 'wait' | 'ok' | 'due' = now.getTime() < from ? 'before' : now.getTime() < nextFrom ? 'wait' : nextBy !== null && now.getTime() > nextBy ? 'due' : 'ok';
  return { total, last, nextFrom: new Date(nextFrom), nextBy: nextBy === null ? null : new Date(nextBy), state };
}
