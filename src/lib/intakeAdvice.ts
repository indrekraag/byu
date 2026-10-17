import type { IntakeEvent, YardRecord } from './raceHQ';
export type DrinkKind = 'water' | 'varska' | '160' | '320' | 'arctic-greip' | 'arctic-apple' | 'oshee' | 'cido' | 'other';
// Dropdown order: her lap drinks first. (Object key order can't be used: JS
// lists number-like keys such as '160' before the others.)
export const DRINK_ORDER: DrinkKind[] = ['water', 'varska', '160', '320', 'arctic-greip', 'arctic-apple', 'oshee', 'cido', 'other'];
export const DRINKS: Record<DrinkKind, { label: string; carbsPer500?: number }> = {
  water: { label: 'Plain water', carbsPer500: 0 },
  // Värska Originaal: natural mineral water, no sugar.
  varska: { label: 'Värska mineral water', carbsPer500: 0 },
  '160': { label: 'Drink Mix 160 (1 sachet / 500 ml)', carbsPer500: 40 },
  '320': { label: 'Drink Mix 320 (1 sachet / 500 ml)', carbsPer500: 80 },
  'arctic-greip': { label: 'Arctic Sport Greip (regular; check label)', carbsPer500: 33.5 },
  'arctic-apple': { label: 'Arctic Sport Õun · 40% less sugar (check label)', carbsPer500: 20 },
  oshee: { label: 'OSHEE HydroBoost Juicy Lemon · label needed' },
  cido: { label: 'Cido Hydrate / Hydrate+ · label needed' },
  other: { label: 'Other / strength unknown' },
};
// Keep rehearsal / pre-race entries in history without treating them as race intake.
export function raceIntakeRecords(records: Record<string, YardRecord>, start: Date, now: Date): Record<string, YardRecord> {
  return Object.fromEntries(Object.entries(records).map(([yard, record]) => [yard, {
    ...record,
    intake: (record.intake || []).filter(event => Date.parse(event.at) >= start.getTime() && Date.parse(event.at) <= now.getTime()),
  }]));
}
export function drinkEntry(kind: DrinkKind, ml: number, at: string, id: string, labelCarbsPer100?: number): IntakeEvent {
  const product = DRINKS[kind];
  const carbsPer500 = labelCarbsPer100 !== undefined && Number.isFinite(labelCarbsPer100) && labelCarbsPer100 >= 0 ? labelCarbsPer100 * 5 : product.carbsPer500;
  const carbsG = carbsPer500 === undefined ? undefined : Math.round(carbsPer500 * ml / 500 * 100) / 100;
  return { id, at, kind: 'drink', drinkKind: kind, ml, carbsG, text: `Drank ${ml} ml · ${product.label}${labelCarbsPer100 !== undefined ? ` · label ${labelCarbsPer100} g carbs/100 ml` : ''}` };
}
export function recentIntake(records: Record<string, YardRecord>, now: Date, hours: number) {
  const events = Object.values(records).flatMap(r => r.intake || []).filter(e => {
    const age = now.getTime() - Date.parse(e.at);
    return age >= 0 && age <= hours * 3600000;
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { events, ml: events.reduce((sum, e) => sum + (e.ml || 0), 0), knownCarbs: events.reduce((sum, e) => sum + (e.carbsG || 0), 0), unknown: events.some(e => e.carbsG === undefined), drinks: events.filter(e => e.kind === 'drink').length };
}
export function drinkMeaning(event: IntakeEvent, foodLoggedRecently: boolean) {
  if (event.kind !== 'drink') return '';
  if (event.drinkKind === 'water') return `${event.ml} ml water · 0 g carbs. ${foodLoggedRecently ? 'Food also logged; count it before offering more.' : 'Check recent food with Laura. Missing entries ≠ no food.'}`;
  if (event.carbsG !== undefined) return `${event.ml} ml ${DRINKS[event.drinkKind || 'other']?.label || 'drink'} · ${event.carbsG} g carbs. Count with food before adding more; check stomach comfort.`;
  return `${event.ml} ml recorded · carbs unknown. Check the drink label / dilution.`;
}
