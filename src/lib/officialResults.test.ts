import { describe, expect, it, vi } from 'vitest';
import { applyOfficialFinish, fetchOfficialResults, parseLapDuration, parseOfficialLaps } from './officialResults';
import { emptyYard } from './raceHQ';
const now = new Date('2026-10-18T13:00:00Z');
const fields = ['BIB', 'ID', 'DisplayName', 'Lap1', 'Lap10', 'Lap25'];
const table = (...times: unknown[]) => ({ DataFields: fields, data: [['15', '15', 'Laura Komp', ...times], [15]] });
describe('official FINISH lap times for bib 15', () => {
  it('adds reported per-lap durations to each hourly start, not cumulatively', () => {
    expect(parseOfficialLaps(table('48:12.5', '00:51:03', '52:00'), now).finishes).toEqual([
      { yard: 1, at: '2026-10-17T12:48:12.500Z', lapMs: 2892500 },
      { yard: 10, at: '2026-10-17T21:51:03.000Z', lapMs: 3063000 },
      { yard: 25, at: '2026-10-18T12:52:00.000Z', lapMs: 3120000 },
    ]);
  });
  it('handles empty pre-race tables without inventing returns', () => {
    expect(parseOfficialLaps({ DataFields: fields, data: [] }, now)).toEqual({ finishes: [], unrecognized: 0 });
    expect(parseOfficialLaps(table('', '', ''), now).finishes).toEqual([]);
  });
  it('rejects future returns, clock timestamps, over-hour times and zero or ambiguous values', () => {
    expect(parseOfficialLaps(table('48:00', 'DNS', '52:00'), new Date('2026-10-17T12:47:00Z'))).toEqual({ finishes: [], unrecognized: 3 });
    for (const value of ['15:48:00', '1:00:00', '60:00', '00:00', 'DNF', '48.5', 2880]) expect(parseLapDuration(value)).toBeNull();
    expect(parseLapDuration('00:48:12,25')).toBe(2892250);
    expect(parseOfficialLaps({ DataFields: ['BIB', 'DisplayName', 'TIME2', 'Finish1'], data: [['15', 'Laura Komp', '48:00', '15:48:00']] }, now).finishes).toEqual([]);
  });
  it('matches exact bib and name, ignoring footer IDs and other runners', () => {
    const data = table('48:12', '', '');
    data.data.unshift(['115', '115', 'Other Runner', '44:00', '', '']);
    expect(parseOfficialLaps(data, now).finishes).toHaveLength(1);
    expect(() => parseOfficialLaps({ ...data, data: [['15', '15', 'Someone Else', '', '', '']] }, now)).toThrow('does not match');
    expect(() => parseOfficialLaps({ ...data, data: [data.data[1], data.data[1]] }, now)).toThrow('Multiple');
  });
  it('preserves manual returns and crew data, storing calculation provenance on acceptance', () => {
    const records = { 1: { ...emptyYard(), note: 'Check foot', checks: { ready: true } }, 2: { ...emptyYard(), finish: '2026-10-17T13:48:00Z' } };
    const accepted = applyOfficialFinish(records, { yard: 1, at: '2026-10-17T12:49:00Z', lapMs: 2940000 }, now);
    expect(accepted[1]).toMatchObject({ finish: '2026-10-17T12:49:00Z', finishSource: 'official-lap', officialLapMs: 2940000, note: 'Check foot', checks: { ready: true } });
    expect(records[1].finish).toBeUndefined();
    expect(applyOfficialFinish(records, { yard: 2, at: '2026-10-17T13:49:00Z', lapMs: 2940000 }, now)).toBe(records);
    expect(applyOfficialFinish(records, { yard: 1, at: '2026-10-17T12:49:00Z', lapMs: 1000 }, now)).toBe(records);
  });
  it('reads only the FINISH list and requires no Measurements feed', async () => {
    const mock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ key: 'public-key', server: 'my4.raceresult.com' }) }).mockResolvedValueOnce({ ok: true, json: async () => table('', '', '') });
    vi.stubGlobal('fetch', mock);
    try {
      expect((await fetchOfficialResults(new AbortController().signal)).finishes).toEqual([]);
      expect(mock).toHaveBeenCalledTimes(2);
      expect(new URL(mock.mock.calls[1][0]).searchParams.get('listname')).toBe('Result Lists|FINISH');
    } finally { vi.unstubAllGlobals(); }
  });
});
