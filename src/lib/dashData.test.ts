import { describe, expect, it } from 'vitest';
import { intakeSeries, lapSeries, planBand } from './dashData';
import { parseHQExport } from './importHQ';
import { raceStartUtc } from './raceClock';
import { emptyYard, yardStart } from './raceHQ';

const start = raceStartUtc();
const now = new Date(start.getTime() + 3.5 * 3600000); // during yard 4

describe('lapSeries', () => {
  it('prefers the official lap and falls back to an imported manual return', () => {
    const imported = { 1: { ...emptyYard(), finish: new Date(yardStart(start, 1).getTime() + 50 * 60000).toISOString() }, 2: { ...emptyYard(), finish: new Date(yardStart(start, 2).getTime() + 49 * 60000).toISOString() } };
    const official = [{ yard: 1, lapMs: 48 * 60000, at: new Date(start.getTime() + 48 * 60000).toISOString() }];
    const laps = lapSeries(official, imported, start, now);
    expect(laps.map(l => [l.yard, l.lapMs / 60000, l.source])).toEqual([[1, 48, 'official'], [2, 49, 'manual']]);
    expect(laps[0].restMs).toBe(12 * 60000);
  });
});

describe('planBand', () => {
  it('follows the ratio ladder', () => {
    expect(planBand(1)).toEqual({ minMin: 48, maxMin: 50 });
    expect(planBand(25)).toEqual({ minMin: 50, maxMin: 53 });
    expect(planBand(40)).toEqual({ minMin: null, maxMin: 56 });
  });
});

describe('intakeSeries', () => {
  it('accumulates carbs and fluid per yard and flags unknown carbs', () => {
    const at = (yard: number) => new Date(yardStart(start, yard).getTime() + 55 * 60000).toISOString();
    const records = {
      1: { ...emptyYard(), intake: [{ id: 'a', at: at(1), text: '', kind: 'drink' as const, ml: 500, carbsG: 40 }] },
      2: { ...emptyYard(), intake: [{ id: 'b', at: at(2), text: '', kind: 'food' as const }, { id: 'c', at: at(2), text: '', kind: 'drink' as const, ml: 250, carbsG: 20 }] },
    };
    const rows = intakeSeries(records, start, now);
    expect(rows.map(r => r.yard)).toEqual([1, 2, 3, 4]);
    expect(rows[1]).toMatchObject({ carbs: 20, cumCarbs: 60, cumFluid: 750, incomplete: true, cumCarbMin: 100 });
    expect(rows[3].current).toBe(true);
  });
  it('ignores entries logged before the start', () => {
    const records = { 1: { ...emptyYard(), intake: [{ id: 'a', at: new Date(start.getTime() - 60000).toISOString(), text: '', ml: 500, carbsG: 40 }] } };
    expect(intakeSeries(records, start, now)[0].cumCarbs).toBe(0);
  });
});

describe('parseHQExport', () => {
  it('keeps only numbered yards from a Race HQ export', () => {
    const json = JSON.stringify({ packing: [], yards: { 1: { ...emptyYard(), intake: [{ id: 'a', at: '2026-10-17T12:30:00Z', text: 'x' }] }, junk: {} } });
    expect(Object.keys(parseHQExport(json, 'f.json', now).yards)).toEqual(['1']);
  });
  it('rejects the training backup file', () => {
    expect(() => parseHQExport(JSON.stringify({ runningLogs: {} }), 'f.json', now)).toThrow(/Export lists and crew records/);
  });
});
