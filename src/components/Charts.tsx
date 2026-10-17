import { useEffect, useRef, type ReactNode } from 'react';
import type { IntakePoint, LapPoint } from '../lib/dashData';
import { planBand } from '../lib/dashData';
import { formatClock } from '../lib/raceClock';

// Wall display: nobody touches it, so values are direct-labelled instead of
// living in hover tooltips. All charts share the same yard x-scale.
// `modern` = the refined looks: smooth curves, soft area fills, pill bars in
// tracks and a pill badge on the latest value. Off = the original look.
type Frame = { w: number; h: number; l: number; r: number; t: number; b: number; yards: number };
// Past VISIBLE yards a chart keeps its column width and grows wider than its
// card; the card scrolls sideways (see ChartFrame).
const VISIBLE = 12;
function frame(base: number, h: number, l: number, r: number, t: number, b: number, yards: number): Frame {
  const col = (base - l - r) / VISIBLE;
  return { w: yards > VISIBLE ? l + r + col * yards : base, h, l, r, t, b, yards };
}

/** Renders a chart; when it is wider than its card, scrolls sideways with the
 *  y-axis labels pinned, and follows the newest yard unless scrolled back. */
function ChartFrame({ f, base, label, ticks, lo, hi, fmt, children }: { f: Frame; base: number; label: string; ticks: number[]; lo: number; hi: number; fmt: (v: number) => string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const wide = f.w > base;
  useEffect(() => {
    const el = box.current;
    if (el && wide && follow.current) el.scrollLeft = el.scrollWidth;
  });
  if (!wide) return <svg viewBox={`0 0 ${f.w} ${f.h}`} role="img" aria-label={label}>{children}</svg>;
  return <div className="chart-wrap">
    <div className="chart-scroll" ref={box} onScroll={e => { const el = e.currentTarget; follow.current = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8; }}>
      <svg viewBox={`0 0 ${f.w} ${f.h}`} style={{ width: `${f.w / base * 100}%` }} role="img" aria-label={label}>{children}</svg>
    </div>
    <svg className="y-pin" viewBox={`0 0 ${f.l} ${f.h}`} style={{ width: `${f.l / base * 100}%` }} aria-hidden="true">
      <rect className="y-pin-bg" x="0" y="0" width={f.l} height={f.h} />
      <g className="grid">{ticks.map(v => <text key={v} x={f.l - 8} y={yOf(f, v, lo, hi) + 6} textAnchor="end">{fmt(v)}</text>)}</g>
    </svg>
  </div>;
}

const xOf = (f: Frame, yard: number) => f.l + (yard - 0.5) * ((f.w - f.l - f.r) / f.yards);
const colW = (f: Frame) => (f.w - f.l - f.r) / f.yards;
const yOf = (f: Frame, v: number, lo: number, hi: number) => f.t + (1 - (v - lo) / (hi - lo)) * (f.h - f.t - f.b);

function topRounded(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Monotone cubic (Fritsch–Carlson): smooth, but never overshoots a data point. */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
  const n = pts.length, d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let path = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = (x1 - x0) / 3;
    path += `C${x0 + dx},${y0 + m[i] * dx} ${x1 - dx},${y1 - m[i + 1] * dx} ${x1},${y1}`;
  }
  return path;
}

function Badge({ x, y, text, cls }: { x: number; y: number; text: string; cls: string }) {
  const w = text.length * 12 + 20;
  return <g className={`badge ${cls}`}><rect x={x} y={y - 16} width={w} height={32} rx={16} /><text x={x + w / 2} y={y + 7} textAnchor="middle">{text}</text></g>;
}

