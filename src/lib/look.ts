// Design looks under comparison on the real devices. ?look=charcoal|glass|fitness
// switches and is remembered per device; the log page has the same switch.
export type Look = 'default' | 'charcoal' | 'glass' | 'fitness';
export const LOOKS: { id: Look; label: string }[] = [
  { id: 'default', label: 'Current' },
  { id: 'charcoal', label: '1 · Charcoal' },
  { id: 'glass', label: '2 · Glass' },
  { id: 'fitness', label: '3 · Fitness' },
];
const KEY = 'byu-dash:look';
const valid = (v: string | null): v is Look => LOOKS.some(l => l.id === v);
const THEME: Record<Look, string> = { default: '#101112', charcoal: '#1b1c1f', glass: '#0b1024', fitness: '#000000' };

export function initialLook(): Look {
  const fromUrl = new URLSearchParams(location.search).get('look');
  if (valid(fromUrl)) { try { localStorage.setItem(KEY, fromUrl); } catch { /* per session */ } return fromUrl; }
  try { const saved = localStorage.getItem(KEY); return valid(saved) ? saved : 'default'; } catch { return 'default'; }
}
export function applyLook(look: Look) {
  document.documentElement.dataset.look = look;
  try { localStorage.setItem(KEY, look); } catch { /* per session */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME[look]);
}
