import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export function Login({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
  }
  return <form className={compact ? 'login compact' : 'login'} onSubmit={submit}>
    {!compact && <h2>Crew login</h2>}
    {!compact && <p className="muted">Once per device. It stays logged in for the race.</p>}
    <input type="email" autoComplete="username" placeholder="Crew email" value={email} onChange={e => setEmail(e.target.value)} required />
    <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
    <button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
    {message && <p className="warn">{message}</p>}
  </form>;
}
