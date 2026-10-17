// Look A: charts as an LED dot-matrix board. Each yard is a column of LED
// pixels; one row is one step (a minute, 5 g, ...). Lit height is the value,
// the plan band glows faintly where unlit, and the current yard is boxed.
export type DotPoint = { yard: number; value: number | null; current?: boolean; unknown?: boolean };

export function DotMatrix({ points, yards, lo, hi, rows, band, hotAbove, ticks, fmt, last, label, h = 260, w = 720 }: {
  points: DotPoint[]; yards: number; lo: number; hi: number; rows: number;
  band?: (yard: number) => [number, number] | null; hotAbove?: (yard: number) => number | null;
  ticks: number[]; fmt: (v: number) => string; last?: string; label: string; h?: number; w?: number;
}) {
  const W = w, L = w < 500 ? 44 : 46, R = last ? 78 : 12, T = 10, B = 30;
  const colW = (W - L - R) / yards, rowH = (h - T - B) / rows;
  const per = colW >= 40 ? 3 : colW >= 22 ? 2 : 1;
  const pitch = Math.min((colW - 4) / per, rowH);
  const r = Math.max(1.6, pitch * 0.36);
  const step = (hi - lo) / rows;
  const byYard = new Map(points.map(p => [p.yard, p]));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (h - T - B);
  const dots: React.ReactNode[] = [];
  for (let yard = 1; yard <= yards; yard++) {
    const p = byYard.get(yard);
    const b = band?.(yard) ?? null;
    const hot = hotAbove?.(yard) ?? null;
    const x0 = L + (yard - 1) * colW + (colW - per * pitch) / 2 + pitch / 2;
    for (let row = 0; row < rows; row++) {
      const v = lo + (row + 0.5) * step; // row centre value
      const lit = p?.value != null && v <= p.value;
      const inBand = b !== null && v >= b[0] && v <= b[1];
      const cls = lit ? (hot !== null && v > hot ? 'dot hot' : 'dot on') : inBand ? 'dot band' : 'dot off';
      const cy = T + (rows - row - 0.5) * rowH;
      for (let c = 0; c < per; c++) dots.push(<circle key={`${yard}-${row}-${c}`} className={p?.current && lit ? `${cls} now` : cls} cx={x0 + c * pitch} cy={cy} r={r} />);
    }
  }
  const lastPoint = [...points].reverse().find(p => p.value != null && !p.current);
  const current = points.find(p => p.current);
  return <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={label}>
    {ticks.map(t => <text key={t} className="dm-tick" x={L - 10} y={y(t) + 6} textAnchor="end">{fmt(t)}</text>)}
    {dots}
    {current && <rect className="dm-cursor" x={L + (current.yard - 1) * colW + 1} y={T - 4} width={colW - 2} height={h - T - B + 8} />}
    {points.filter(p => p.unknown && p.value != null).map(p => <text key={`u${p.yard}`} className="dm-unknown" x={L + (p.yard - 0.5) * colW} y={y(Math.min(hi, p.value!)) - 8} textAnchor="middle">?</text>)}
    {last && lastPoint && <text className="dm-last" x={W - R + 8} y={y(Math.min(hi, lastPoint.value!)) + 8}>{last}</text>}
    {Array.from({ length: yards }, (_, i) => i + 1).filter(n => n === 1 || n % (colW < 30 ? 4 : colW < 45 ? 2 : 1) === 0).map(n => <text key={`x${n}`} className="dm-tick" x={L + (n - 0.5) * colW} y={h - 6} textAnchor="middle">{n}</text>)}
  </svg>;
}
