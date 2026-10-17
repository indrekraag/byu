import { RATIO_LADDER } from '../data/raceConfig';
import { lapLog } from './lapLog';
import type { OfficialFinish } from './officialResults';
import type { YardRecord } from './raceHQ';
import { raceSummaryRows } from './raceSummary';
import { targetsForYard } from './yardTargets';

export type LapPoint = { yard: number; lapMs: number; restMs: number; source: 'official' | 'manual' };
export type IntakePoint = { yard: number; carbs: number; fluid: number; incomplete: boolean; hasEntries: boolean; current: boolean; cumCarbs: number; cumFluid: number; cumCarbMin: number; cumCarbMax: number; cumFluidMin: number; cumFluidMax: number; carbMin: number; carbMax: number };

const HOUR = 3_600_000;

/** Official laps win; a manual return from the imported crew log fills gaps. */
export function lapSeries(official: OfficialFinish[], imported: Record<string, YardRecord>, start: Date, now: Date): LapPoint[] {
  const byYard = new Map<number, LapPoint>();
  for (const row of lapLog(imported, start, now)) byYard.set(row.yard, { yard: row.yard, lapMs: row.lapMs, restMs: row.restMs, source: row.source === 'Official' ? 'official' : 'manual' });
  for (const f of official) byYard.set(f.yard, { yard: f.yard, lapMs: f.lapMs, restMs: HOUR - f.lapMs, source: 'official' });
  return [...byYard.values()].sort((a, b) => a.yard - b.yard);
}

export function planBand(yard: number) {
  const seg = RATIO_LADDER.find(s => yard >= s.fromLap && (s.toLap === null || yard <= s.toLap)) ?? RATIO_LADDER[RATIO_LADDER.length - 1];
  return { minMin: seg.lapTargetMin || null, maxMin: seg.lapTargetMax };
}

/** Per-yard and running intake totals, oldest yard first, through the current yard. */
export function intakeSeries(records: Record<string, YardRecord>, start: Date, now: Date): IntakePoint[] {
  const rows = raceSummaryRows(records, start, now).slice().reverse();
  let cumCarbs = 0, cumFluid = 0, cumCarbMin = 0, cumCarbMax = 0, cumFluidMin = 0, cumFluidMax = 0;
  return rows.map(row => {
    const t = targetsForYard(row.yard);
    cumCarbs += row.carbs; cumFluid += row.fluid;
    cumCarbMin += t.carbMin; cumCarbMax += t.carbMax; cumFluidMin += t.fluidMin; cumFluidMax += t.fluidMax;
    return { yard: row.yard, carbs: row.carbs, fluid: row.fluid, incomplete: row.incomplete, hasEntries: row.hasEntries, current: row.current, cumCarbs, cumFluid, cumCarbMin, cumCarbMax, cumFluidMin, cumFluidMax, carbMin: t.carbMin, carbMax: t.carbMax };
  });
}
