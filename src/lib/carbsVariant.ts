import type { CarbsVariant } from '../components/Charts';

// Temporary: three carbs-chart options under comparison. ?carbs=wide|status|split
// or the buttons on the log page; remembered per device.
export const CARBS_VARIANTS: { id: CarbsVariant; label: string }[] = [
  { id: 'wide', label: '1 · Wide' },
  { id: 'status', label: '2 · On plan' },
  { id: 'split', label: '3 · Food + drink' },
];
const KEY = 'byu-dash:carbs-chart';
const valid = (v: string | null): v is CarbsVariant => CARBS_VARIANTS.some(c => c.id === v);
export function initialCarbsVariant(): CarbsVariant {
  const fromUrl = new URLSearchParams(location.search).get('carbs');
  if (valid(fromUrl)) { try { localStorage.setItem(KEY, fromUrl); } catch { /* per session */ } return fromUrl; }
  try { const v = localStorage.getItem(KEY); return valid(v) ? v : 'wide'; } catch { return 'wide'; }
}
export function saveCarbsVariant(v: CarbsVariant) { try { localStorage.setItem(KEY, v); } catch { /* per session */ } }
