import { validFinish, yardStart, type YardRecord } from './raceHQ';

export function lapLog(records: Record<string, YardRecord>, start: Date, now: Date) {
  return Object.entries(records).flatMap(([key, record]) => {
    const yard = Number(key);
    if (!Number.isInteger(yard) || yard < 1 || !record.finish) return [];
    const returned = new Date(record.finish);
    if (!validFinish(start, yard, returned, now)) return [];
    const scheduled = yardStart(start, yard);
    return [{ yard, start: scheduled, returned, lapMs: returned.getTime() - scheduled.getTime(), restMs: yardStart(start, yard + 1).getTime() - returned.getTime(), source: record.finishSource === 'official-lap' ? 'Official' : 'Manual' }];
  }).sort((a, b) => b.yard - a.yard);
}
