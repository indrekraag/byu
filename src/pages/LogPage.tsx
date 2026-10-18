import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { Login } from '../components/Login';
import type { RaceLog } from '../App';
import { DRINKS, DRINK_ORDER, drinkEntry, raceIntakeRecords, type DrinkKind } from '../lib/intakeAdvice';
import { computeLapClock, formatClock, raceStartUtc } from '../lib/raceClock';
import { eventToRow, rowsFromHQ, type Op } from '../lib/raceLog';
import { parseHQExport } from '../lib/importHQ';
import { raceTime, validFinish } from '../lib/raceHQ';
import { yardIntake } from '../lib/yardTargets';
import { supabase } from '../lib/supabase';
import { readJournal, readSnapshots, toCsv } from '../lib/backup';
import { DRINK_STEP, FOODS, LAP_BOTTLE_LEFT, NOTES, PRESET_TEXTS, amountIn, customFood, lapBottleDrunk, portionOf, type Food } from '../data/foods';
import { countdownClass } from '../lib/countdown';
import { Digits } from '../components/Digits';
import { YardSchedule } from '../components/YardSchedule';
import type { IntakeEvent } from '../lib/raceHQ';
import { EVENT_PREFIX, NOTE_PREFIX, type EditPatch } from '../lib/raceLog';
import { targetsForYard } from '../lib/yardTargets';

const FOOD_PREFIX = 'Ate prepared food: ';
const g = (v?: number) => v === undefined ? '?' : `${Math.round(v * 10) / 10}`;
const LAST_DRINK_KEY = 'byu-dash:last-drink';
const uuid = () => crypto.randomUUID();
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' });

