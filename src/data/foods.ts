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
// - Orange, raw: 11.8 g carbs/100 g (USDA FDC 169097); medium orange ~131 g in
//   ~10 segments → 4 segments ≈ 52 g ≈ 6.1 g (segment weight estimated).
// - Boiled potatoes: 15 g/100 g (new potatoes, UK PHE; floury up to ~20 g).
// - Mashed potato with milk and butter: 16.8 g/100 g (USDA FDC 168555).
// - Bread + jam: 30 g white bread at 50.6 g/100 g (USDA) = 15.2 g, plus 10 g
//   jam at 68.9 g/100 g (USDA FDC 2710301) = 6.9 g → 22.1 g.
// - Palaleib (bread piece with a slice of ham and pickle): 15 g carbs per
//   piece, the crew's own figure; ham and pickle ≈ 0 g.
// - Caffeine: Maurten Gel 100 CAF 100 = 25 g carbs + 100 mg caffeine (Maurten).
//   Solid C 160 = 50 mg per pack per retailer listings only (unconfirmed).
// - Banana, raw: 22.84 g carbs per 100 g; medium banana 118 g peeled
//   (USDA SR Legacy) → ½ medium banana ≈ 13.5 g.
const POTATO_G = 50;
const POTATO_HALF_CARBS = Math.round(POTATO_G / 2 * 0.15 * 100) / 100;

// Foods with an `amount` are logged as a stepper tile: the amount starts at
// the last one logged for that food and steps by `step` (pieces or a share of
// a portion). Carbs are per piece (count) or per full portion (percent).
export type Amount = { kind: 'count' | 'percent'; step: number; min: number; max: number; start: number };
export type Food = { id: string; label: string; text: string; carbsG?: number; caffeineMg?: number; amount?: Amount; estimate?: boolean };

const GUMMY_CARBS = Math.round(22.3 / 3 * 100) / 100; // 3 gummies = 22.3 g (her crew plan)

export const FOODS: Food[] = [
  { id: 'gel', label: 'Gel', text: '1 regular Maurten Gel 100 (non-caffeinated)', carbsG: 25 },
  { id: 'caf-gel', label: 'CAF gel', text: 'Maurten Gel 100 CAF 100', carbsG: 25, caffeineMg: 100 },
  { id: 'gummies', label: 'Gummies', text: 'Party Fred gummies', carbsG: GUMMY_CARBS, amount: { kind: 'count', step: 1, min: 1, max: 20, start: 3 } },
  { id: 'palaleib', label: 'Palaleib + ham', text: 'palaleib with ham and pickle', carbsG: 15, amount: { kind: 'count', step: 1, min: 1, max: 6, start: 1 } },
  { id: 'potato-half', label: 'Potato halves', text: 'small potato halves', carbsG: POTATO_HALF_CARBS, estimate: true, amount: { kind: 'count', step: 1, min: 1, max: 12, start: 2 } },
  { id: 'solid-c', label: 'Solid C 160', text: 'Maurten Solid C 160', carbsG: 40, caffeineMg: 50, amount: { kind: 'percent', step: 0.1, min: 0.1, max: 1, start: 0.5 } },
  { id: 'foodpack', label: 'Chicken & noodles', text: 'Tactical Foodpack chicken & noodles (514 kcal portion)', carbsG: 56, amount: { kind: 'percent', step: 0.1, min: 0.1, max: 1, start: 0.5 } },
  { id: 'banana', label: '½ banana', text: '½ banana, cut into 3 bite-size pieces', carbsG: 13.5 },
  { id: 'orange', label: '4 orange segments', text: '4 peeled orange segments', carbsG: 6.1, estimate: true },
  { id: 'potatoes', label: 'Potatoes 100 g', text: '100 g cooked boiled potatoes in 1 bowl', carbsG: 15 },
  { id: 'mash', label: 'Mash 100 g', text: '100 g prepared familiar mash in 1 bowl', carbsG: 16.8 },
  { id: 'bread', label: 'Bread + jam', text: '30 g white bread + 10 g familiar smooth jam', carbsG: 22.1 },
];

export const PRESET_TEXTS = new Set(FOODS.map(f => f.text));

/** Entry text and carbs for an amount of a food (pieces, or share of a portion). */
export function portionOf(food: Food, factor: number): { text: string; carbsG?: number } {
  const carbsG = food.carbsG === undefined ? undefined : Math.round(food.carbsG * factor * 10) / 10;
  if (food.id === 'potato-half') return { text: `${factor} ${factor === 1 ? 'small potato half' : 'small potato halves'}`, carbsG };
  if (food.amount?.kind === 'count') return { text: `${factor} × ${food.text}`, carbsG };
  if (factor === 1) return { text: food.text, carbsG };
  return { text: `${food.text} · ${Math.round(factor * 100)}%`, carbsG };
}

/** The amount in a logged entry's text for this food, or null if it is another food. */
export function amountIn(food: Food, entryText: string): number | null {
  const t = entryText.replace('Ate prepared food: ', '').trim();
  const esc = food.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (food.id === 'potato-half') { const m = /^(\d+) small potato hal(f|ves)$/.exec(t); return m ? Number(m[1]) : null; }
  if (food.amount?.kind === 'count') {
    const m = new RegExp(`^(\\d+)( ×)? ${esc}$`).exec(t); // "4 × Party Fred gummies", older "3 Party Fred gummies"
    return m ? Number(m[1]) : null;
  }
  if (t === food.text) return 1;
  const m = new RegExp(`^${esc} · (\\d+)%$`).exec(t);
  return m ? Number(m[1]) / 100 : null;
}

// Lap bottle: 250 ml of plain water on every loop. One tap on her return says
// what came BACK; the app logs what she drank (water).
export const LAP_BOTTLE_ML = 250;
export const LAP_BOTTLE_LEFT: { label: string; left: number }[] = [
  { label: 'Empty', left: 0 }, { label: '¼ left', left: 0.25 }, { label: '½ left', left: 0.5 }, { label: '¾ left', left: 0.75 },
];
export const lapBottleDrunk = (left: number) => Math.round(LAP_BOTTLE_ML * (1 - left));
// Station drinks: stepper in 50 ml steps, starting at the last amount logged
// for that drink.
export const DRINK_STEP = { step: 50, min: 50, max: 750, start: 150 };

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
  { text: 'Stomach', tag: 'GI' }, { text: 'Headache', tag: 'Head' }, { text: 'Feet', tag: 'Feet' }, { text: 'Tired', tag: 'Tired' }, { text: 'Low mood', tag: 'Mood' },
  { text: 'Cold', tag: 'Cold' }, { text: 'Hot', tag: 'Hot' }, { text: 'Nap', tag: 'Nap' }, { text: 'Toilet', tag: 'WC' },
];
export const noteTag = (text: string) => NOTES.find(n => n.text === text)?.tag ?? text.slice(0, 5);
