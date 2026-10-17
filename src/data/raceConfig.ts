// Single source of truth for the race identity and pacing model.
// Everything else (reference.ts, runningPlan.ts, the pacing calculator) reads from here.

export const RACE = {
  name: 'Backyard Ultra World Team Championships 2026',
  edition: 'Team Estonia satellite · Heavy Metal Ultra',
  shortName: 'Heavy Metal Ultra',
  date: '2026-10-17',
  startTimeLocal: '15:00',
  timezone: 'Europe/Tallinn',
  lapDistanceKm: 6.7056,
  lapWindowMin: 60,
  // Deliberately no lap-count target here. This format has no finish line and no
  // predicted result belongs in this app — see Section 9 / MENTAL_RULES.
  sourceUrl: 'https://www.heavymetalultra.com/2026-meeskondlik-mm',
};

export interface RatioSegment {
  fromLap: number;
  toLap: number | null; // null = open-ended ("31+")
  runMin: number;
  walkMin: number;
  lapTargetMin: number;
  lapTargetMax: number;
}

// Run/walk ratio ladder. Minutes are proportions within the lap's moving time,
// not necessarily literal 5-minute blocks once splits stop dividing evenly.
export const RATIO_LADDER: RatioSegment[] = [
  { fromLap: 1, toLap: 20, runMin: 5, walkMin: 5, lapTargetMin: 48, lapTargetMax: 50 },
  { fromLap: 21, toLap: 30, runMin: 4, walkMin: 6, lapTargetMin: 50, lapTargetMax: 53 },
  { fromLap: 31, toLap: null, runMin: 3, walkMin: 7, lapTargetMin: 0, lapTargetMax: 56 },
];

export const NAP_LAP_RULE = 'Optional first nap in the pit before midnight, then every 3 yards. A quicker comfortable loop may create time; use the actual return to decide, leave time to reach the start, and set an external alarm. Skip if needed.';

export const CAFFEINE_RULE = 'None before 22:00. Then 50–100 mg every 2–3 hours.';

/**
 * Required run pace (min/km) for a given walk speed, target lap time, and ratio segment.
 * Splits the lap's moving time proportionally to the run:walk minute ratio, has the walk
 * portion cover ground at walkSpeedKmh, and asks what pace the remaining distance in the
 * remaining time requires from running.
 */
export function requiredRunPace(walkSpeedKmh: number, lapTargetMin: number, ratio: RatioSegment): number | null {
  const totalRatioMin = ratio.runMin + ratio.walkMin;
  const walkTimeMin = lapTargetMin * (ratio.walkMin / totalRatioMin);
  const runTimeMin = lapTargetMin * (ratio.runMin / totalRatioMin);
  const walkDistKm = walkSpeedKmh * (walkTimeMin / 60);
  const runDistKm = RACE.lapDistanceKm - walkDistKm;
  if (runDistKm <= 0 || runTimeMin <= 0) return null; // walking alone already covers the lap
  return runTimeMin / runDistKm;
}