export function LogPage({ log, footer }: { log: RaceLog; footer: ReactNode }) {
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
  // Typed-in food survives a reload (kept for this browser session).
  const [foodText, setFoodText] = useState(() => { try { return sessionStorage.getItem('byu-dash:draft-food') ?? ''; } catch { return ''; } });
  const [foodCarbs, setFoodCarbs] = useState(() => { try { return sessionStorage.getItem('byu-dash:draft-carbs') ?? ''; } catch { return ''; } });
  useEffect(() => { try { sessionStorage.setItem('byu-dash:draft-food', foodText); sessionStorage.setItem('byu-dash:draft-carbs', foodCarbs); } catch { /* fine */ } }, [foodText, foodCarbs]);
  const [flash, setFlash] = useState('');
  const [undoId, setUndoId] = useState<string | null>(null); // last entry, for the Undo in the message
  const [justLogged, setJustLogged] = useState<string | null>(null); // tile that flashes mint
  const [moreFoods, setMoreFoods] = useState(false);
  useEffect(() => { if (!justLogged) return; const id = setTimeout(() => setJustLogged(null), 1200); return () => clearTimeout(id); }, [justLogged]);
  // Stepper values the user has nudged but not logged yet; otherwise each
  // starts at the last amount logged for that food / drink.
  const [foodAmt, setFoodAmt] = useState<Record<string, number>>({});
  const [drinkMl, setDrinkMl] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  // Race control (FINISH): folded away; finishing needs FINISH typed in.
  const [controlOpen, setControlOpen] = useState(false);
  const [confirming, setConfirming] = useState<'finish' | 'resume' | null>(null);
  const [typed, setTyped] = useState('');
  useEffect(() => { if (!flash) return; const id = setTimeout(() => { setFlash(''); setUndoId(null); }, 6000); return () => clearTimeout(id); }, [flash]);

  if (!log.authReady) return <div className="log"><p className="muted">Loading…</p></div>;
  if (!log.session) return <div className="log"><Login /></div>;

  const counted = raceIntakeRecords(log.records, start, new Date(now.getTime() + 60000));
  const record = counted[yard];
  const totals = record ? yardIntake(record) : { carbs: 0, fluid: 0, incomplete: false };
  const entries = [...(record?.intake ?? [])].reverse();
  const notes = [...(log.records[yard]?.notes ?? [])].reverse();
  const target = targetsForYard(yard);
  const needsLabel = drink !== '' && DRINKS[drink].carbsPer500 === undefined;
  const labelOk = label === '' || (Number(label) >= 0 && Number(label) <= 100);

  const add = (...ops: Op[]) => log.enqueue(...ops);
  function addDrink(ml: number, kind: DrinkKind | '' = drink) {
    if (!kind || (kind === drink && !labelOk)) return;
    const e = drinkEntry(kind, ml, new Date().toISOString(), uuid(), kind === drink && label !== '' ? Number(label) : undefined);
    add({ type: 'intake', row: eventToRow(yard, e, 'dashboard') });
    setFlash(`+${ml} ml ${DRINKS[kind].label.split(' (')[0]} · yard ${yard}`); setUndoId(e.id); setJustLogged('station');
  }
  function addFood(text: string, carbsG?: number) {
    const id = uuid();
    add({ type: 'intake', row: eventToRow(yard, { id, at: new Date().toISOString(), kind: 'food', text: `Ate prepared food: ${text}`, carbsG }, 'dashboard') });
    setFlash(`+ ${text}${carbsG === undefined ? ' · carbs unknown' : ` · ${carbsG} g`} · yard ${yard}`); setUndoId(id);
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
  function download(name: string, body: string, type: string) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(':', '');
  // Full backup: the server copy, by yard (Laura's app format), everything this
  // device ever logged (journal), and the recent snapshots.
  function exportJson() {
    download(`race-log-${stamp()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), yards: log.records, rows: { intake: log.intake, returns: log.returns }, journal: readJournal(), snapshots: readSnapshots() }, null, 2), 'application/json');
  }
  function exportCsv() { download(`race-log-${stamp()}.csv`, toCsv(log.intake, log.returns), 'text/csv'); }
  const returned = log.records[yard]?.finish;

  const history = Object.values(log.records).flatMap(r => r.intake ?? []).sort((a, b) => b.at.localeCompare(a.at));
  // Foods typed in by hand earlier in the race become stepper tiles too.
  const customFoods: Food[] = [];
  for (const e of history) {
    if (e.kind !== 'food') continue;
    const text = e.text.replace(FOOD_PREFIX, '').replace(/^\d+ × /, '');
    if (PRESET_TEXTS.has(text) || FOODS.some(f => amountIn(f, e.text) !== null || text.includes(f.text)) || text.includes('small potato')) continue;
    if (customFoods.some(c => c.text.toLowerCase() === text.toLowerCase())) continue;
    const n = /^(\d+) × /.exec(e.text.replace(FOOD_PREFIX, ''))?.[1];
    customFoods.push(customFood(text, e.carbsG === undefined ? undefined : Math.round(e.carbsG / Number(n ?? 1) * 10) / 10));
    if (customFoods.length >= 6) break;
  }
  // Most-used first; foods not used yet in this race fold under "More foods".
  const uses = (f: Food) => history.filter(e => e.kind === 'food' && (amountIn(f, e.text) !== null || e.text.replace(FOOD_PREFIX, '') === f.text)).length;
  const ranked = [...FOODS, ...customFoods].map((f, i) => ({ f, n: uses(f), i })).sort((a, b) => b.n - a.n || a.i - b.i);
  const usedFoods = ranked.filter(r => r.n > 0).map(r => r.f);
  const otherFoods = ranked.filter(r => r.n === 0).map(r => r.f);
  const lastFoodAmount = (f: Food) => { for (const e of history) { if (e.kind !== 'food') continue; const n = amountIn(f, e.text); if (n !== null) return n; } return f.amount!.start; };
  const lastDrinkMl = (kind: DrinkKind) => history.find(e => e.kind === 'drink' && e.drinkKind === kind && !e.text.startsWith('Lap bottle') && e.ml)?.ml ?? DRINK_STEP.start;
  const amountOf = (f: Food) => foodAmt[f.id] ?? lastFoodAmount(f);
  const round1 = (v: number) => Math.round(v * 10) / 10;
  function nudgeFood(f: Food, dir: 1 | -1) {
    const a = f.amount!; setFoodAmt(m => ({ ...m, [f.id]: Math.min(a.max, Math.max(a.min, round1(amountOf(f) + dir * a.step))) }));
  }
  function logFood(f: Food) {
    setJustLogged(f.id);
    if (!f.amount) { addFood(f.text, f.carbsG); return; }
    const p = portionOf(f, amountOf(f));
    addFood(p.text, p.carbsG);
    setFoodAmt(m => { const n = { ...m }; delete n[f.id]; return n; });
  }
  const amountLabel = (f: Food, v: number) => f.amount!.kind === 'percent' ? `${Math.round(v * 100)}%` : f.amount!.kind === 'grams' ? `${v} g` : `${v} ${f.unit ?? (f.id === 'gummies' ? 'pcs' : '×')}`;
  // No drink chosen on this device yet: use the last station drink logged.
  const lastStationKind = history.find(e => e.kind === 'drink' && !e.text.startsWith('Lap bottle') && e.drinkKind)?.drinkKind as DrinkKind | undefined;
  if (!drink && lastStationKind) queueMicrotask(() => setDrink(d => d || lastStationKind));
  const stationMl = drink ? drinkMl[drink] ?? lastDrinkMl(drink) : DRINK_STEP.start;
  const stationCarbs = drink ? drinkEntry(drink, stationMl, '', '', label === '' ? undefined : Number(label)).carbsG : undefined;
  function nudgeDrink(dir: 1 | -1) {
    if (!drink) return;
    setDrinkMl(m => ({ ...m, [drink]: Math.min(DRINK_STEP.max, Math.max(DRINK_STEP.min, stationMl + dir * DRINK_STEP.step)) }));
  }
  function logStation() {
    if (!drink) return;
    addDrink(stationMl);
    setDrinkMl(m => { const n = { ...m }; delete n[drink]; return n; });
  }
  function lapBottleBack(label: string, left: number) {
    const ml = lapBottleDrunk(left);
    const e = drinkEntry('water', ml, new Date().toISOString(), uuid());
    add({ type: 'intake', row: eventToRow(yard, { ...e, text: `Lap bottle back · ${label} (${ml} ml water)` }, 'dashboard') });
    setFlash(`Lap bottle back ${label.toLowerCase()} · ${ml} ml water · yard ${yard}`); setUndoId(e.id); setJustLogged(`lap:${label}`);
  }
  function renderFood(f: Food) {
    const lit = justLogged === f.id ? ' just-logged' : '';
    return f.amount
      ? <div key={f.id} className={`stepper-tile${lit}`}>
        <button className="step" aria-label={`Less ${f.label}`} disabled={amountOf(f) <= f.amount.min} onClick={() => nudgeFood(f, -1)}>−</button>
        <button className="big-btn secondary log-amount" disabled={!started} onClick={() => logFood(f)}>{f.label} · {amountLabel(f, amountOf(f))}<small>{f.carbsG === undefined ? 'carbs ?' : `${g(portionOf(f, amountOf(f)).carbsG)} g`}{f.estimate ? ' (est.)' : ''}</small></button>
        <button className="step" aria-label={`More ${f.label}`} disabled={amountOf(f) >= f.amount.max} onClick={() => nudgeFood(f, 1)}>+</button>
      </div>
      : <button key={f.id} className={`big-btn secondary${lit}`} disabled={!started} onClick={() => logFood(f)}>{f.label}{f.carbsG !== undefined ? <small>{g(f.carbsG)} g</small> : <small>carbs ?</small>}</button>;
  }
  function finishRace() {
    const lastBack = Math.max(0, ...Object.entries(log.records).filter(([, r]) => r.finish).map(([y]) => Number(y)));
    add({ type: 'intake', row: { id: uuid(), yard: Math.max(1, lastBack || clock.lapNumber), at: new Date().toISOString(), kind: null, drink_kind: null, ml: null, carbs_g: null, text: `${EVENT_PREFIX}finished`, source: 'dashboard', deleted_at: null } });
    setConfirming(null); setTyped(''); setFlash('Race finished. Clocks and countdowns stopped on all devices.');
  }
  function resumeRace() {
    if (log.finished) add({ type: 'undo', id: log.finished.id, at: new Date().toISOString() });
    setConfirming(null); setTyped(''); setFlash('Race resumed.');
  }
  function saveEdit(e: IntakeEvent, patch: EditPatch) {
    add({ type: 'edit', id: e.id, patch });
    setEditing(null);
    setFlash(patch.yard !== undefined && patch.yard !== yard ? `Moved to yard ${patch.yard}.` : 'Entry updated.');
  }

  return <div className="log">
    {/* Stays on top while scrolling: which yard you are logging to, and the clock. */}
    <div className="log-sticky">
      <div className="log-hero">
        <header className="log-head">
          <div className="yard-pick">
            <button aria-label="Previous yard" onClick={() => setYardOffset(o => Math.max(1 - clock.lapNumber, o - 1))}>−</button>
            <div><span className="label">{yardOffset ? 'Logging to' : 'Yard'}</span><strong>{yard}</strong></div>
            <button aria-label="Next yard" disabled={yardOffset >= 0} onClick={() => setYardOffset(o => Math.min(0, o + 1))}>+</button>
          </div>
          <div className="log-clock"><span className="label">Next start</span><strong className={started ? `${countdownClass(clock.msToNextLap)}${clock.msToNextLap > 20 * 60_000 ? ' calm' : ''}` : undefined}>{started ? <Digits text={formatClock(clock.msToNextLap)} /> : '—'}</strong></div>
        </header>
        <div className="progress">
          <div className="meter"><span className="meter-label">Carbs</span><span className="bar"><span className={totals.carbs >= target.carbMin ? 'fill ok' : 'fill'} style={{ width: `${Math.min(100, totals.carbs / target.carbMax * 100)}%` }} /></span><span className="meter-value"><b>{Math.round(totals.carbs)}{totals.incomplete ? '+?' : ''} g</b> / {target.carbMin}–{target.carbMax}</span></div>
          <div className="meter"><span className="meter-label">Fluid</span><span className="bar"><span className={totals.fluid >= target.fluidMin ? 'fill fluid ok' : 'fill fluid'} style={{ width: `${Math.min(100, totals.fluid / target.fluidMax * 100)}%` }} /></span><span className="meter-value"><b>{totals.fluid} ml</b> / {target.fluidMin}–{target.fluidMax}</span></div>
        </div>
        <p className={log.error || log.pending ? 'sync warn' : 'sync'}>{log.pending ? `${log.pending} not sent yet · ` : 'All saved · '}{log.error || (log.loadedAt ? `synced ${hhmm(log.loadedAt.toISOString())}` : 'connecting…')}</p>
      </div>
      {yardOffset !== 0 && <p className="warn">Logging to an earlier yard. <button className="link" onClick={() => setYardOffset(0)}>Back to current</button></p>}
      {flash && <p className="flash" role="status"><span>{flash}</span>{undoId && <button className="flash-undo" onClick={() => { add({ type: 'undo', id: undoId, at: new Date().toISOString() }); setUndoId(null); setFlash('Undone.'); }}>Undo</button>}</p>}
    </div>


    {/* Phone: one column. iPad and wider: two independent columns, so a tall
        Food card never leaves a hole beside the shorter ones. */}
    <div className="log-cols">
      <div className="log-col">
        <section className="card drink-card">
          <h2>Drink</h2>
          <select value={drink} onChange={e => { setDrink(e.target.value as DrinkKind); setLabel(''); try { localStorage.setItem(LAST_DRINK_KEY, e.target.value); } catch { /* fine */ } }}>
            <option value="">Choose drink</option>
            {DRINK_ORDER.map(k => <option key={k} value={k}>{DRINKS[k].short}</option>)}
          </select>
          {needsLabel && <input type="number" inputMode="decimal" min="0" max="100" step="any" placeholder="Carbs g / 100 ml from label (blank = unknown)" value={label} onChange={e => setLabel(e.target.value)} />}
          <p className="portion-title">Lap bottle back (250 ml water) · tap what is left</p>
          <div className="row four">{LAP_BOTTLE_LEFT.map(o => <button key={o.label} className={`big-btn lap-bottle${justLogged === `lap:${o.label}` ? ' just-logged' : ''}`} disabled={!started} onClick={() => lapBottleBack(o.label, o.left)}>{o.label}<small>{lapBottleDrunk(o.left)} ml</small></button>)}</div>
          <p className="portion-title">Station drink</p>
          <div className={`stepper-tile drink${justLogged === 'station' ? ' just-logged' : ''}`}>
            <button className="step" aria-label="Less" disabled={!drink || stationMl <= DRINK_STEP.min} onClick={() => nudgeDrink(-1)}>−</button>
            <button className="big-btn log-amount" disabled={!started || !drink || !labelOk} onClick={logStation}>{drink ? <>Log {stationMl} ml<small>{DRINKS[drink].short.split(' · ')[0]}{stationCarbs !== undefined ? ` · ${g(stationCarbs)} g` : ' · carbs ?'}</small></> : 'Choose a drink above'}</button>
            <button className="step" aria-label="More" disabled={!drink || stationMl >= DRINK_STEP.max} onClick={() => nudgeDrink(1)}>+</button>
          </div>
        </section>
        <section className="card">
          <h2>Logged this yard</h2>
          {!entries.length && !notes.length && <p className="muted">Nothing yet.</p>}
          {notes.map(n => <div key={n.id} className="entry"><span>{hhmm(n.at)} · Note: {n.text}</span><span className="entry-actions"><button className="link" onClick={() => { add({ type: 'undo', id: n.id, at: new Date().toISOString() }); setFlash('Note removed.'); }}>Undo</button></span></div>)}
          {entries.map(e => editing === e.id
            ? <EntryEditor key={e.id} entry={e} yard={yard} maxYard={clock.lapNumber} onSave={patch => saveEdit(e, patch)} onCancel={() => setEditing(null)} />
            : <div key={e.id} className="entry">
              <span>{hhmm(e.at)} · {e.kind === 'drink' ? `${e.ml} ml ${DRINKS[(e.drinkKind || 'other') as DrinkKind]?.label.split(' (')[0] ?? 'drink'}` : e.text.replace(FOOD_PREFIX, '')}{e.carbsG === undefined ? ' · carbs ?' : ` · ${g(e.carbsG)} g`}</span>
              <span className="entry-actions">
                <button className="link" onClick={() => setEditing(e.id)}>Edit</button>
                <button className="link" onClick={() => { add({ type: 'undo', id: e.id, at: new Date().toISOString() }); setFlash('Entry undone.'); }}>Undo</button>
              </span>
            </div>)}
        </section>
        <section className="card">
          <button className="fold" aria-expanded={notesOpen} onClick={() => setNotesOpen(o => !o)}><h2>Notes</h2><span>{notesOpen ? 'Hide' : 'Show'}</span></button>
          {notesOpen && <div className="row four">{NOTES.map(n => <button key={n.text} className="big-btn secondary" disabled={!started} onClick={() => { add({ type: 'intake', row: { id: uuid(), yard, at: new Date().toISOString(), kind: null, drink_kind: null, ml: null, carbs_g: null, text: `${NOTE_PREFIX}${n.text}`, source: 'dashboard', deleted_at: null } }); setFlash(`Note: ${n.text} · yard ${yard}`); }}>{n.text}</button>)}</div>}
        </section>
      </div>
      <div className="log-col">
        <section className="card food-card">
          <h2>Food</h2>
          <div className="food-grid">{(usedFoods.length ? usedFoods : otherFoods).map(renderFood)}</div>
          {usedFoods.length > 0 && otherFoods.length > 0 && <>
            <button className="fold" aria-expanded={moreFoods} onClick={() => setMoreFoods(o => !o)}><span className="portion-title">More foods ({otherFoods.length})</span><span>{moreFoods ? 'Hide' : 'Show'}</span></button>
            {moreFoods && <div className="food-grid">{otherFoods.map(renderFood)}</div>}
          </>}
          <div className="row custom">
            <input placeholder="Other food" value={foodText} onChange={e => setFoodText(e.target.value)} />
            <input type="number" inputMode="decimal" min="0" placeholder="g carbs" value={foodCarbs} onChange={e => setFoodCarbs(e.target.value)} />
            <button className="big-btn secondary" disabled={!started || !foodText.trim()} onClick={() => { addFood(foodText.trim(), foodCarbs === '' ? undefined : Number(foodCarbs)); setFoodText(''); setFoodCarbs(''); }}>Add</button>
          </div>
        </section>
      </div>
    </div>

    <YardSchedule start={start} now={now} current={clock.lapNumber} records={log.records} />

    <section className="card backup">
      <h2>Backup &amp; tools</h2>
      <p className="backup-status">
        <span className={log.pending ? 'warn' : undefined}>{log.pending ? `${log.pending} waiting to send` : 'Everything sent'} · server copy {log.loadedAt ? hhmm(log.loadedAt.toISOString()) : '—'} · {log.intake.length} entries</span>
        <span>This device: {readJournal().length} logged · {readSnapshots().length} snapshots{readSnapshots().length ? ` (latest ${hhmm(readSnapshots()[readSnapshots().length - 1].at)})` : ''} · off-site copy every 15 min</span>
        {log.repaired > 0 && <span className="warn">Re-sent {log.repaired} entr{log.repaired === 1 ? 'y' : 'ies'} the server was missing</span>}
      </p>
      <div className="row two">
        <button className="big-btn secondary" onClick={exportJson}>Download backup (JSON)</button>
        <button className="big-btn secondary" onClick={exportCsv}>Download spreadsheet (CSV)</button>
      </div>
      <div className="tool-links">
        <label className="file-btn">Import from Laura's app<input type="file" accept=".json,application/json" onChange={importFile} /></label>
        {/* Returns come in automatically from the official timing; this is the fallback. */}
        <button className="link" disabled={!started} onClick={backNow}>{returned ? `Return ${hhmm(returned)} · set to now` : 'Log return now'}</button>
        <button className="link" onClick={() => void supabase.auth.signOut()}>Log out</button>
      </div>
    </section>

    <section className="race-control">
      <button className="fold" aria-expanded={controlOpen} onClick={() => { setControlOpen(o => !o); setConfirming(null); setTyped(''); }}><span>Race control</span><span>{controlOpen ? 'Hide' : 'Show'}</span></button>
      {controlOpen && <div className="race-control-body">
        {!log.finished && confirming !== 'finish' && <button className="big-btn danger-outline" onClick={() => setConfirming('finish')}>Finish race…</button>}
        {confirming === 'finish' && <div className="confirm">
          <p><b>Finish the race now?</b> This stops the countdown, yard bar and pop-ups on every device and records the finish time. Logging still works for corrections.</p>
          <label>Type FINISH to confirm<input value={typed} autoCapitalize="characters" autoComplete="off" onChange={e => setTyped(e.target.value)} /></label>
          <div className="row two">
            <button className="big-btn secondary" onClick={() => { setConfirming(null); setTyped(''); }}>Cancel</button>
            <button className="big-btn danger" disabled={typed.trim().toUpperCase() !== 'FINISH'} onClick={finishRace}>Yes, finish race</button>
          </div>
        </div>}
        {log.finished && confirming !== 'resume' && <>
          <p className="muted">Finished at {hhmm(log.finished.at)}.</p>
          <button className="big-btn secondary" onClick={() => setConfirming('resume')}>Resume race…</button>
        </>}
        {confirming === 'resume' && <div className="confirm">
          <p><b>Resume the race?</b> Clocks and countdowns start again on every device.</p>
          <div className="row two">
            <button className="big-btn secondary" onClick={() => setConfirming(null)}>Cancel</button>
            <button className="big-btn" onClick={resumeRace}>Yes, resume</button>
          </div>
        </div>}
      </div>}
    </section>

    {footer}
  </div>;
}

/** Inline editor: change amount, carbs, food name, or move the entry to another yard. */
function EntryEditor({ entry, yard, maxYard, onSave, onCancel }: { entry: IntakeEvent; yard: number; maxYard: number; onSave: (p: EditPatch) => void; onCancel: () => void }) {
  const drink = entry.kind === 'drink';
  const per500 = drink ? DRINKS[(entry.drinkKind || 'other') as DrinkKind]?.carbsPer500 : undefined;
  const [ml, setMl] = useState(String(entry.ml ?? ''));
  const [carbs, setCarbs] = useState(entry.carbsG === undefined ? '' : String(entry.carbsG));
  const [text, setText] = useState(entry.text.replace(FOOD_PREFIX, ''));
  const [toYard, setToYard] = useState(yard);
  // A drink with a known mix keeps its carbs in step with the amount.
  function changeMl(v: string) {
    setMl(v);
    if (per500 !== undefined && v !== '' && Number(v) >= 0) setCarbs(String(Math.round(per500 * Number(v) / 500 * 100) / 100));
  }
  const valid = (!drink || (ml !== '' && Number(ml) >= 0)) && (carbs === '' || Number(carbs) >= 0) && (drink || text.trim() !== '');
  return <div className="entry-edit">
    {drink
      ? <label>Amount (ml)<input type="number" inputMode="numeric" min="0" step="50" value={ml} onChange={ev => changeMl(ev.target.value)} /></label>
      : <label>Food<input value={text} onChange={ev => setText(ev.target.value)} /></label>}
    <label>Carbs (g, blank = unknown)<input type="number" inputMode="decimal" min="0" step="any" value={carbs} onChange={ev => setCarbs(ev.target.value)} /></label>
    <label>Yard<select value={toYard} onChange={ev => setToYard(Number(ev.target.value))}>{Array.from({ length: maxYard }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    <div className="row two">
      <button className="big-btn secondary" onClick={onCancel}>Cancel</button>
      <button className="big-btn" disabled={!valid} onClick={() => onSave({
        carbs_g: carbs === '' ? null : Number(carbs),
        ...(drink ? { ml: Number(ml) } : { text: `${entry.text.startsWith(FOOD_PREFIX) ? FOOD_PREFIX : ''}${text.trim()}` }),
        ...(toYard !== yard ? { yard: toYard } : {}),
      })}>Save</button>
    </div>
  </div>;
}