function Defs() {
  return <defs>
    <linearGradient id="g-lap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="stop-lap-a" /><stop offset="1" className="stop-lap-b" /></linearGradient>
    <linearGradient id="g-carbs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="stop-carbs-a" /><stop offset="1" className="stop-carbs-b" /></linearGradient>
    <linearGradient id="g-carbs-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="stop-carbs-area-a" /><stop offset="1" className="stop-area-b" /></linearGradient>
    <linearGradient id="g-fluid-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="stop-fluid-area-a" /><stop offset="1" className="stop-area-b" /></linearGradient>
  </defs>;
}

// Every yard number is shown; the type shrinks with the column. Only when a
// column is too narrow even for small type (a long race on the small charts)
// does it fall back to every second yard.
function YardAxis({ f }: { f: Frame }) {
  const w = colW(f), widest = String(f.yards).length;
  const size = Math.min(16, (w - 2) / (0.62 * widest));
  const every = size >= 9 ? 1 : 2;
  const fs = Math.max(size, 9);
  return <g className="axis">
    <line x1={f.l} x2={f.w - f.r} y1={f.h - f.b} y2={f.h - f.b} />
    {Array.from({ length: f.yards }, (_, i) => i + 1).filter(y => every === 1 || y % every === 0 || y === 1).map(y =>
      <text key={y} x={xOf(f, y)} y={f.h - f.b + 22} textAnchor="middle" style={{ fontSize: `${fs}px` }}>{y}</text>)}
  </g>;
}

function Grid({ f, ticks, lo, hi, fmt }: { f: Frame; ticks: number[]; lo: number; hi: number; fmt: (v: number) => string }) {
  return <g className="grid">{ticks.map(v => <g key={v}>
    <line x1={f.l} x2={f.w - f.r} y1={yOf(f, v, lo, hi)} y2={yOf(f, v, lo, hi)} />
    <text x={f.l - 8} y={yOf(f, v, lo, hi) + 6} textAnchor="end">{fmt(v)}</text>
  </g>)}</g>;
}

export function LapChart({ laps, yards, modern = false, extra = 0, tags = {} }: { laps: LapPoint[]; yards: number; modern?: boolean; extra?: number; tags?: Record<number, string[]> }) {
  const f = frame(720, 206 + extra, 52, modern ? 96 : 74, 16, 32, yards); // 20% shorter than before
  const minLap = Math.min(...laps.map(p => p.lapMs / 60000), 44);
  const lo = Math.max(0, Math.floor((minLap - 2) / 5) * 5), hi = 60;
  const ticks: number[] = []; for (let v = lo; v <= hi; v += 5) ticks.push(v);
  const y = (min: number) => yOf(f, min, lo, hi);
  const last = laps[laps.length - 1];
  const pts = laps.map(p => [xOf(f, p.yard), y(p.lapMs / 60000)] as [number, number]);
  const line = modern ? smoothPath(pts) : pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
  const area = modern && pts.length > 1 ? `${line}L${pts[pts.length - 1][0]},${f.h - f.b}L${pts[0][0]},${f.h - f.b}Z` : '';
  return <ChartFrame f={f} base={720} label="Lap time per yard against plan band" ticks={ticks} lo={lo} hi={hi} fmt={v => `${v}`}>
    <Defs />
    <Grid f={f} ticks={ticks} lo={lo} hi={hi} fmt={v => `${v}`} />
    {Array.from({ length: yards }, (_, i) => i + 1).map(yard => { const b = planBand(yard); const top = y(b.maxMin), bottom = b.minMin === null ? f.h - f.b : y(b.minMin);
      return <rect key={yard} className="band" x={xOf(f, yard) - colW(f) / 2} width={colW(f)} y={top} height={bottom - top} />; })}
    <line className="gun" x1={f.l} x2={f.w - f.r} y1={y(60)} y2={y(60)} />
    <text className="gun-label" x={f.w - f.r + 6} y={y(60) + 6}>start</text>
    {area && <path className="lap-area" d={area} />}
    <path className="lap-line" d={line} />
    {laps.map(p => <circle key={p.yard} className={p.source === 'official' ? 'lap-dot' : 'lap-dot manual'} cx={xOf(f, p.yard)} cy={y(p.lapMs / 60000)} r={modern && p !== last ? 4.5 : 6} />)}
    {Object.entries(tags).map(([yd, list]) => list.slice(0, 3).map((t, i) => <g key={`${yd}-${t}`} className="note-tag">
      <rect x={xOf(f, Number(yd)) - 25} y={f.h - f.b - 26 - i * 22} width={50} height={19} rx={9.5} />
      <text x={xOf(f, Number(yd))} y={f.h - f.b - 12 - i * 22} textAnchor="middle">{t}</text>
    </g>))}
    {last && (modern
      ? <Badge cls="badge-lap" x={Math.min(xOf(f, last.yard) + 14, f.w - f.r + 4)} y={y(last.lapMs / 60000)} text={formatClock(last.lapMs)} />
      : <text className="value-label" x={Math.min(xOf(f, last.yard) + 12, f.w - f.r + 6)} y={y(last.lapMs / 60000) + 7}>{formatClock(last.lapMs)}</text>)}
    <YardAxis f={f} />
  </ChartFrame>;
}

