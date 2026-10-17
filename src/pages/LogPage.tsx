import { useEffect, useState, type ChangeEvent } from 'react';
import { Login } from '../components/Login';
import type { RaceLog } from '../App';
import { LOOKS, type Look } from '../lib/look';
import { DRINKS, drinkEntry, raceIntakeRecords, type DrinkKind } from '../lib/intakeAdvice';
import { computeLapClock, formatClock, raceStartUtc } from '../lib/raceClock';
import { eventToRow, rowsFromHQ, type Op } from '../lib/raceLog';
import { parseHQExport } from '../lib/importHQ';
import { raceTime, validFinish } from '../lib/raceHQ';
import { yardIntake } from '../lib/yardTargets';
import { supabase } from '../lib/supabase';

// Laura's own presets and carb values (her crew plan); unknown stays unknown.
const FOODS: { label: string; text: string; carbsG?: number }[] = [
  { label: 'Gel · 25 g', text: '1 regular Maurten Gel 100 (non-caffeinated)', carbsG: 25 },
  { label: '3 gummies · 22 g', text: '3 Party Fred gummies', carbsG: 22.3 },
  { label: '½ banana', text: '½ banana, cut into 3 bite-size pieces' },
  { label: '4 orange segments', text: '4 peeled orange segments' },
  { label: 'Potatoes 100 g', text: '100 g cooked boiled potatoes in 1 bowl' },
  { label: 'Mash 100 g', text: '100 g prepared familiar mash in 1 bowl' },
  { label: 'Bread + jam', text: '30 g white bread + 10 g familiar smooth jam' },
];
const LAST_DRINK_KEY = 'byu-dash:last-drink';
const uuid = () => crypto.randomUUID();
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' });

