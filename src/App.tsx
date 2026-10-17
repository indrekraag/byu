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
import { caffeineStatus, sinceLast } from './lib/crewStatus';
import { noteTag } from './data/foods';
import { raceIntakeRecords, DRINKS, type DrinkKind } from './lib/intakeAdvice';

const ago = (min: number | null) => min === null ? '—' : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} ago`;
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
      <section className="page" aria-label="Dashboard"><Dashboard log={log} onLog={() => goTo(1)} /></section>
      <section className="page" aria-label="Log food and drink"><LogPage log={log} onDashboard={() => goTo(0)} /></section>
    </div>
    <nav className="dots" aria-label="Pages">{['Dashboard', 'Log'].map((label, i) => <button key={label} aria-label={label} aria-current={page === i} onClick={() => goTo(i)} />)}</nav>
  </>;
}

function Dashboard({ log, onLog }: { log: RaceLog; onLog: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const { snapshot, error } = useOfficialLaps();
  const [picked, setPicked] = useState<number | null>(null);
  // Fill the screen: give spare height to the lap (60%) and carbs (40%)
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
  const totals = intake[intake.length - 1];
  // Distance covered: completed loops, counting the current one once she is back.
  const since = sinceLast(records, start, now);
  const caf = caffeineStatus(records, start, now);
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
    <header className="stats">
      <div className="stat"><span className="label">{started ? 'Yard' : 'Starts'}</span><span className="yard-line"><strong className="hero">{started ? clock.lapNumber : clockTime(start.toISOString())}</strong>{started && <span className="km">{km.toFixed(1)} km</span>}</span></div>
      <div className="stat"><span className="label">Time</span><strong className="hero">{timeWithSeconds(now)}</strong></div>
      <div className="stat"><span className="label">{started ? 'Next start' : 'Countdown'}</span><strong className={started ? `hero ${countdownClass(clock.msToNextLap)}` : 'hero'}>{formatClock(started ? clock.msToNextLap : start.getTime() - now.getTime())}</strong></div>
    </header>

    {started && <div className="strip">
      <span className={since.carbsMin !== null && since.carbsMin > 60 ? 'chip late' : 'chip'}><b>Carbs</b> {ago(since.carbsMin)}</span>
      <span className={since.drinkMin !== null && since.drinkMin > 60 ? 'chip late' : 'chip'}><b>Drink</b> {ago(since.drinkMin)}</span>
      <span className={caf.state === 'due' ? 'chip late' : caf.state === 'ok' ? 'chip ok' : 'chip'}><b>Caffeine</b> {caf.state === 'before' ? 'from 22:00' : caf.state === 'wait' ? `next ${clockTime(caf.nextFrom.toISOString())}` : caf.state === 'ok' ? `ok now${caf.nextBy ? ` · by ${clockTime(caf.nextBy.toISOString())}` : ''}` : 'due'}{caf.total ? ` · ${caf.total} mg` : ''}</span>
    </div>}

    <section className="panel">
      <h2>Lap time per yard <span className="unit">min · shaded = plan</span></h2>
      <LapChart laps={laps} yards={yards} modern={modern} tags={tags} extra={Math.round(fill * 0.6 * svgScale)} />
    </section>

    <section className="panel">
      <h2>Carbs per yard <span className="unit">g · +? = some carbs unknown</span></h2>
      {hasIntake ? <CarbsPerYard points={intake} yards={yards} modern={modern} extra={Math.round(fill * 0.4 * svgScale)} selected={picked} onSelect={yd => setPicked(p => p === yd ? null : yd)} /> : <p className="empty">No intake data yet. Log in below.</p>}
        {picked !== null && <YardCard yard={picked} records={records} start={start} onClose={() => setPicked(null)} />}
    </section>

    {hasIntake && <section className="pair">
      <div className="panel"><h2>Total carbs <span className="total">{n(totals?.cumCarbs ?? 0)} g</span></h2><Cumulative points={intake} yards={yards} kind="carbs" modern={modern} /></div>
      <div className="panel"><h2>Total fluid <span className="total">{((totals?.cumFluid ?? 0) / 1000).toFixed(1)} L</span></h2><Cumulative points={intake} yards={yards} kind="fluid" modern={modern} /></div>
    </section>}

    <footer className="status">
      <span className={error || stale ? 'warn' : undefined}>Laps: {snapshot ? `official feed ${clockTime(snapshot.checkedAt)}` : 'waiting for feed'}{error ? ` · ${error}` : ''}</span>
      {live && <button className="import" onClick={onLog}>Log food &amp; drink →</button>}
      <button className="import" onClick={refresh}>Refresh</button>
      <button className="import" onClick={hardRefresh}>Hard refresh</button>
      {live
        ? <span className={log.error || log.pending ? 'warn' : undefined}>Intake: live{log.loadedAt ? ` · synced ${clockTime(log.loadedAt.toISOString())}` : ' · connecting'}{lastEntry ? ` · last entry ${clockTime(lastEntry)}` : ''}{log.pending ? ` · ${log.pending} unsent` : ''}{log.error ? ` · ${log.error}` : ''}</span>
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

export default App;