export function CarbsPerYard({ points, yards, modern = false, selected, onSelect, extra = 0 }: { points: IntakePoint[]; yards: number; modern?: boolean; selected?: number | null; onSelect?: (yard: number) => void; extra?: number }) {
  const f = frame(720, 196 + extra, 52, 74, modern ? 30 : 20, 32, yards);
  const hi = Math.max(80, Math.ceil((Math.max(0, ...points.map(p => p.carbs)) + 10) / 20) * 20);
  const ticks: number[] = []; for (let v = 0; v <= hi; v += 20) ticks.push(v);
  const y = (v: number) => yOf(f, v, 0, hi);
  const bw = modern ? Math.max(4, Math.min(44, colW(f) * 0.7)) : Math.max(4, colW(f) - 6);
  const band = points[0] ?? { carbMin: 50, carbMax: 60 };
  return <ChartFrame f={f} base={720} label="Carbs per yard against 50 to 60 gram target" ticks={ticks} lo={0} hi={hi} fmt={v => `${v}`}>
    <Defs />
    <Grid f={f} ticks={ticks} lo={0} hi={hi} fmt={v => `${v}`} />
    <rect className="band" x={f.l} width={f.w - f.l - f.r} y={y(band.carbMax)} height={y(band.carbMin) - y(band.carbMax)} rx={modern ? 4 : 0} />
    <text className="band-label" x={f.w - f.r + 6} y={y((band.carbMin + band.carbMax) / 2) + 6}>{band.carbMin}–{band.carbMax}</text>
    {points.map(p => { const x = xOf(f, p.yard) - bw / 2; const top = y(p.carbs), height = y(0) - top;
      const label = p.hasEntries || (p.current && p.carbs > 0) ? `${Math.round(p.carbs)}${p.incomplete ? '+?' : ''}` : '';
      // Wide bars, no tracks, gram value on top (the owner's pick, 2026-10-17).
      const bars = <path className="carb-bar" d={topRounded(x, top, bw, height, modern ? 8 : 4)} />;
      return <g key={p.yard} className={[p.current ? 'current' : '', selected === p.yard ? 'selected' : ''].join(' ').trim() || undefined}>
        {bars}
        {!p.hasEntries && !p.current && <text className="muted-mark" x={xOf(f, p.yard)} y={y(0) - 8} textAnchor="middle">–</text>}
        {modern ? label && <text className={p.carbs >= p.carbMin ? 'bar-value hit' : 'bar-value'} x={xOf(f, p.yard)} y={top - 8} textAnchor="middle">{label}</text>
          : p.incomplete && <text className="muted-mark" x={xOf(f, p.yard)} y={top - 8} textAnchor="middle">?</text>}
      </g>; })}
    <YardAxis f={f} />
    {/* Tap targets: the whole column, bigger than the bar. */}
    {onSelect && points.map(p => <rect key={`hit${p.yard}`} className="hit" x={xOf(f, p.yard) - colW(f) / 2} y={f.t - 20} width={colW(f)} height={f.h - f.t + 20} onClick={() => onSelect(p.yard)} />)}
  </ChartFrame>;
}

