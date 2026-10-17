import type { IntakePoint, LapPoint } from '../lib/dashData';
import { planBand } from '../lib/dashData';
import { formatClock } from '../lib/raceClock';

// Wall display: nobody touches it, so values are direct-labelled instead of
// living in hover tooltips. All charts share the same yard x-scale.
type Frame = { w: number; h: number; l: number; r: number; t: number; b: number; yards: number };
const xOf = (f: Frame, yard: number) => f.l + (yard - 0.5) * ((f.w - f.l - f.r) / f.yards);
const colW = (f: Frame) => (f.w - f.l - f.r) / f.yards;
const yOf = (f: Frame, v: number, lo: number, hi: number) => f.t + (1 - (v - lo) / (hi - lo)) * (f.h - f.t - f.b);

function topRounded(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function YardAxis({ f }: { f: Frame }) {
  const every = Math.ceil(36 / colW(f)); // keep labels ~36 units apart
  return <g className="axis">
    <line x1={f.l} x2={f.w - f.r} y1={f.h - f.b} y2={f.h - f.b} />
    {Array.from({ length: f.yards }, (_, i) => i + 1).filter(y => y === 1 || y % every === 0 || every === 1).map(y =>
      <text key={y} x={xOf(f, y)} y={f.h - f.b + 22} textAnchor="middle">{y}</text>)}
  </g>;
}

function Grid({ f, ticks, lo, hi, fmt }: { f: Frame; ticks: number[]; lo: number; hi: number; fmt: (v: number) => string }) {
  return <g className="grid">{ticks.map(v => <g key={v}>
    <line x1={f.l} x2={f.w - f.r} y1={yOf(f, v, lo, hi)} y2={yOf(f, v, lo, hi)} />
    <text x={f.l - 8} y={yOf(f, v, lo, hi) + 6} textAnchor="end">{fmt(v)}</text>
  </g>)}</g>;
}

export function LapChart({ laps, yards }: { laps: LapPoint[]; yards: number }) {
  const f: Frame = { w: 720, h: 258, l: 52, r: 74, t: 16, b: 32, yards };
  const minLap = Math.min(...laps.map(p => p.lapMs / 60000), 44);
  const lo = Math.max(0, Math.floor((minLap - 2) / 5) * 5), hi = 60;
  const ticks: number[] = []; for (let v = lo; v <= hi; v += 5) ticks.push(v);
  const y = (min: number) => yOf(f, min, lo, hi);
  const last = laps[laps.length - 1];
  const path = laps.map((p, i) => `${i ? 'L' : 'M'}${xOf(f, p.yard)},${y(p.lapMs / 60000)}`).join('');
  return <svg viewBox={`0 0 ${f.w} ${f.h}`} role="img" aria-label="Lap time per yard against plan band">
    <Grid f={f} ticks={ticks} lo={lo} hi={hi} fmt={v => `${v}`} />
    {Array.from({ length: yards }, (_, i) => i + 1).map(yard => { const b = planBand(yard); const top = y(b.maxMin), bottom = b.minMin === null ? f.h - f.b : y(b.minMin);
      return <rect key={yard} className="band" x={xOf(f, yard) - colW(f) / 2} width={colW(f)} y={top} height={bottom - top} />; })}
    <line className="gun" x1={f.l} x2={f.w - f.r} y1={y(60)} y2={y(60)} />
    <text className="gun-label" x={f.w - f.r + 6} y={y(60) + 6}>start</text>
    <path className="lap-line" d={path} />
    {laps.map(p => <circle key={p.yard} className={p.source === 'official' ? 'lap-dot' : 'lap-dot manual'} cx={xOf(f, p.yard)} cy={y(p.lapMs / 60000)} r={6} />)}
    {last && <text className="value-label" x={Math.min(xOf(f, last.yard) + 12, f.w - f.r + 6)} y={y(last.lapMs / 60000) + 7}>{formatClock(last.lapMs)}</text>}
    <YardAxis f={f} />
  </svg>;
}

export function CarbsPerYard({ points, yards }: { points: IntakePoint[]; yards: number }) {
  const f: Frame = { w: 720, h: 196, l: 52, r: 74, t: 20, b: 32, yards };
  const hi = Math.max(80, Math.ceil((Math.max(0, ...points.map(p => p.carbs)) + 10) / 20) * 20);
  const ticks: number[] = []; for (let v = 0; v <= hi; v += 20) ticks.push(v);
  const y = (v: number) => yOf(f, v, 0, hi);
  const bw = Math.max(4, colW(f) - 6);
  const band = points[0] ?? { carbMin: 50, carbMax: 60 };
  return <svg viewBox={`0 0 ${f.w} ${f.h}`} role="img" aria-label="Carbs per yard against 50 to 60 gram target">
    <Grid f={f} ticks={ticks} lo={0} hi={hi} fmt={v => `${v}`} />
    <rect className="band" x={f.l} width={f.w - f.l - f.r} y={y(band.carbMax)} height={y(band.carbMin) - y(band.carbMax)} />
    <text className="band-label" x={f.w - f.r + 6} y={y((band.carbMin + band.carbMax) / 2) + 6}>{band.carbMin}–{band.carbMax}</text>
    {points.map(p => { const x = xOf(f, p.yard) - bw / 2;
      return <g key={p.yard} className={p.current ? 'current' : undefined}>
        <path className="carb-bar" d={topRounded(x, y(p.carbs), bw, y(0) - y(p.carbs))} />
        {!p.hasEntries && !p.current && <text className="muted-mark" x={xOf(f, p.yard)} y={y(0) - 8} textAnchor="middle">–</text>}
        {p.incomplete && <text className="muted-mark" x={xOf(f, p.yard)} y={y(p.carbs) - 8} textAnchor="middle">?</text>}
      </g>; })}
    <YardAxis f={f} />
  </svg>;
}

export function Cumulative({ points, yards, kind }: { points: IntakePoint[]; yards: number; kind: 'carbs' | 'fluid' }) {
  const f: Frame = { w: 360, h: 186, l: 58, r: 16, t: 20, b: 32, yards };
  const val = (p: IntakePoint) => kind === 'carbs' ? p.cumCarbs : p.cumFluid / 1000;
  const lo = (p: IntakePoint) => kind === 'carbs' ? p.cumCarbMin : p.cumFluidMin / 1000;
  const hiB = (p: IntakePoint) => kind === 'carbs' ? p.cumCarbMax : p.cumFluidMax / 1000;
  const max = Math.max(kind === 'carbs' ? 200 : 1, ...points.map(p => Math.max(val(p), hiB(p))));
  const step = kind === 'carbs' ? (max > 1200 ? 500 : max > 500 ? 200 : 100) : (max > 12 ? 5 : max > 5 ? 2 : 1);
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = []; for (let v = 0; v <= hi; v += step) ticks.push(v);
  const y = (v: number) => yOf(f, v, 0, hi);
  const xEnd = (p: IntakePoint) => xOf(f, p.yard) + colW(f) / 2;
  const startX = f.l;
  const band = points.length ? `M${startX},${y(0)}` + points.map(p => `L${xEnd(p)},${y(hiB(p))}`).join('') + points.slice().reverse().map(p => `L${xEnd(p)},${y(lo(p))}`).join('') + 'Z' : '';
  const line = points.length ? `M${startX},${y(0)}` + points.map(p => `L${xEnd(p)},${y(val(p))}`).join('') : '';
  const last = points[points.length - 1];
  return <svg viewBox={`0 0 ${f.w} ${f.h}`} role="img" aria-label={`Cumulative ${kind} against plan`}>
    <Grid f={f} ticks={ticks} lo={0} hi={hi} fmt={v => kind === 'carbs' ? `${v}` : `${v}`} />
    <path className="band" d={band} />
    <path className={kind === 'carbs' ? 'cum-line carbs' : 'cum-line fluid'} d={line} />
    {last && <circle className={kind === 'carbs' ? 'cum-dot carbs' : 'cum-dot fluid'} cx={xEnd(last)} cy={y(val(last))} r={6} />}
    <YardAxis f={f} />
  </svg>;
}
