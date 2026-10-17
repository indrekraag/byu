// Seven-segment LED digits, drawn, as on the race clock in the timing tent.
// Unlit segments stay faintly visible, the way a real LED board reads.
const SEGS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd',
  '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', '—': 'g', ' ': '',
};
const W = 40, H = 70, T = 7, G = 1.5; // digit box, segment thickness, gap
function seg(id: string): string {
  const h = (x: number, y: number, len: number) => `${x},${y} ${x + T / 2},${y - T / 2} ${x + len - T / 2},${y - T / 2} ${x + len},${y} ${x + len - T / 2},${y + T / 2} ${x + T / 2},${y + T / 2}`;
  const v = (x: number, y: number, len: number) => `${x},${y} ${x + T / 2},${y + T / 2} ${x + T / 2},${y + len - T / 2} ${x},${y + len} ${x - T / 2},${y + len - T / 2} ${x - T / 2},${y + T / 2}`;
  const L = T / 2, R = W - T / 2, top = T / 2, mid = H / 2, bot = H - T / 2;
  switch (id) {
    case 'a': return h(L + G, top, R - L - 2 * G);
    case 'g': return h(L + G, mid, R - L - 2 * G);
    case 'd': return h(L + G, bot, R - L - 2 * G);
    case 'f': return v(L, top + G, mid - top - 2 * G);
    case 'b': return v(R, top + G, mid - top - 2 * G);
    case 'e': return v(L, mid + G, bot - mid - 2 * G);
    default: return v(R, mid + G, bot - mid - 2 * G); // c
  }
}
export function Segments({ text, className }: { text: string; className?: string }) {
  const STEP = W + 12, COLON = 18;
  let x = 0;
  const parts = [...text].map((ch, i) => {
    if (ch === ':') { const g = <g key={i} transform={`translate(${x},0)`}><rect className="seg-on" x={COLON / 2 - 3.5} y={H * 0.3 - 3.5} width={7} height={7} /><rect className="seg-on" x={COLON / 2 - 3.5} y={H * 0.7 - 3.5} width={7} height={7} /></g>; x += COLON; return g; }
    const lit = SEGS[ch] ?? '';
    const g = <g key={i} transform={`translate(${x},0) skewX(-6)`}>{'abcdefg'.split('').map(s => <polygon key={s} className={lit.includes(s) ? 'seg-on' : 'seg-off'} points={seg(s)} />)}</g>;
    x += STEP; return g;
  });
  return <svg className={className ? `segments ${className}` : 'segments'} viewBox={`-4 0 ${x} ${H}`} role="img" aria-label={text}>{parts}</svg>;
}
