// Food buttons on the log page. Carbs are per full portion; a food with
// `portions` asks how much was eaten before it is logged. Unknown carbs stay
// undefined (shown as "?" and never counted as zero).
//
// Sources (checked 2026-10-17):
// - Maurten Gel 100 = 25 g, 3 Party Fred gummies = 22.3 g: Laura's crew plan.
// - Maurten Solid C 160: 40 g carbs per pack (two 20 g mini-bars), retailer
//   listings of the Maurten table (trail.nl, bikable.com, blacktoerunning.com).
// - Tactical Foodpack Chicken and Noodles, 514 kcal portion (110 g pack):
//   56 g carbs per portion (sportano.com nutrition table). The 115 g pack is
//   550 kcal / 53 g: check the label if the pack differs.
// - Small new potato: boiled with skin ≈ 15 g carbs per 100 g (UK PHE data via
//   caloriecounter.com.au). Weight ASSUMED 50 g per potato → ½ ≈ 3.75 g.
//   Replace POTATO_G with a weighed potato when possible.
// - Palaleib (bread piece with a slice of ham and pickle): 15 g carbs per
//   piece, the crew's own figure; ham and pickle ≈ 0 g.
// - Caffeine: Maurten Gel 100 CAF 100 = 25 g carbs + 100 mg caffeine (Maurten).
//   Solid C 160 = 50 mg per pack per retailer listings only (unconfirmed).
// - Banana, raw: 22.84 g carbs per 100 g; medium banana 118 g peeled
//   (USDA SR Legacy) → ½ medium banana ≈ 13.5 g.
const POTATO_G = 50;
const POTATO_HALF_CARBS = Math.round(POTATO_G / 2 * 0.15 * 100) / 100;

export type Portion = { label: string; factor: number };
export type Food = { id: string; label: string; text: string; carbsG?: number; caffeineMg?: number; portions?: Portion[]; count?: boolean; stepper?: number; estimate?: boolean };

export const FOODS: Food[] = [
  { id: 'gel', label: 'Gel', text: '1 regular Maurten Gel 100 (non-caffeinated)', carbsG: 25 },
  { id: 'gummies', label: '3 gummies', text: '3 Party Fred gummies', carbsG: 22.3 },
  { id: 'caf-gel', label: 'CAF gel', text: 'Maurten Gel 100 CAF 100', carbsG: 25, caffeineMg: 100 },
  { id: 'solid-c', label: 'Solid C 160', text: 'Maurten Solid C 160', carbsG: 40, caffeineMg: 50, portions: [{ label: '20%', factor: 0.2 }, { label: '50%', factor: 0.5 }, { label: 'Full', factor: 1 }] },
  { id: 'palaleib', label: 'Palaleib + ham', text: 'palaleib with ham and pickle', carbsG: 15, count: true, portions: [1, 2, 3, 4].map(n => ({ label: `${n}`, factor: n })) },
  { id: 'potato-half', label: 'Small potato halves', text: 'small potato halves', carbsG: POTATO_HALF_CARBS, estimate: true, portions: [1, 2, 3, 4, 6, 8].map(n => ({ label: `${n}`, factor: n })) },
  { id: 'foodpack', label: 'Chicken & noodles', text: 'Tactical Foodpack chicken & noodles (514 kcal portion)', carbsG: 56, stepper: 0.1 },
  { id: 'banana', label: '½ banana', text: '½ banana, cut into 3 bite-size pieces', carbsG: 13.5 },
  { id: 'orange', label: '4 orange segments', text: '4 peeled orange segments' },
  { id: 'potatoes', label: 'Potatoes 100 g', text: '100 g cooked boiled potatoes in 1 bowl' },
  { id: 'mash', label: 'Mash 100 g', text: '100 g prepared familiar mash in 1 bowl' },
  { id: 'bread', label: 'Bread + jam', text: '30 g white bread + 10 g familiar smooth jam' },
];

export const PRESET_TEXTS = new Set(FOODS.map(f => f.text));

/** Entry text and carbs for a portion of a food. */
export function portionOf(food: Food, factor: number): { text: string; carbsG?: number } {
  const carbsG = food.carbsG === undefined ? undefined : Math.round(food.carbsG * factor * 10) / 10;
  if (food.id === 'potato-half') return { text: `${factor} ${factor === 1 ? 'small potato half' : 'small potato halves'}`, carbsG };
  if (food.count) return { text: `${factor} × ${food.text}`, carbsG };
  if (factor === 1) return { text: food.text, carbsG };
  return { text: `${food.text} · ${Math.round(factor * 100)}%`, carbsG };
}

// Drink amounts: 100 ml steps, plus the 250 ml lap bottle she carries on the
// loop (water or Värska) and nearly always brings back empty; log it on return.
export const DRINK_AMOUNTS: { ml: number; label: string }[] = [
  { ml: 100, label: '+100 ml' }, { ml: 250, label: 'Lap bottle 250' }, { ml: 200, label: '+200 ml' },
  { ml: 300, label: '+300 ml' }, { ml: 400, label: '+400 ml' }, { ml: 500, label: '+500 ml' },
];

/** Caffeine in a logged food entry, from the catalogue (portion-aware). */
export function caffeineOf(text: string): number {
  const t = text.replace('Ate prepared food: ', '');
  const food = FOODS.find(f => f.caffeineMg && (t === f.text || t.startsWith(`${f.text} · `)));
  if (!food?.caffeineMg) return 0;
  const pct = /· (\d+)%$/.exec(t);
  return Math.round(food.caffeineMg * (pct ? Number(pct[1]) / 100 : 1));
}

// One-tap notes per yard; short tag is what the lap chart shows.
export const NOTES: { text: string; tag: string }[] = [
  { text: 'Stomach', tag: 'GI' }, { text: 'Feet', tag: 'Feet' }, { text: 'Tired', tag: 'Tired' }, { text: 'Low mood', tag: 'Mood' },
  { text: 'Cold', tag: 'Cold' }, { text: 'Hot', tag: 'Hot' }, { text: 'Nap', tag: 'Nap' }, { text: 'Toilet', tag: 'WC' },
];
export const noteTag = (text: string) => NOTES.find(n => n.text === text)?.tag ?? text.slice(0, 5);
