import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { finishedEvent, toRecords, type IntakeRow, type Op, type ReturnRow } from '../lib/raceLog';
import { journal, missingOnServer, snapshot } from '../lib/backup';

// Every change goes to a device-local outbox first and is sent from there, so
// a tap made with no signal at the venue is kept and retried, not lost.
const OUTBOX_KEY = 'byu-dash:outbox:v1';
const readOutbox = (): Op[] => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') as Op[]; } catch { return []; } };
const writeOutbox = (ops: Op[]) => { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops)); } catch { /* Kept in memory. */ } };

// The same op queued twice (e.g. an official lap seen on two polls) is sent once.
export function dedupe(ops: Op[]): Op[] {
  const seen = new Set<string>();
  return ops.filter(op => { const key = op.type === 'return' ? `return:${op.row.yard}:${op.row.source}:${Date.parse(op.row.finish)}` : JSON.stringify(op); if (seen.has(key)) return false; seen.add(key); return true; });
}

// Every request gives up after 15 s, so one hung request (Wi-Fi blip) can never
// freeze syncing until the page is reloaded.
const TIMEOUT_MS = 8_000;
// Last good copy of the log, so a reload shows data at once while it syncs.
const CACHE_KEY = 'byu-dash:race-log-cache:v1';
const readCache = (): { intake: IntakeRow[]; returns: ReturnRow[]; at: string } | null => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };
const timeout = () => { const c = new AbortController(); setTimeout(() => c.abort(), TIMEOUT_MS); return c.signal; };

async function send(op: Op) {
  if (op.type === 'intake') return supabase.from('intake_events').upsert(op.row, { onConflict: 'id', ignoreDuplicates: true }).abortSignal(timeout());
  if (op.type === 'undo') return supabase.from('intake_events').update({ deleted_at: op.at }).eq('id', op.id).abortSignal(timeout());
  if (op.type === 'edit') return supabase.from('intake_events').update(op.patch).eq('id', op.id).abortSignal(timeout());
  if (op.row.source === 'manual') {
    // A manual return never replaces an official one.
    const { data, error } = await supabase.from('yard_returns').select('source').eq('yard', op.row.yard).abortSignal(timeout()).maybeSingle();
    if (error) return { error };
    if (data?.source === 'official') return { error: null };
  }
  return supabase.from('yard_returns').upsert({ ...op.row, updated_at: new Date().toISOString() }, { onConflict: 'yard' }).abortSignal(timeout());
}

export function useRaceLog() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [intake, setIntake] = useState<IntakeRow[]>(() => readCache()?.intake ?? []);
  const [returns, setReturns] = useState<ReturnRow[]>(() => readCache()?.returns ?? []);
  const [outbox, setOutbox] = useState<Op[]>(readOutbox);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const flushing = useRef(false);
  const flushStarted = useRef(0);
  const retrySoon = useRef(false);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const [repaired, setRepaired] = useState(0);
  const [liveLink, setLiveLink] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('intake_events').select('id,yard,at,kind,drink_kind,ml,carbs_g,text,source,deleted_at').order('at').abortSignal(timeout()),
      supabase.from('yard_returns').select('yard,finish,lap_ms,source').order('yard').abortSignal(timeout()),
    ]);
    if (a.error || b.error) {
      setError('Could not reach the race log. Showing the last copy; retrying.');
      // A first request after page load sometimes stalls; retry soon, once.
      if (!retrySoon.current) { retrySoon.current = true; setTimeout(() => { retrySoon.current = false; void load(); }, 2000); }
      return;
    }
    setIntake(a.data as IntakeRow[]); setReturns(b.data as ReturnRow[]); setLoadedAt(new Date()); setError('');
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ intake: a.data, returns: b.data, at: new Date().toISOString() })); } catch { /* memory only */ }
    snapshot(a.data as IntakeRow[], b.data as ReturnRow[]);
    // Self-repair: anything this device logged that the server lacks is re-sent.
    const missing = missingOnServer(a.data as IntakeRow[], readOutbox());
    if (missing.length) { const next = dedupe([...readOutbox(), ...missing]); writeOutbox(next); setOutbox(next); setRepaired(n => n + missing.length); setTimeout(() => void flushRef.current?.(), 500); }
  }, []);

  const flush = useCallback(async () => {
    // A flush older than 40 s is treated as dead rather than blocking forever.
    if (flushing.current && Date.now() - flushStarted.current < 40_000) return;
    flushing.current = true;
    flushStarted.current = Date.now();
    try {
      let ops = dedupe(readOutbox());
      writeOutbox(ops); setOutbox(ops);
      while (ops.length) {
        const { error: err } = await send(ops[0]);
        if (err) { setError(navigator.onLine ? `Not saved yet: ${err.message}. Retrying.` : 'Offline: entries are kept on this phone and sent when back online.'); break; }
        ops = readOutbox().slice(1); writeOutbox(ops); setOutbox(ops);
      }
      if (!ops.length) await load();
    } finally { flushing.current = false; }
  }, [load]);

  useEffect(() => {
    if (!session) return;
    void flush();
    const channel = supabase.channel('race-log')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intake_events' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yard_returns' }, () => void load())
      .subscribe(status => setLiveLink(status === 'SUBSCRIBED'));
    // Backup check in case the live connection drops quietly (old Safari, sleeping Wi-Fi).
    const timer = setInterval(() => void flush(), 15_000);
    const wake = () => { if (!document.hidden) void flush(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => { void supabase.removeChannel(channel); clearInterval(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); };
  }, [session, flush, load]);

  useEffect(() => { flushRef.current = flush; }, [flush]);
  const enqueue = useCallback((...ops: Op[]) => {
    journal(ops); // permanent device record, before anything else
    const next = dedupe([...readOutbox(), ...ops]); writeOutbox(next); setOutbox(next); void flush();
  }, [flush]);

  const records = useMemo(() => toRecords(intake, returns, outbox), [intake, returns, outbox]);
  const finished = useMemo(() => finishedEvent(intake, outbox), [intake, outbox]);
  return { session, authReady, records, intake, returns, pending: outbox.length, loadedAt, error, liveLink, repaired, finished, enqueue, reload: flush };
}