export function LogPage({ log, look, onLook, onDashboard }: { log: RaceLog; look: Look; onLook: (l: Look) => void; onDashboard: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const start = raceStartUtc();
  const clock = computeLapClock(start, now);
  const started = now >= start;
  const [yardOffset, setYardOffset] = useState(0);
  useEffect(() => setYardOffset(0), [clock.lapNumber]);
  const yard = Math.max(1, clock.lapNumber + yardOffset);
  const [drink, setDrink] = useState<DrinkKind | ''>(() => { try { const v = localStorage.getItem(LAST_DRINK_KEY); return v && v in DRINKS ? v as DrinkKind : ''; } catch { return ''; } });
  const [label, setLabel] = useState('');
  const [foodText, setFoodText] = useState('');
  const [foodCarbs, setFoodCarbs] = useState('');
  const [flash, setFlash] = useState('');
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 4000); return () => clearTimeout(id); }, [flash]);

  const lookSwitch = <section className="card looks"><h2>Design option</h2><div className="row three">{LOOKS.map(l => <button key={l.id} className="big-btn secondary" aria-pressed={look === l.id} onClick={() => onLook(l.id)}>{l.label}</button>)}</div></section>;
  if (!log.authReady) return <div className="log"><p className="muted">Loading…</p></div>;
  if (!log.session) return <div className="log"><Login />{lookSwitch}</div>;

  const counted = raceIntakeRecords(log.records, start, new Date(now.getTime() + 60000));
  const record = counted[yard];
  const totals = record ? yardIntake(record) : { carbs: 0, fluid: 0, incomplete: false };
  const entries = [...(record?.intake ?? [])].reverse();
  const needsLabel = drink !== '' && DRINKS[drink].carbsPer500 === undefined;
  const labelOk = label === '' || (Number(label) >= 0 && Number(label) <= 100);

  const add = (...ops: Op[]) => log.enqueue(...ops);
  function addDrink(ml: number) {
    if (!drink || !labelOk) return;
    const e = drinkEntry(drink, ml, new Date().toISOString(), uuid(), label === '' ? undefined : Number(label));
    add({ type: 'intake', row: eventToRow(yard, e, 'dashboard') });
    setFlash(`+${ml} ml ${DRINKS[drink].label.split(' (')[0]} · yard ${yard}`);
  }
  function addFood(text: string, carbsG?: number) {
    add({ type: 'intake', row: eventToRow(yard, { id: uuid(), at: new Date().toISOString(), kind: 'food', text: `Ate prepared food: ${text}`, carbsG }, 'dashboard') });
    setFlash(`+ ${text}${carbsG === undefined ? ' · carbs unknown' : ` · ${carbsG} g`} · yard ${yard}`);
  }
  function backNow() {
    const at = new Date();
    if (!validFinish(start, yard, at, at)) { setFlash(`Yard ${yard} is over; can't set its return to now.`); return; }
    add({ type: 'return', row: { yard, finish: at.toISOString(), lap_ms: null, source: 'manual' } });
    setFlash(`Return yard ${yard} · ${raceTime(at)}`);
  }
  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      const { intake, returns } = rowsFromHQ(parseHQExport(await file.text(), file.name, new Date()).yards);
      add(...intake.map(row => ({ type: 'intake' as const, row })), ...returns.map(row => ({ type: 'return' as const, row })));
      setFlash(`Importing ${intake.length} entries and ${returns.length} returns. Already-imported entries are skipped.`);
    } catch (err) { setFlash(err instanceof Error ? err.message : 'Import failed.'); }
  }
  function exportJson() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), yards: log.records }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `race-log-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`; a.click(); URL.revokeObjectURL(url);
  }
  const returned = log.records[yard]?.finish;

  return <div className="log">
    <header className="log-head">
      <div className="yard-pick">
        <button aria-label="Previous yard" onClick={() => setYardOffset(o => Math.max(1 - clock.lapNumber, o - 1))}>−</button>
        <div><span className="label">{yardOffset ? 'Logging to yard' : 'Yard'}</span><strong>{yard}</strong></div>
        <button aria-label="Next yard" disabled={yardOffset >= 0} onClick={() => setYardOffset(o => Math.min(0, o + 1))}>+</button>
      </div>
      <div className="log-clock"><span className="label">Next start</span><strong>{started ? formatClock(clock.msToNextLap) : '—'}</strong></div>
    </header>
    <p className={log.error || log.pending ? 'sync warn' : 'sync'}>{log.pending ? `${log.pending} not sent yet · ` : 'All saved · '}{log.error || (log.loadedAt ? `synced ${hhmm(log.loadedAt.toISOString())}` : 'connecting…')}</p>
    {yardOffset !== 0 && <p className="warn">Logging to an earlier yard. <button className="link" onClick={() => setYardOffset(0)}>Back to current</button></p>}
    {flash && <p className="flash" role="status">{flash}</p>}

    <section className="card">
      <h2>Yard {yard} so far <span className="total">{Math.round(totals.carbs)} g{totals.incomplete ? ' + ?' : ''} · {totals.fluid} ml</span></h2>
      <div className="row"><button className="big-btn" disabled={!started} onClick={backNow}>{returned ? `Back: ${hhmm(returned)} · update` : 'She is back now'}</button></div>
    </section>

    <section className="card">
      <h2>Drink</h2>
      <select value={drink} onChange={e => { setDrink(e.target.value as DrinkKind); setLabel(''); try { localStorage.setItem(LAST_DRINK_KEY, e.target.value); } catch { /* fine */ } }}>
        <option value="">Choose drink</option>
        {(Object.keys(DRINKS) as DrinkKind[]).map(k => <option key={k} value={k}>{DRINKS[k].label}</option>)}
      </select>
      {needsLabel && <input type="number" inputMode="decimal" min="0" max="100" step="any" placeholder="Carbs g / 100 ml from label (blank = unknown)" value={label} onChange={e => setLabel(e.target.value)} />}
      <div className="row three">{[100, 250, 500].map(ml => <button key={ml} className="big-btn" disabled={!started || !drink || !labelOk} onClick={() => addDrink(ml)}>+{ml} ml</button>)}</div>
    </section>

    <section className="card">
      <h2>Food</h2>
      <div className="row two">{FOODS.map(f => <button key={f.text} className="big-btn secondary" disabled={!started} onClick={() => addFood(f.text, f.carbsG)}>{f.label}</button>)}</div>
      <div className="row custom">
        <input placeholder="Other food" value={foodText} onChange={e => setFoodText(e.target.value)} />
        <input type="number" inputMode="decimal" min="0" placeholder="g carbs" value={foodCarbs} onChange={e => setFoodCarbs(e.target.value)} />
        <button className="big-btn secondary" disabled={!started || !foodText.trim()} onClick={() => { addFood(foodText.trim(), foodCarbs === '' ? undefined : Number(foodCarbs)); setFoodText(''); setFoodCarbs(''); }}>Add</button>
      </div>
    </section>

    <section className="card">
      <h2>Logged this yard</h2>
      {!entries.length && <p className="muted">Nothing yet.</p>}
      {entries.map(e => <div key={e.id} className="entry">
        <span>{hhmm(e.at)} · {e.kind === 'drink' ? `${e.ml} ml ${DRINKS[(e.drinkKind || 'other') as DrinkKind]?.label.split(' (')[0] ?? 'drink'}` : e.text.replace('Ate prepared food: ', '')}{e.carbsG === undefined ? ' · carbs ?' : ` · ${e.carbsG} g`}</span>
        <button className="link" onClick={() => { add({ type: 'undo', id: e.id, at: new Date().toISOString() }); setFlash('Entry undone.'); }}>Undo</button>
      </div>)}
    </section>

    {lookSwitch}
    <section className="card tools">
      <label className="file-btn">Import from Laura's app<input type="file" accept=".json,application/json" onChange={importFile} /></label>
      <button className="link" onClick={exportJson}>Export race log</button>
      <button className="link" onClick={onDashboard}>← Dashboard</button>
      <button className="link" onClick={() => void supabase.auth.signOut()}>Log out</button>
    </section>
  </div>;
}
