import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toRecords, type IntakeRow, type Op, type ReturnRow } from '../lib/raceLog';

// Every change goes to a device-local outbox first and is sent from there, so
// a tap made with no signal at the venue is kept and retried, not lost.
const OUTBOX_KEY = 'byu-dash:outbox:v1';
const readOutbox = (): Op[] => { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') as Op[]; } catch { return []; } };
const writeOutbox = (ops: Op[]) => { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops)); } catch { /* Kept in memory. */ } };

async function send(op: Op) {
  if (op.type === 'intake') return supabase.from('intake_events').upsert(op.row, { onConflict: 'id', ignoreDuplicates: true });
  if (op.type === 'undo') return supabase.from('intake_events').update({ deleted_at: op.at }).eq('id', op.id);
  if (op.row.source === 'manual') {
    // A manual return never replaces an official one.
    const { data, error } = await supabase.from('yard_returns').select('source').eq('yard', op.row.yard).maybeSingle();
    if (error) return { error };
    if (data?.source === 'official') return { error: null };
  }
  return supabase.from('yard_returns').upsert({ ...op.row, updated_at: new Date().toISOString() }, { onConflict: 'yard' });
}

export function useRaceLog() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [intake, setIntake] = useState<IntakeRow[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [outbox, setOutbox] = useState<Op[]>(readOutbox);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const flushing = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('intake_events').select('id,yard,at,kind,drink_kind,ml,carbs_g,text,source,deleted_at').order('at'),
      supabase.from('yard_returns').select('yard,finish,lap_ms,source').order('yard'),
    ]);
    if (a.error || b.error) { setError('Could not load the race log. Showing the last copy.'); return; }
    setIntake(a.data as IntakeRow[]); setReturns(b.data as ReturnRow[]); setLoadedAt(new Date()); setError('');
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let ops = readOutbox();
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
      .subscribe();
    // Fallback if the live connection drops quietly (old Safari, sleeping Wi-Fi).
    const timer = setInterval(() => void flush(), 30_000);
    const wake = () => { if (!document.hidden) void flush(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => { void supabase.removeChannel(channel); clearInterval(timer); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); };
  }, [session, flush, load]);

  const enqueue = useCallback((...ops: Op[]) => {
    const next = [...readOutbox(), ...ops]; writeOutbox(next); setOutbox(next); void flush();
  }, [flush]);

  const records = useMemo(() => toRecords(intake, returns, outbox), [intake, returns, outbox]);
  return { session, authReady, records, intake, returns, pending: outbox.length, loadedAt, error, enqueue, reload: flush };
}