/** Running total vs plan. `points` = finished yards (the actual line stops
 *  there); `plan` = every yard through the current one, for the target path. */
export function Cumulative({ points, plan = points, yards, kind, modern = false }: { points: IntakePoint[]; plan?: IntakePoint[]; yards: number; kind: 'carbs' | 'fluid'; modern?: boolean }) {
  const f = frame(360, 186, 58, 16, 20, 32, yards);
  const val = (p: IntakePoint) => kind === 'carbs' ? p.cumCarbs : p.cumFluid / 1000;
  const lo = (p: IntakePoint) => kind === 'carbs' ? p.cumCarbMin : p.cumFluidMin / 1000;
  const hiB = (p: IntakePoint) => kind === 'carbs' ? p.cumCarbMax : p.cumFluidMax / 1000;
  const max = Math.max(kind === 'carbs' ? 200 : 1, ...points.map(val), ...plan.map(hiB));
  const step = kind === 'carbs' ? (max > 1200 ? 500 : max > 500 ? 200 : 100) : (max > 12 ? 5 : max > 5 ? 2 : 1);
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = []; for (let v = 0; v <= hi; v += step) ticks.push(v);
  const y = (v: number) => yOf(f, v, 0, hi);
  const xEnd = (p: IntakePoint) => xOf(f, p.yard) + colW(f) / 2;
  const startX = f.l;
  const band = plan.length ? `M${startX},${y(0)}` + plan.map(p => `L${xEnd(p)},${y(hiB(p))}`).join('') + plan.slice().reverse().map(p => `L${xEnd(p)},${y(lo(p))}`).join('') + 'Z' : '';
  // Target path: the middle of the plan band, through the current yard.
  const target = plan.length ? `M${startX},${y(0)}` + plan.map(p => `L${xEnd(p)},${y((lo(p) + hiB(p)) / 2)}`).join('') : '';
  const lastPlan = plan[plan.length - 1];
  const pts: [number, number][] = [[startX, y(0)], ...points.map(p => [xEnd(p), y(val(p))] as [number, number])];
  const line = points.length ? (modern ? smoothPath(pts) : pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('')) : '';
  const area = modern && points.length ? `${line}L${pts[pts.length - 1][0]},${y(0)}L${startX},${y(0)}Z` : '';
  const last = points[points.length - 1];
  return <ChartFrame f={f} base={360} label={`Cumulative ${kind} against plan`} ticks={ticks} lo={0} hi={hi} fmt={v => `${v}`}>
    <Defs />
    <Grid f={f} ticks={ticks} lo={0} hi={hi} fmt={v => `${v}`} />
    <path className="band cum-band" d={band} />
    <path className={kind === 'carbs' ? 'target carbs' : 'target fluid'} d={target} />
    {lastPlan && <text className="target-label" x={xEnd(lastPlan) - 4} y={y((lo(lastPlan) + hiB(lastPlan)) / 2) - 8} textAnchor="end">target {kind === 'carbs' ? Math.round((lo(lastPlan) + hiB(lastPlan)) / 2) : ((lo(lastPlan) + hiB(lastPlan)) / 2).toFixed(1)}</text>}
    {area && <path className={kind === 'carbs' ? 'cum-area carbs' : 'cum-area fluid'} d={area} />}
    <path className={kind === 'carbs' ? 'cum-line carbs' : 'cum-line fluid'} d={line} />
    {last && <circle className={kind === 'carbs' ? 'cum-dot carbs' : 'cum-dot fluid'} cx={xEnd(last)} cy={y(val(last))} r={6} />}
    <YardAxis f={f} />
  </ChartFrame>;
}
