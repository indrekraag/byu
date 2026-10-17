import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CarbsPerYard, Cumulative, LapChart } from './components/Charts';
import { useOfficialLaps } from './hooks/useOfficialLaps';
import { intakeSeries, lapSeries } from './lib/dashData';
import { loadImported, parseHQExport, saveImported, type ImportedIntake } from './lib/importHQ';
import { computeLapClock, formatClock, raceStartUtc } from './lib/raceClock';
import { RACE } from './data/raceConfig';
import { useRaceLog } from './hooks/useRaceLog';
import { Login } from './components/Login';
import { LogPage } from './pages/LogPage';
import { Segments } from './components/Segments';
import { DotMatrix } from './components/DotMatrix';
import { planBand } from './lib/dashData';
import { applyLook, initialLook, type Look } from './lib/look';

const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: RACE.timezone, hour: '2-digit', minute: '2-digit' });
const n = (v: number) => Math.round(v).toLocaleString('en-GB');

const timeWithSeconds = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: RACE.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
export type RaceLog = ReturnType<typeof useRaceLog>;
// Round a running total up to a clean axis top.
const cumHi = (values: number[], unit: number) => { const m = Math.max(unit, ...values); const stepv = m > 10 * unit ? 5 * unit : m > 4 * unit ? 2 * unit : unit; return Math.ceil(m / stepv) * stepv; };
function Figure({ look, text }: { look: Look; text: string }) {
  return look === 'board' ? <Segments className="hero-seg" text={text} /> : <strong className="hero">{text}</strong>;
}

// Two full-screen pages side by side: swipe left for logging, right for the
// charts. Native scroll-snap, so the swipe feels like any iOS pager. One sync
// connection is shared so both pages never send the same outbox twice.
function App() {
  const log = useRaceLog();
  const [look, setLook] = useState<Look>(initialLook);
  useEffect(() => applyLook(look), [look]);
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
      <section className="page" aria-label="Dashboard"><Dashboard log={log} look={look} onLog={() => goTo(1)} /></section>
      <section className="page" aria-label="Log food and drink"><LogPage log={log} look={look} onLook={setLook} onDashboard={() => goTo(0)} /></section>
    </div>
    <nav className="dots" aria-label="Pages">{['Dashboard', 'Log'].map((label, i) => <button key={label} aria-label={label} aria-current={page === i} onClick={() => goTo(i)} />)}</nav>
  </>;
}

function Dashboard({ log, look, onLog }: { log: RaceLog; look: Look; onLog: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const { snapshot, error } = useOfficialLaps();
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
  const totals = intake[intake.length - 1];
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

  return <div className="dash">
    <header className="stats">
      <div className="stat"><span className="label">{started ? 'Yard' : 'Starts'}</span><Figure look={look} text={started ? String(clock.lapNumber) : clockTime(start.toISOString())} /></div>
      <div className="stat"><span className="label">Time</span><Figure look={look} text={timeWithSeconds(now)} /></div>
      <div className="stat"><span className="label">{started ? 'Next start' : 'Countdown'}</span><Figure look={look} text={formatClock(started ? clock.msToNextLap : start.getTime() - now.getTime())} /></div>
    </header>

    {look === 'board' ? <>
      <section className="panel">
        <h2>Lap · min</h2>
        <DotMatrix label="Lap time per yard against the plan band" points={[...laps.map(p => ({ yard: p.yard, value: p.lapMs / 60000 })), { yard: clock.lapNumber, value: null, current: true }]} yards={yards} lo={40} hi={60} rows={20} band={yd => { const b = planBand(yd); return [b.minMin ?? 40, b.maxMin]; }} hotAbove={yd => planBand(yd).maxMin} ticks={[40, 45, 50, 55, 60]} fmt={v => String(v)} last={laps.length ? formatClock(laps[laps.length - 1].lapMs) : undefined} />
      </section>
      <section className="panel">
        <h2>Carbs · g per yard</h2>
        {hasIntake ? <DotMatrix label="Carbs per yard against the 50 to 60 gram plan" h={190} points={intake.map(p => ({ yard: p.yard, value: p.hasEntries || p.current ? p.carbs : null, current: p.current, unknown: p.incomplete }))} yards={yards} lo={0} hi={100} rows={20} band={() => [50, 60]} ticks={[0, 25, 50, 75, 100]} fmt={v => String(v)} last={(() => { const done = [...intake].reverse().find(p => !p.current && p.hasEntries); return done ? `${n(done.carbs)} g` : undefined; })()} /> : <p className="empty">No intake yet. Log in below.</p>}
      </section>
      {hasIntake && <section className="pair">
        <div className="panel"><h2>Carbs total <span className="total">{n(totals?.cumCarbs ?? 0)} g</span></h2><DotMatrix label="Cumulative carbs against plan" w={360} h={186} points={intake.map(p => ({ yard: p.yard, value: p.cumCarbs, current: p.current }))} yards={yards} lo={0} hi={cumHi(intake.map(p => Math.max(p.cumCarbs, p.cumCarbMax)), 100)} rows={16} band={yd => { const p = intake.find(q => q.yard === yd); return p ? [p.cumCarbMin, p.cumCarbMax] : null; }} ticks={[0, cumHi(intake.map(p => Math.max(p.cumCarbs, p.cumCarbMax)), 100)]} fmt={v => String(v)} /></div>
        <div className="panel"><h2>Fluid total <span className="total">{((totals?.cumFluid ?? 0) / 1000).toFixed(1)} L</span></h2><DotMatrix label="Cumulative fluid against plan" w={360} h={186} points={intake.map(p => ({ yard: p.yard, value: p.cumFluid / 1000, current: p.current }))} yards={yards} lo={0} hi={cumHi(intake.map(p => Math.max(p.cumFluid, p.cumFluidMax) / 1000), 1)} rows={16} band={yd => { const p = intake.find(q => q.yard === yd); return p ? [p.cumFluidMin / 1000, p.cumFluidMax / 1000] : null; }} ticks={[0, cumHi(intake.map(p => Math.max(p.cumFluid, p.cumFluidMax) / 1000), 1)]} fmt={v => `${v} L`} /></div>
      </section>}
    </> : <>
      <section className="panel">
        <h2>Lap time per yard <span className="unit">min · shaded = plan</span></h2>
        <LapChart laps={laps} yards={yards} />
      </section>

      <section className="panel">
        <h2>Carbs per yard <span className="unit">g · ? = unknown carbs logged</span></h2>
        {hasIntake ? <CarbsPerYard points={intake} yards={yards} /> : <p className="empty">No intake data yet. Log in below.</p>}
      </section>

      {hasIntake && <section className="pair">
        <div className="panel"><h2>Total carbs <span className="total">{n(totals?.cumCarbs ?? 0)} g</span></h2><Cumulative points={intake} yards={yards} kind="carbs" /></div>
        <div className="panel"><h2>Total fluid <span className="total">{((totals?.cumFluid ?? 0) / 1000).toFixed(1)} L</span></h2><Cumulative points={intake} yards={yards} kind="fluid" /></div>
      </section>}
    </>}

    <footer className="status">
      <span className={error || stale ? 'warn' : undefined}>Laps: {snapshot ? `official feed ${clockTime(snapshot.checkedAt)}` : 'waiting for feed'}{error ? ` · ${error}` : ''}</span>
      {live && <button className="import" onClick={onLog}>Log food &amp; drink →</button>}
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

export default App;
