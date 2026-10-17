import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { CarbsPerYard, Cumulative, LapChart } from './components/Charts';
import { useOfficialLaps } from './hooks/useOfficialLaps';
import { intakeSeries, lapSeries } from './lib/dashData';
import { loadImported, parseHQExport, saveImported, type ImportedIntake } from './lib/importHQ';
import { computeLapClock, formatClock, raceStartUtc } from './lib/raceClock';
import { RACE } from './data/raceConfig';
import { useRaceLog } from './hooks/useRaceLog';
import { Login } from './components/Login';
import { LogPage } from './pages/LogPage';

const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: RACE.timezone, hour: '2-digit', minute: '2-digit' });
const n = (v: number) => Math.round(v).toLocaleString('en-GB');

function App() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => { const on = () => setHash(location.hash); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  return hash === '#log' ? <LogPage /> : <Dashboard />;
}

function Dashboard() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const { snapshot, error } = useOfficialLaps();
  const log = useRaceLog();
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
  const last = laps[laps.length - 1];
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
      <div className="stat"><span className="label">{started ? 'Yard' : 'Starts'}</span><strong className="hero">{started ? clock.lapNumber : clockTime(start.toISOString())}</strong></div>
      <div className="stat"><span className="label">{started ? 'Next start in' : 'Countdown'}</span><strong className="hero">{formatClock(started ? clock.msToNextLap : start.getTime() - now.getTime())}</strong></div>
      <div className="stat"><span className="label">Last lap{last ? ` · yard ${last.yard}` : ''}</span><strong className="big">{last ? formatClock(last.lapMs) : '—'}</strong><span className="sub">{last ? `rest ${formatClock(last.restMs)}` : 'no lap yet'}</span></div>
    </header>

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

    <footer className="status">
      <span className={error || stale ? 'warn' : undefined}>Laps: {snapshot ? `official feed ${clockTime(snapshot.checkedAt)}` : 'waiting for feed'}{error ? ` · ${error}` : ''}</span>
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
