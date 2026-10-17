import { useEffect, useState } from 'react';
import { fetchOfficialResults, type OfficialSnapshot } from '../lib/officialResults';
import { computeLapClock, raceStartUtc } from '../lib/raceClock';

// Returns only happen late in each yard: check every 15 s from minute 42 until
// the next start, every 2 minutes otherwise (raceresult asks for >= 10 s).
const FAST_MS = 15_000;
const SLOW_MS = 2 * 60_000;
const FAST_FROM_MIN = 42;
export function pollDelay(now = new Date()): number {
  const clock = computeLapClock(raceStartUtc(), now);
  if (now < raceStartUtc()) return SLOW_MS;
  const intoYardMin = 60 - clock.msToNextLap / 60_000;
  if (intoYardMin >= FAST_FROM_MIN) return FAST_MS;
  // Sleep until the fast window opens, but never longer than the slow interval.
  return Math.max(FAST_MS, Math.min(SLOW_MS, (FAST_FROM_MIN - intoYardMin) * 60_000));
}
const MAX_BACKOFF_MS = 10 * 60_000;
const CACHE_KEY = 'byu-dash:official-snapshot:v1';

function cached(): OfficialSnapshot | null {
  try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) as OfficialSnapshot : null; } catch { return null; }
}

export function useOfficialLaps(stopped = false) {
  const [snapshot, setSnapshot] = useState<OfficialSnapshot | null>(cached);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let active: AbortController | null = null;
    async function check() {
      if (cancelled || stopped) return;
      if (document.hidden) { timer = setTimeout(check, SLOW_MS); return; }
      active = new AbortController();
      const timeout = setTimeout(() => active?.abort(), 15_000);
      try {
        const result = await fetchOfficialResults(active.signal);
        if (cancelled) return;
        failures = 0;
        setSnapshot(result); setError('');
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch { /* Memory copy is enough. */ }
      } catch (e) {
        if (cancelled) return;
        failures++;
        setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'Timing feed did not answer.');
      } finally {
        clearTimeout(timeout);
        if (!cancelled) timer = setTimeout(check, failures ? Math.min(MAX_BACKOFF_MS, SLOW_MS * 2 ** (failures - 1)) : pollDelay());
      }
    }
    void check();
    const resume = () => { if (!document.hidden) { clearTimeout(timer); void check(); } };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => { cancelled = true; active?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  }, [stopped]);
  return { snapshot, error };
}
