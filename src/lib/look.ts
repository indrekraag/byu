// Design looks under comparison on the real devices. ?look=board|sheet|default
// switches and is remembered per device; the log page has the same switch.
export type Look = 'default' | 'board' | 'sheet';
export const LOOKS: { id: Look; label: string }[] = [
  { id: 'default', label: 'Current' },
  { id: 'board', label: 'A · Timing board' },
  { id: 'sheet', label: 'B · Crew sheet' },
];
const KEY = 'byu-dash:look';
const valid = (v: string | null): v is Look => v === 'default' || v === 'board' || v === 'sheet';

export function initialLook(): Look {
  const fromUrl = new URLSearchParams(location.search).get('look');
  if (valid(fromUrl)) { try { localStorage.setItem(KEY, fromUrl); } catch { /* per session */ } return fromUrl; }
  try { const saved = localStorage.getItem(KEY); return valid(saved) ? saved : 'default'; } catch { return 'default'; }
}
export function applyLook(look: Look) {
  document.documentElement.dataset.look = look;
  try { localStorage.setItem(KEY, look); } catch { /* per session */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', look === 'sheet' ? '#2b2925' : look === 'board' ? '#070706' : '#101112');
}
