import { useEffect, useRef, useState } from 'react';
import type { RaceLog } from '../App';
import { LAP_BOTTLE_LEFT, lapBottleDrunk } from '../data/foods';
import { RACE } from '../data/raceConfig';
import { drinkEntry } from '../lib/intakeAdvice';
import { eventToRow } from '../lib/raceLog';
import { computeLapClock, formatClock, raceStartUtc } from '../lib/raceClock';
import type { OfficialSnapshot } from '../lib/officialResults';

// Blurred full-screen moments, in the style of the final countdown:
// - "She's back": her return just came in → lap, rest, and one-tap lap bottle.
// - Milestones: shown on the return that reaches them.
// - Sunrise: once, at sunrise.
const RECENT_MS = 10 * 60_000;
const SHOWN_KEY = 'byu-dash:moments-shown:v1';
const MILESTONES: Record<number, { title: string; line: string }> = {
  15: { title: '100 km', line: '15 yards done · 100.6 km' },
  24: { title: 'One full day', line: '24 yards · 160.9 km' },
  28: { title: '2024 finish point', line: 'Every yard from here is a new personal best' },
  30: { title: '200 km', line: '30 yards done · 201.2 km' },
};
const shown = (): string[] => { try { return JSON.parse(localStorage.getItem(SHOWN_KEY) || '[]'); } catch { return []; } };
const markShown = (id: string) => { try { localStorage.setItem(SHOWN_KEY, JSON.stringify([...shown(), id])); } catch { /* fine */ } };
const hhmm = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: RACE.timezone, hour: '2-digit', minute: '2-digit' });

type Back = { yard: number; lapMs: number };

export function Moments({ log, snapshot, sunrise }: { log: RaceLog; snapshot: OfficialSnapshot | null; sunrise: Date }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const [back, setBack] = useState<Back | null>(null);
  const [logged, setLogged] = useState('');
  const [sunUp, setSunUp] = useState(false);

  // Returns from the timing feed and the crew log; a return is "new" only once,
  // and only if it happened in the last 10 minutes (a reload never replays it).
  const returns = new Map<number, { at: number; lapMs: number }>();
  for (const f of snapshot?.finishes ?? []) returns.set(f.yard, { at: Date.parse(f.at), lapMs: f.lapMs });
  for (const r of log.returns) if (!returns.has(r.yard)) returns.set(r.yard, { at: Date.parse(r.finish), lapMs: r.lap_ms ?? Date.parse(r.finish) - (raceStartUtc().getTime() + (r.yard - 1) * 3600_000) });
  const key = [...returns.keys()].sort((a, b) => a - b).join(',');
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seen.current === null) seen.current = new Set(shown());
    for (const [yard, r] of returns) {
      const id = `back:${yard}`;
      if (seen.current.has(id)) continue;
      seen.current.add(id); markShown(id);
      if (Date.now() - r.at < RECENT_MS) { setBack({ yard, lapMs: r.lapMs }); setLogged(''); }
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back overlay closes itself after 45 s (longer than a quick glance, shorter than the pit).
  useEffect(() => { if (!back) return; const id = setTimeout(() => setBack(null), 45_000); return () => clearTimeout(id); }, [back]);

  // Sunrise, once per morning.
  useEffect(() => {
    const id = `sunrise:${sunrise.toISOString().slice(0, 10)}`;
    if (now >= sunrise && now.getTime() - sunrise.getTime() < 15 * 60_000 && !shown().includes(id) && now > raceStartUtc()) { markShown(id); setSunUp(true); }
  }, [now, sunrise]);
  useEffect(() => { if (!sunUp) return; const id = setTimeout(() => setSunUp(false), 25_000); return () => clearTimeout(id); }, [sunUp]);

  if (back) {
    const clock = computeLapClock(raceStartUtc(), now);
    const milestone = MILESTONES[back.yard];
    const loggedIn = !!log.session;
    const bottle = (label: string, left: number) => {
      const ml = lapBottleDrunk(left);
      const e = drinkEntry('water', ml, new Date().toISOString(), crypto.randomUUID());
      log.enqueue({ type: 'intake', row: eventToRow(back.yard, { ...e, text: `Lap bottle back · ${label} (${ml} ml water)` }, 'dashboard') });
      setLogged(`Lap bottle logged: ${ml} ml water · yard ${back.yard}`);
      setTimeout(() => setBack(null), 2500);
    };
    return <div className="final-countdown moment" role="dialog" aria-label={`Yard ${back.yard}: she is back`} onClick={e => { if (e.target === e.currentTarget) setBack(null); }}>
      <div className="final-card moment-card">
        {milestone && <div className="milestone"><strong>{milestone.title}</strong><span>{milestone.line}</span></div>}
        <span className="final-label">Yard {back.yard} · she is back</span>
        <div className="moment-figures">
          <div><span>Lap</span><strong>{formatClock(back.lapMs)}</strong></div>
          <div><span>Rest left</span><strong>{formatClock(clock.msToNextLap)}</strong></div>
        </div>
        {loggedIn && !logged && <>
          <span className="moment-ask">Lap bottle back (250 ml water) · what is left?</span>
          <div className="moment-buttons">{LAP_BOTTLE_LEFT.map(o => <button key={o.label} onClick={() => bottle(o.label, o.left)}>{o.label}<small>{lapBottleDrunk(o.left)} ml</small></button>)}</div>
        </>}
        {logged && <span className="moment-done">{logged}</span>}
        <button className="moment-close" onClick={() => setBack(null)}>Close</button>
      </div>
    </div>;
  }
  if (sunUp) {
    return <div className="final-countdown moment" role="dialog" aria-label="Sunrise" onClick={() => setSunUp(false)}>
      <div className="final-card moment-card">
        <span className="final-label">Sunrise · {hhmm(sunrise)}</span>
        <strong className="moment-title">A new day</strong>
        <span className="final-hint">Tap to close</span>
      </div>
    </div>;
  }
  return null;
}
