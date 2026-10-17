import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CarbsPerYard, Cumulative, LapChart } from './components/Charts';
import { useOfficialLaps } from './hooks/useOfficialLaps';
import { intakeSeries, lapSeries } from './lib/dashData';
import { loadImported, parseHQExport, saveImported, type ImportedIntake } from './lib/importHQ';
import { computeLapClock, formatClock, raceStartUtc } from './lib/raceClock';
import { RACE } from './data/raceConfig';
import { useRaceLog } from './hooks/useRaceLog';
import { Login } from './components/Login';
import { LogPage } from './pages/LogPage';
import { applyLook } from './lib/look';
import { countdownClass } from './lib/countdown';
import { hardRefresh, refresh } from './lib/refresh';
import { useWeather } from './hooks/useWeather';
import { nextSunEvents } from './lib/sun';
import { KEILA } from './lib/weather';
import { noteTag } from './data/foods';
import { raceIntakeRecords, DRINKS, type DrinkKind } from './lib/intakeAdvice';

const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: RACE.timezone, hour: '2-digit', minute: '2-digit' });
const n = (v: number) => Math.round(v).toLocaleString('en-GB');

const timeWithSeconds = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: RACE.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
export type RaceLog = ReturnType<typeof useRaceLog>;

// Two full-screen pages side by side: swipe left for logging, right for the
// charts. Native scroll-snap, so the swipe feels like any iOS pager. One sync
// connection is shared so both pages never send the same outbox twice.
function App() {
  const log = useRaceLog();
  useEffect(() => applyLook(), []);
  const pager = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(() => location.hash === '#log' ? 1 : 0);
  const goTo = (i: number) => pager.current?.scrollTo({ left: i * pager.current.clientWidth, behavior: 'smooth' });
  useEffect(() => {
    const el = pager.current; if (!el) return;
    if (page === 1) el.scrollLeft = el.clientWidth;
    let t: ReturnType<typeof setTimeout>;
    const onScroll = () => { clearTimeout(t); t = setTimeout(() => {
      const i = Math.round(el.scrollLeft / el.clientWidth); setPage(i);
      history.replaceState(null, '', i === 1 ? '#log' : location.pathname + location.search);
    }, 80); };
    const onHash = () => goTo(location.hash === '#log' ? 1 : 0);
    const onResize = () => { el.scrollLeft = Math.round(el.scrollLeft / el.clientWidth) * el.clientWidth; };
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', onHash);
    window.addEventListener('resize', onResize);
    return () => { el.removeEventListener('scroll', onScroll); window.removeEventListener('hashchange', onHash); window.removeEventListener('resize', onResize); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <div className="top-cap" aria-hidden="true" />
    <div className="pager" ref={pager}>
      <section className="page" aria-label="Dashboard"><Dashboard log={log} active={page === 0} onLog={() => goTo(1)} /></section>
      <section className="page" aria-label="Log food and drink"><LogPage log={log} onDashboard={() => goTo(0)} /></section>
    </div>
    <nav className="dots" aria-label="Pages">{['Dashboard', 'Log'].map((label, i) => <button key={label} aria-label={label} aria-current={page === i} onClick={() => goTo(i)} />)}</nav>
  </>;
}

function Dashboard({ log, active, onLog }: { log: RaceLog; active: boolean; onLog: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const { snapshot, error } = useOfficialLaps();
  const weather = useWeather();
  // Published times (Open-Meteo) when we have them; on-device calculation otherwise.
  const calc = nextSunEvents(now, KEILA.lat, KEILA.lng);
  const nextOf = (list?: string[]) => list?.map(v => new Date(v)).find(d => d > now);
  const sun = { sunrise: nextOf(weather?.sunrise) ?? calc.sunrise, sunset: nextOf(weather?.sunset) ?? calc.sunset };
  const sunFirst = sun.sunrise < sun.sunset ? [['Sunrise', sun.sunrise], ['Sunset', sun.sunset]] as const : [['Sunset', sun.sunset], ['Sunrise', sun.sunrise]] as const;
  const weatherStale = weather ? now.getTime() - Date.parse(weather.at) > 45 * 60000 : true;
  const [picked, setPicked] = useState<number | null>(null);
  // Fill the screen: give spare height to the lap (30%) and carbs (70%)
  // charts instead of leaving an empty band at the bottom.
  const dashRef = useRef<HTMLDivElement>(null);
  const [fill, setFill] = useState(0); // spare height in CSS px (negative = shrink to fit)
  const svgScale = 720 / Math.max(300, Math.min(1024, window.innerWidth) - 60); // CSS px → chart units (stable width)
  useEffect(() => { if (picked === null) return; const id = setTimeout(() => setPicked(null), 12000); return () => clearTimeout(id); }, [picked]);
  const modern = true;
  const live = !!log.session;
  const [imported, setImported] = useState<ImportedIntake | null>(loadImported);
  const [importMessage, setImportMessage] = useState('');

  const start = raceStartUtc();
  const started = now >= start;
  const clock = computeLapClock(start, now);
  const yards = Math.max(12, clock.lapNumber);
  // Logged in: the shared crew log. Otherwise: the last imported export file.
  const records = live ? log.records : imported?.yards ?? {};
  const hasIntake = live || !!imported;
  // Recompute the charts once a minute, not every clock tick.
  const minute = Math.floor(now.getTime() / 60000);
  const laps = useMemo(() => lapSeries(snapshot?.finishes ?? [], records, start, new Date(minute * 60000 + 59999)), [snapshot, records, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  const intake = useMemo(() => intakeSeries(records, start, new Date(minute * 60000 + 59999)), [records, minute]); // eslint-disable-line react-hooks/exhaustive-deps
  // Measured only when the screen size or the data changes, never on every
  // clock tick, and ignoring changes under 4 px: a page scrollbar appearing
  // must not feed back into the chart size (that loop crashed the page).
  const fillKey = `${laps.length}|${intake.length}|${hasIntake}|${live}|${Object.keys(records).length}|${yards}`;
  useLayoutEffect(() => {
    const dash = dashRef.current, page = dash?.parentElement;
    if (!dash || !page) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const style = getComputedStyle(page);
        const room = page.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        setFill(f => { const next = Math.max(-90, Math.min(600, Math.round(f + room - dash.offsetHeight - 2))); return Math.abs(next - f) < 4 ? f : next; });
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', measure); };
  }, [fillKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Running totals advance a yard only once she is back from it (return
  // logged) and something from that yard is logged; the line stops there.
  const doneYards = new Set(laps.map(l => l.yard));
  const lastClosed = Math.max(0, ...intake.filter(p => doneYards.has(p.yard) && p.hasEntries).map(p => p.yard));
  const closed = intake.filter(p => p.yard <= lastClosed);
  const totals = closed[closed.length - 1];
  // Distance covered: completed loops, counting the current one once she is back.
  const tags: Record<number, string[]> = Object.fromEntries(Object.entries(records).filter(([, r]) => r.notes?.length).map(([yd, r]) => [Number(yd), [...new Set(r.notes!.map(n => noteTag(n.text)))]]));
  const loopsDone = clock.lapNumber - 1 + (laps.some(l => l.yard === clock.lapNumber) ? 1 : 0);
  const km = Math.max(0, loopsDone) * RACE.lapDistanceKm;
  const lastEntry = Object.values(records).flatMap(r => r.intake ?? []).map(e => e.at).sort().pop();
  // Keep a permanent copy of each official lap in the crew log.
  useEffect(() => {
    if (!live || !snapshot) return;
    // Compare instants, not strings: the database returns +00:00, the feed .000Z.
    const missing = snapshot.finishes.filter(f => !log.returns.some(r => r.yard === f.yard && r.source === 'official' && Date.parse(r.finish) === Date.parse(f.at)));
    if (missing.length && log.loadedAt) log.enqueue(...missing.map(f => ({ type: 'return' as const, row: { yard: f.yard, finish: f.at, lap_ms: f.lapMs, source: 'official' as const } })));
  }, [live, snapshot, log.returns, log.loadedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const stale = snapshot ? now.getTime() - Date.parse(snapshot.checkedAt) > 5 * 60000 : true;

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { const data = parseHQExport(await file.text(), file.name, new Date()); saveImported(data); setImported(data); setImportMessage(`Imported ${Object.keys(data.yards).length} yards.`); }
    catch (err) { setImportMessage(err instanceof Error ? err.message : 'Import failed.'); }
  }

  return <div className="dash" ref={dashRef}>
    {started && active && <FinalCountdown msToNext={clock.msToNextLap} yard={clock.lapNumber + 1} />}
    <header className="stats">
      <div className="stat"><span className="label">{started ? 'Yard' : 'Starts'}</span><span className="yard-line"><strong className="hero">{started ? clock.lapNumber : clockTime(start.toISOString())}</strong>{started && <span className="km">{km.toFixed(1)} km</span>}</span></div>
      <div className="stat"><span className="label">Time{weather ? ' · Keila' : ''}</span>
        <span className="time-line">
          <strong className="hero">{timeWithSeconds(now)}</strong>
          {weather && <strong className={weatherStale ? 'hero temp stale' : 'hero temp'}>{Math.round(weather.tempC)}°</strong>}
          <span className="sun">{sunFirst.map(([name, at]) => <span key={name} title={name}><SunIcon rise={name === 'Sunrise'} />{clockTime(at.toISOString())}</span>)}</span>
        </span>
      </div>
      <div className="stat"><span className="label">{started ? 'Next start' : 'Countdown'}</span><strong className={started ? `hero ${countdownClass(clock.msToNextLap)}` : 'hero'}>{formatClock(started ? clock.msToNextLap : start.getTime() - now.getTime())}</strong></div>
    </header>


    <section className="panel">
      <h2>Lap time per yard <span className="unit">min · shaded = plan</span></h2>
      <LapChart laps={laps} yards={yards} modern={modern} tags={tags} extra={Math.round(fill * 0.3 * svgScale)} />
    </section>

    <section className="panel">
      <h2>Carbs per yard <span className="unit">g · +? = some carbs unknown</span></h2>
      {hasIntake ? <CarbsPerYard points={intake} yards={yards} modern={modern} extra={Math.round(fill * 0.7 * svgScale)} selected={picked} onSelect={yd => setPicked(p => p === yd ? null : yd)} /> : <p className="empty">No intake data yet. Log in below.</p>}
        {picked !== null && <YardCard yard={picked} records={records} start={start} onClose={() => setPicked(null)} />}
    </section>

    {hasIntake && <section className="pair">
      <div className="panel"><h2>Total carbs <span className="total">{n(totals?.cumCarbs ?? 0)} g</span></h2><Cumulative points={closed} plan={intake} yards={yards} kind="carbs" modern={modern} /></div>
      <div className="panel"><h2>Total fluid <span className="total">{((totals?.cumFluid ?? 0) / 1000).toFixed(2)} L</span></h2><Cumulative points={closed} plan={intake} yards={yards} kind="fluid" modern={modern} /></div>
    </section>}

    <footer className="status">
      <span className={error || stale ? 'warn' : undefined}>Laps: {snapshot ? `official feed ${clockTime(snapshot.checkedAt)}` : 'waiting for feed'}{error ? ` · ${error}` : ''}</span>
      {live && <button className="import" onClick={onLog}>Log food &amp; drink →</button>}
      <button className="import" onClick={refresh}>Refresh</button>
      <button className="import" onClick={hardRefresh}>Hard refresh</button>
      {live
        ? <span className={log.error || log.pending ? 'warn' : undefined}>Intake: {log.liveLink ? 'live' : 'checking every 15 s'}{log.loadedAt ? ` · synced ${timeWithSeconds(log.loadedAt)}` : ' · connecting'}{lastEntry ? ` · last entry ${clockTime(lastEntry)}` : ''}{log.pending ? ` · ${log.pending} unsent` : ''}{log.error ? ` · ${log.error}` : ''}</span>
        : <>
          <span>Intake: {imported ? `imported ${clockTime(imported.importedAt)}${lastEntry ? ` · last entry ${clockTime(lastEntry)}` : ''}` : 'none'}{importMessage ? ` · ${importMessage}` : ''}</span>
          <label className="import">Import crew export<input type="file" accept=".json,application/json" onChange={onFile} /></label>
          {log.authReady && <Login compact />}
        </>}
    </footer>
  </div>;
}

/** Tap a carbs bar: what was eaten and drunk in that yard, with amounts. */
function YardCard({ yard, records, start, onClose }: { yard: number; records: Record<string, import('./lib/raceHQ').YardRecord>; start: Date; onClose: () => void }) {
  const events = raceIntakeRecords(records, start, new Date())[yard]?.intake ?? [];
  const carbs = events.reduce((s, e) => s + (e.carbsG ?? 0), 0);
  const ml = events.reduce((s, e) => s + (e.ml ?? 0), 0);
  const unknown = events.some(e => e.carbsG === undefined);
  return <div className="yard-card" role="dialog" aria-label={`Yard ${yard} intake`} onClick={onClose}>
    <div className="yard-card-head"><strong>Yard {yard}</strong><span>{Math.round(carbs * 10) / 10} g{unknown ? ' + ?' : ''} · {ml} ml</span></div>
    {!events.length && <p className="muted">Nothing logged.</p>}
    {!!records[yard]?.notes?.length && <p className="yard-card-notes">{records[yard].notes!.map(n => n.text).join(' · ')}</p>}
    <ul>{events.map(e => <li key={e.id}>
      <span className="when">{clockTime(e.at)}</span>
      <span className="what">{e.kind === 'drink' ? `${e.ml} ml ${DRINKS[(e.drinkKind || 'other') as DrinkKind]?.label.split(' (')[0] ?? 'drink'}` : e.text.replace('Ate prepared food: ', '')}</span>
      <span className="carbs">{e.carbsG === undefined ? '?' : `${Math.round(e.carbsG * 10) / 10} g`}</span>
    </li>)}</ul>
  </div>;
}

/** Last 3 minutes before a start: big red countdown over a blurred screen.
 *  Tap to hide it for this start. */
function FinalCountdown({ msToNext, yard }: { msToNext: number; yard: number }) {
  const [hiddenFor, setHiddenFor] = useState<number | null>(null);
  const show = msToNext <= 3 * 60_000 && hiddenFor !== yard;
  if (!show) return null;
  return <div className="final-countdown" role="timer" aria-live="off" onClick={() => setHiddenFor(yard)}>
    <div className="final-card">
      <span className="final-label">Yard {yard} starts in</span>
      <strong className="final-number">{formatClock(msToNext)}</strong>
      <span className="final-hint">Tap to hide</span>
    </div>
  </div>;
}

/** Sun on the horizon with an arrow: up = sunrise, down = sunset. */
function SunIcon({ rise }: { rise: boolean }) {
  return <svg className="sun-icon" viewBox="0 0 24 24" aria-label={rise ? 'Sunrise' : 'Sunset'} role="img">
    <path d="M6 17a6 6 0 0 1 12 0" />
    <path d="M2 20h20M4.5 12.5l1.4 1.4M19.5 12.5l-1.4 1.4M12 7.5v1" />
    <path d={rise ? 'M12 1.5v5M9.5 4 12 1.5 14.5 4' : 'M12 1.5v5M9.5 4 12 6.5 14.5 4'} />
  </svg>;
}

export default App;
