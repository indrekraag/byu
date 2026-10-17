import { useEffect, useState } from 'react';
import { cachedReading, fetchReading, type Reading } from '../lib/weather';

// Every 10 minutes; when the service is busy, retry after 1, 2, 4… minutes.
export function useWeather() {
  const [reading, setReading] = useState<Reading | null>(cachedReading);
  useEffect(() => {
    let cancelled = false, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 15_000);
      try { const r = await fetchReading(c.signal); if (!cancelled) { setReading(r); failures = 0; } }
      catch { failures++; }
      finally { clearTimeout(t); if (!cancelled) timer = setTimeout(run, failures ? Math.min(10, 2 ** (failures - 1)) * 60_000 : 10 * 60_000); }
    };
    void run();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  return reading;
}
