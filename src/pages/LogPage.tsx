import { useEffect, useState, type ChangeEvent } from 'react';
import { Login } from '../components/Login';
import type { RaceLog } from '../App';
import { DRINKS, DRINK_ORDER, drinkEntry, raceIntakeRecords, type DrinkKind } from '../lib/intakeAdvice';
import { computeLapClock, formatClock, raceStartUtc } from '../lib/raceClock';
import { eventToRow, rowsFromHQ, type Op } from '../lib/raceLog';
import { parseHQExport } from '../lib/importHQ';
import { raceTime, validFinish } from '../lib/raceHQ';
import { yardIntake } from '../lib/yardTargets';
import { supabase } from '../lib/supabase';
import { DRINK_STEP, FOODS, LAP_BOTTLE_LEFT, NOTES, PRESET_TEXTS, amountIn, lapBottleDrunk, portionOf, type Food } from '../data/foods';
import { countdownClass } from '../lib/countdown';
import { hardRefresh, refresh } from '../lib/refresh';
import type { IntakeEvent } from '../lib/raceHQ';
import { NOTE_PREFIX, type EditPatch } from '../lib/raceLog';
import { targetsForYard } from '../lib/yardTargets';

const FOOD_PREFIX = 'Ate prepared food: ';
const g = (v?: number) => v === undefined ? '?' : `${Math.round(v * 10) / 10}`;
const LAST_DRINK_KEY = 'byu-dash:last-drink';
const uuid = () => crypto.randomUUID();
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' });

