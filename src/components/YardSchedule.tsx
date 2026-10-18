import { useState } from 'react';
import { RACE } from '../data/raceConfig';
import { lapLog } from '../lib/lapLog';
import { formatClock } from '../lib/raceClock';
import { yardStart, type YardRecord } from '../lib/raceHQ';

// Every yard and when it starts, one row per day. Done yards show their lap
// time (dimmed), the current yard is outlined, milestones are marked.
const MILESTONES: Record<number, string> = { 15: '100 km', 24: 'full day', 28: '2024 finish', 30: '200 km' };
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-GB', { timeZone: RACE.timezone, ...o });

export function YardSchedule({ start, now, current, records }: { start: Date; now: Date; current: number; records: Record<string, YardRecord> }) {
  const [open, setOpen] = useState(false);
  const laps = new Map(lapLog(records, start, now).map(l => [l.yard, l.lapMs]));
  // Through the end of the day 12 yards from now, so the next night is always visible.
  const lastYard = Math.max(36, current + 12);
  const days: { label: string; yards: number[] }[] = [];
  for (let y = 1; y <= lastYard; y++) {
    const label = fmt(yardStart(start, y), { weekday: 'short', day: 'numeric' });
    if (days[days.length - 1]?.label !== label) days.push({ label, yards: [] });
    days[days.length - 1].yards.push(y);
  }
  return <section className="card schedule">
    <button className="fold" aria-expanded={open} onClick={() => setOpen(o => !o)}><h2>Yard schedule</h2><span>{open ? 'Hide' : 'Show'}</span></button>
    {open && <>
      {days.map(d => <div key={d.label} className="sched-day">
        <span className="sched-label">{d.label}</span>
        <div className="sched-chips">{d.yards.map(y => {
          const lap = laps.get(y);
          const cls = ['chip-y', y === current ? 'now' : '', lap !== undefined ? 'done' : '', MILESTONES[y] ? 'mark' : ''].filter(Boolean).join(' ');
          return <div key={y} className={cls} title={MILESTONES[y] ? `Yard ${y}: ${MILESTONES[y]}` : undefined}>
            <b>{y}</b>
            <small>{lap !== undefined ? formatClock(lap) : fmt(yardStart(start, y), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</small>
          </div>;
        })}</div>
      </div>)}
      <p className="sched-legend"><span className="lg now" /> now · <span className="lg done" /> done (lap time) · <span className="lg mark" /> milestone: 15 = 100 km, 24 = full day, 28 = 2024 finish, 30 = 200 km</p>
    </>}
  </section>;
}
