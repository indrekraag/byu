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
// - Banana, raw: 22.84 g carbs per 100 g; medium banana 118 g peeled
//   (USDA SR Legacy) → ½ medium banana ≈ 13.5 g.
const POTATO_G = 50;
const POTATO_HALF_CARBS = Math.round(POTATO_G / 2 * 0.15 * 100) / 100;

export type Portion = { label: string; factor: number };
export type Food = { id: string; label: string; text: string; carbsG?: number; portions?: Portion[]; stepper?: number; estimate?: boolean };

export const FOODS: Food[] = [
  { id: 'gel', label: 'Gel', text: '1 regular Maurten Gel 100 (non-caffeinated)', carbsG: 25 },
  { id: 'gummies', label: '3 gummies', text: '3 Party Fred gummies', carbsG: 22.3 },
  { id: 'solid-c', label: 'Solid C 160', text: 'Maurten Solid C 160', carbsG: 40, portions: [{ label: '20%', factor: 0.2 }, { label: '50%', factor: 0.5 }, { label: 'Full', factor: 1 }] },
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
  if (factor === 1) return { text: food.text, carbsG };
  return { text: `${food.text} · ${Math.round(factor * 100)}%`, carbsG };
}

// Drink amounts: 100 ml steps, plus the 250 ml lap bottle she carries on the
// loop (water or Värska) and nearly always brings back empty; log it on return.
export const DRINK_AMOUNTS: { ml: number; label: string }[] = [
  { ml: 100, label: '+100 ml' }, { ml: 250, label: 'Lap bottle 250' }, { ml: 200, label: '+200 ml' },
  { ml: 300, label: '+300 ml' }, { ml: 400, label: '+400 ml' }, { ml: 500, label: '+500 ml' },
];
