import { raceIntakeRecords } from './intakeAdvice';
import { lapLog } from './lapLog';
import { emptyYard, type YardRecord } from './raceHQ';
import { yardIntake } from './yardTargets';

export function raceSummaryRows(records: Record<string, YardRecord>, start: Date, now: Date) {
  if (now < start) return [];
  const current = Math.floor((now.getTime() - start.getTime()) / 3600000) + 1;
  const counted = raceIntakeRecords(records, start, now);
  const laps = new Map(lapLog(records, start, now).map(row => [row.yard, row]));
  return Array.from({ length: current }, (_, i) => {
    const yard = current - i;
    const record = counted[yard] || emptyYard();
    const intake = record.intake || [];
    return { yard, current: yard === current, ...yardIntake(record), hasEntries: intake.length > 0 || !!record.food || !!record.drink, lap: laps.get(yard), food: [...intake.filter(event => event.kind === 'food').map(event => event.text.replace('Ate prepared food: ', '')), ...(record.food ? [record.food] : [])], drinks: [...intake.filter(event => event.kind === 'drink').map(event => event.text), ...(record.drink ? [record.drink] : [])], note: record.note };
  });
}
