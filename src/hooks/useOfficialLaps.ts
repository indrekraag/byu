import { useEffect, useState } from 'react';
import { fetchOfficialResults, type OfficialSnapshot } from '../lib/officialResults';

// Laps change at most once an hour and Laura's own app polls the same
// undocumented feed, so one check a minute is plenty for a wall display.
const POLL_MS = 60_000;
const MAX_BACKOFF_MS = 10 * 60_000;
const CACHE_KEY = 'byu-dash:official-snapshot:v1';

function cached(): OfficialSnapshot | null {
  try { const raw = localStorage.getItem(CACHE_KEY); return raw ? JSON.parse(raw) as OfficialSnapshot : null; } catch { return null; }
}

export function useOfficialLaps() {
  const [snapshot, setSnapshot] = useState<OfficialSnapshot | null>(cached);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let active: AbortController | null = null;
    async function check() {
      if (cancelled) return;
      if (document.hidden) { timer = setTimeout(check, POLL_MS); return; }
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
        if (!cancelled) timer = setTimeout(check, Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failures));
      }
    }
    void check();
    const resume = () => { if (!document.hidden) { clearTimeout(timer); void check(); } };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => { cancelled = true; active?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  }, []);
  return { snapshot, error };
}