export function LogPage({ log, onDashboard }: { log: RaceLog; onDashboard: () => void }) {
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
  // Stepper values the user has nudged but not logged yet; otherwise each
  // starts at the last amount logged for that food / drink.
  const [foodAmt, setFoodAmt] = useState<Record<string, number>>({});
  const [drinkMl, setDrinkMl] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(''), 4000); return () => clearTimeout(id); }, [flash]);

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
    setFlash(`+${ml} ml ${DRINKS[kind].label.split(' (')[0]} · yard ${yard}`);
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

  // Foods typed in by hand earlier in the race, newest first, as one-tap buttons.
  const recentCustom: { text: string; carbsG?: number }[] = [];
  for (const e of Object.values(log.records).flatMap(r => r.intake ?? []).sort((a, b) => b.at.localeCompare(a.at))) {
    if (e.kind !== 'food') continue;
    const text = e.text.replace(FOOD_PREFIX, '');
    if (PRESET_TEXTS.has(text) || FOODS.some(f => text.includes(f.text)) || text.includes('small potato') || recentCustom.some(r => r.text.trim().toLowerCase() === text.trim().toLowerCase())) continue;
    recentCustom.push({ text, carbsG: e.carbsG });
    if (recentCustom.length >= 6) break;
  }
  const history = Object.values(log.records).flatMap(r => r.intake ?? []).sort((a, b) => b.at.localeCompare(a.at));
  const lastFoodAmount = (f: Food) => { for (const e of history) { if (e.kind !== 'food') continue; const n = amountIn(f, e.text); if (n !== null) return n; } return f.amount!.start; };
  const lastDrinkMl = (kind: DrinkKind) => history.find(e => e.kind === 'drink' && e.drinkKind === kind && !e.text.startsWith('Lap bottle') && e.ml)?.ml ?? DRINK_STEP.start;
  const amountOf = (f: Food) => foodAmt[f.id] ?? lastFoodAmount(f);
  const round1 = (v: number) => Math.round(v * 10) / 10;
  function nudgeFood(f: Food, dir: 1 | -1) {
    const a = f.amount!; setFoodAmt(m => ({ ...m, [f.id]: Math.min(a.max, Math.max(a.min, round1(amountOf(f) + dir * a.step))) }));
  }
  function logFood(f: Food) {
    if (!f.amount) { addFood(f.text, f.carbsG); return; }
    const p = portionOf(f, amountOf(f));
    addFood(p.text, p.carbsG);
    setFoodAmt(m => { const n = { ...m }; delete n[f.id]; return n; });
  }
  const amountLabel = (f: Food, v: number) => f.amount!.kind === 'percent' ? `${Math.round(v * 100)}%` : `${v} ${f.id === 'gummies' ? 'pcs' : '×'}`;
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
    setFlash(`Lap bottle back ${label.toLowerCase()} · ${ml} ml water · yard ${yard}`);
  }
  function saveEdit(e: IntakeEvent, patch: EditPatch) {
    add({ type: 'edit', id: e.id, patch });
    setEditing(null);
    setFlash(patch.yard !== undefined && patch.yard !== yard ? `Moved to yard ${patch.yard}.` : 'Entry updated.');
  }

  return <div className="log">
    {/* Stays on top while scrolling: which yard you are logging to, and the clock. */}
    <div className="log-sticky">
      <header className="log-head">
        <div className="yard-pick">
          <button aria-label="Previous yard" onClick={() => setYardOffset(o => Math.max(1 - clock.lapNumber, o - 1))}>−</button>
          <div><span className="label">{yardOffset ? 'Logging to yard' : 'Yard'}</span><strong>{yard}</strong></div>
          <button aria-label="Next yard" disabled={yardOffset >= 0} onClick={() => setYardOffset(o => Math.min(0, o + 1))}>+</button>
        </div>
        <div className="log-clock"><span className="label">Next start</span><strong className={started ? countdownClass(clock.msToNextLap) : undefined}>{started ? formatClock(clock.msToNextLap) : '—'}</strong></div>
      </header>
      <div className="progress" aria-label={`Yard ${yard}: ${Math.round(totals.carbs)} grams of ${target.carbMin} to ${target.carbMax}`}>
        <span><b>{Math.round(totals.carbs)}{totals.incomplete ? '+?' : ''} g</b> of {target.carbMin}–{target.carbMax} · <b>{totals.fluid} ml</b></span>
        <span className="bar"><span className={totals.carbs >= target.carbMin ? 'fill ok' : 'fill'} style={{ width: `${Math.min(100, totals.carbs / target.carbMax * 100)}%` }} /></span>
      </div>
      <p className={log.error || log.pending ? 'sync warn' : 'sync'}>{log.pending ? `${log.pending} not sent yet · ` : 'All saved · '}{log.error || (log.loadedAt ? `synced ${hhmm(log.loadedAt.toISOString())}` : 'connecting…')}</p>
      {yardOffset !== 0 && <p className="warn">Logging to an earlier yard. <button className="link" onClick={() => setYardOffset(0)}>Back to current</button></p>}
      {flash && <p className="flash" role="status">{flash}</p>}
    </div>


    {/* Phone: one column. iPad and wider: two columns (see .log-cols). */}
    <div className="log-cols">
      <section className="card">
        <h2>Drink</h2>
        <select value={drink} onChange={e => { setDrink(e.target.value as DrinkKind); setLabel(''); try { localStorage.setItem(LAST_DRINK_KEY, e.target.value); } catch { /* fine */ } }}>
          <option value="">Choose drink</option>
          {DRINK_ORDER.map(k => <option key={k} value={k}>{DRINKS[k].label}</option>)}
        </select>
        {needsLabel && <input type="number" inputMode="decimal" min="0" max="100" step="any" placeholder="Carbs g / 100 ml from label (blank = unknown)" value={label} onChange={e => setLabel(e.target.value)} />}
        <p className="portion-title">Lap bottle back (250 ml water) · tap what is left</p>
        <div className="row four">{LAP_BOTTLE_LEFT.map(o => <button key={o.label} className="big-btn lap-bottle" disabled={!started} onClick={() => lapBottleBack(o.label, o.left)}>{o.label}<small>{lapBottleDrunk(o.left)} ml drunk</small></button>)}</div>
        <p className="portion-title">Station drink</p>
        <div className="stepper-tile drink">
          <button className="step" aria-label="Less" disabled={!drink || stationMl <= DRINK_STEP.min} onClick={() => nudgeDrink(-1)}>−</button>
          <button className="big-btn log-amount" disabled={!started || !drink || !labelOk} onClick={logStation}>{drink ? <>Log {stationMl} ml<small>{DRINKS[drink].label.split(' (')[0]}{stationCarbs !== undefined ? ` · ${g(stationCarbs)} g` : ' · carbs ?'}</small></> : 'Choose a drink above'}</button>
          <button className="step" aria-label="More" disabled={!drink || stationMl >= DRINK_STEP.max} onClick={() => nudgeDrink(1)}>+</button>
        </div>
      </section>
      <section className="card">
        <h2>Food</h2>
        <div className="food-grid">{FOODS.map(f => f.amount
          ? <div key={f.id} className="stepper-tile">
            <button className="step" aria-label={`Less ${f.label}`} disabled={amountOf(f) <= f.amount.min} onClick={() => nudgeFood(f, -1)}>−</button>
            <button className="big-btn secondary log-amount" disabled={!started} onClick={() => logFood(f)}>{f.label} · {amountLabel(f, amountOf(f))}<small>{g(portionOf(f, amountOf(f)).carbsG)} g{f.estimate ? ' (est.)' : ''}</small></button>
            <button className="step" aria-label={`More ${f.label}`} disabled={amountOf(f) >= f.amount.max} onClick={() => nudgeFood(f, 1)}>+</button>
          </div>
          : <button key={f.id} className="big-btn secondary" disabled={!started} onClick={() => logFood(f)}>{f.label}{f.carbsG !== undefined ? <small>{g(f.carbsG)} g</small> : <small>carbs ?</small>}</button>)}</div>
        {recentCustom.length > 0 && <>
          <p className="portion-title">Earlier today</p>
          <div className="row two">{recentCustom.map(r => <button key={r.text} className="big-btn secondary" disabled={!started} onClick={() => addFood(r.text, r.carbsG)}>{r.text}{r.carbsG !== undefined ? ` · ${g(r.carbsG)} g` : ''}</button>)}</div>
        </>}
        <div className="row custom">
          <input placeholder="Other food" value={foodText} onChange={e => setFoodText(e.target.value)} />
          <input type="number" inputMode="decimal" min="0" placeholder="g carbs" value={foodCarbs} onChange={e => setFoodCarbs(e.target.value)} />
          <button className="big-btn secondary" disabled={!started || !foodText.trim()} onClick={() => { addFood(foodText.trim(), foodCarbs === '' ? undefined : Number(foodCarbs)); setFoodText(''); setFoodCarbs(''); }}>Add</button>
        </div>
      </section>
    </div>

    <div className="log-cols">
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

    <section className="card tools">
      <label className="file-btn">Import from Laura's app<input type="file" accept=".json,application/json" onChange={importFile} /></label>
      <button className="link" onClick={exportJson}>Export race log</button>
      {/* Returns come in automatically from the official timing; this is the fallback. */}
      <button className="link" disabled={!started} onClick={backNow}>{returned ? `Return ${hhmm(returned)} · set to now` : 'Log return now'}</button>
      <button className="link" onClick={onDashboard}>← Dashboard</button>
      <button className="link" onClick={refresh}>Refresh</button>
      <button className="link" onClick={hardRefresh}>Hard refresh</button>
      <button className="link" onClick={() => void supabase.auth.signOut()}>Log out</button>
    </section>
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
