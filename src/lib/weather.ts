// Outside temperature at Keila (race venue) from Open-Meteo: free, no key,
// browser-friendly. It is sometimes "overloaded", so retry with backoff and
// keep the last good reading.
export const KEILA = { lat: 59.3036, lng: 24.4131 };
const URL_ = `https://api.open-meteo.com/v1/forecast?latitude=${KEILA.lat}&longitude=${KEILA.lng}&current=temperature_2m&timezone=Europe%2FTallinn`;
const KEY = 'byu-dash:weather:v1';
export type Reading = { tempC: number; at: string };

export function cachedReading(): Reading | null {
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); return r && Number.isFinite(r.tempC) ? r : null; } catch { return null; }
}
export async function fetchReading(signal?: AbortSignal): Promise<Reading> {
  const r = await fetch(URL_, { signal, cache: 'no-store' });
  const j = await r.json();
  const t = j?.current?.temperature_2m;
  if (!r.ok || typeof t !== 'number') throw new Error(j?.reason || 'Weather unavailable');
  const reading = { tempC: t, at: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(reading)); } catch { /* memory only */ }
  return reading;
}
