import { RACE } from '../data/raceConfig';
import { raceStartUtc } from './raceClock';
import { yardStart, type YardRecord } from './raceHQ';
export type YardTargets = { carbMin: number; carbMax: number; dayFluidMin: number; dayFluidMax: number; nightFluidMin: number; nightFluidMax: number };
// Existing app planning ranges, not a personalised sweat-rate calculation.
export const DEFAULT_TARGETS: YardTargets = { carbMin: 50, carbMax: 60, dayFluidMin: 350, dayFluidMax: 500, nightFluidMin: 250, nightFluidMax: 400 };
export function targetsForYard(yard: number, targets = DEFAULT_TARGETS) {
  const time = yardStart(raceStartUtc(), yard);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: RACE.timezone, hour: '2-digit', hourCycle: 'h23' }).format(time));
  const night = hour >= 19 || hour < 7;
  return { carbMin: targets.carbMin, carbMax: targets.carbMax, fluidMin: night ? targets.nightFluidMin : targets.dayFluidMin, fluidMax: night ? targets.nightFluidMax : targets.dayFluidMax, night };
}
export function yardIntake(record: YardRecord) {
  const entries = record.intake || [];
  return { carbs: entries.reduce((sum, e) => sum + (e.carbsG ?? 0), 0), fluid: entries.reduce((sum, e) => sum + (e.ml ?? 0), 0), incomplete: entries.some(e => e.carbsG === undefined) || !!record.food || !!record.drink };
}
export function validTargets(targets: YardTargets) {
  return Object.values(targets).every(v => Number.isFinite(v) && v >= 0) && targets.carbMin <= targets.carbMax && targets.dayFluidMin <= targets.dayFluidMax && targets.nightFluidMin <= targets.nightFluidMax;
}
