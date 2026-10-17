import { zonedTimeToUtc } from './raceClock';

// Outside temperature at Keila (race venue) from Open-Meteo: free, no key,
// browser-friendly. It is sometimes "overloaded", so retry with backoff and
// keep the last good reading.
export const KEILA = { lat: 59.3036, lng: 24.4131 };
const URL_ = `https://api.open-meteo.com/v1/forecast?latitude=${KEILA.lat}&longitude=${KEILA.lng}&current=temperature_2m&daily=sunrise,sunset&forecast_days=3&timezone=Europe%2FTallinn`;
const KEY = 'byu-dash:weather:v1';
export type Reading = { tempC: number; at: string; sunrise?: string[]; sunset?: string[] };

export function cachedReading(): Reading | null {
  try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); return r && Number.isFinite(r.tempC) ? r : null; } catch { return null; }
}
export async function fetchReading(signal?: AbortSignal): Promise<Reading> {
  const r = await fetch(URL_, { signal, cache: 'no-store' });
  const j = await r.json();
  const t = j?.current?.temperature_2m;
  if (!r.ok || typeof t !== 'number') throw new Error(j?.reason || 'Weather unavailable');
  // Daily times come as Tallinn wall-clock ("2026-10-18T08:07"); store as UTC ISO.
  const toUtc = (list: unknown) => Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string').map(v => zonedTimeToUtc(v.slice(0, 10), v.slice(11, 16), 'Europe/Tallinn').toISOString()) : undefined;
  const reading: Reading = { tempC: t, at: new Date().toISOString(), sunrise: toUtc(j?.daily?.sunrise), sunset: toUtc(j?.daily?.sunset) };
  try { localStorage.setItem(KEY, JSON.stringify(reading)); } catch { /* memory only */ }
  return reading;
}
