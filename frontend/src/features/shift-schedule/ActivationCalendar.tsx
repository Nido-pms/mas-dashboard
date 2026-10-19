import { useMemo, useState } from 'react';
import Card from '../../components/Card';
import CalendarGrid from '../../components/charts/CalendarGrid';
import { dateRange, dayMonth, shortNames, weekday } from '../../components/charts/kit';
import { addDays, fmt, shiftName, today } from '../../utils/format';

const ON = '#40c463', OFF = '#e34948', SOME = '#eda100';
const PERIODS = [
  { id: 'around', label: 'Last 6 months + next 3', back: 182, ahead: 91 },
  { id: 'past', label: 'Last 12 months', back: 364, ahead: 0 },
  { id: 'next', label: 'Next 6 months', back: 0, ahead: 182 },
];

type Status = 'on' | 'off' | 'some';
const COLOR: Record<Status, string> = { on: ON, off: OFF, some: SOME };

interface Props {
  shifts: string[];
  machines: string[];
  isActive: (date: string, shift: string, machine: string) => boolean;
  changedDates: Set<string>;               // dates with a change on the "Changes for a date" card
  selected: string;                        // the date open on that card
  onPick: (date: string) => void;
}

/** Calendar of the schedule: each day split into one stripe per shift, green when it runs and red when it is switched off. */
export default function ActivationCalendar({ shifts, machines, isActive, changedDates, selected, onPick }: Props) {
  const [period, setPeriod] = useState('around');
  const [machine, setMachine] = useState('All');
  const [shift, setShift] = useState('All');

  const p = PERIODS.find((x) => x.id === period) ?? PERIODS[0];
  const now = today();
  const dates = useMemo(() => dateRange(addDays(now, -p.back), addDays(now, p.ahead)), [now, p.back, p.ahead]);
  const shown = useMemo(() => (shift === 'All' ? shifts : [shift]), [shift, shifts]);
  const pool = useMemo(() => (machine === 'All' ? machines : [machine]), [machine, machines]);
  const short = shortNames(machines);

  /** Per date and shift: runs on every selected machine, on none, or on some. */
  const status = useMemo(() => {
    const out = new Map<string, Status[]>();
    for (const d of dates) {
      out.set(d, shown.map((s) => {
        const n = pool.filter((m) => isActive(d, s, m)).length;
        return n === pool.length ? 'on' : n === 0 ? 'off' : 'some';
      }));
    }
    return out;
  }, [dates, shown, pool, isActive]);

  const stats = useMemo(() => {
    let on = 0, off = 0, part = 0;
    for (const st of status.values()) {
      if (st.every((s) => s === 'on')) on += 1;
      else if (st.every((s) => s === 'off')) off += 1;
      else part += 1;
    }
    return { on, off, part };
  }, [status]);

  const scope = shift === 'All' ? 'every shift' : shiftName(shift);
  const someUsed = machine === 'All' && machines.length > 1;
  return (
    <Card title="Shift calendar" icon="fa-calendar-alt" bodyClassName="p-0"
          footer={<span className="small text-muted">
            One square per day{shown.length > 1 ? `, split into one stripe per shift (${shown.map(shiftName).join(' on top, ')} below)` : ''}.
            Green = the shift runs, red = switched off{someUsed ? ', amber = runs on some machines only' : ''}. A dot marks a date with its own
            change. Black outline = today, blue = the date open under "Changes for a date"; click a day to open it there.
          </span>}>
      <div className="abn-toolbar">
        <select className="form-control form-control-sm" style={{ maxWidth: 210 }} aria-label="Period" value={period}
                onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select className="form-control form-control-sm" style={{ maxWidth: 200 }} aria-label="Machine" value={machine}
                onChange={(e) => setMachine(e.target.value)}>
          <option value="All">All machines</option>
          {machines.map((m) => <option key={m} value={m} title={m}>{short.get(m) ?? m}</option>)}
        </select>
        <select className="form-control form-control-sm" style={{ maxWidth: 170 }} aria-label="Shift" value={shift}
                onChange={(e) => setShift(e.target.value)}>
          <option value="All">All shifts</option>
          {shifts.map((s) => <option key={s} value={s}>{shiftName(s)}</option>)}
        </select>
      </div>

      <div className="heat-stats">
        <span><b>{fmt(stats.on)}</b> days {scope} active</span>
        {(shown.length > 1 || someUsed) && <span><b>{fmt(stats.part)}</b> days partly active</span>}
        <span className={stats.off ? 'text-danger' : ''}><b>{fmt(stats.off)}</b> days {scope} inactive</span>
      </div>

      <CalendarGrid
        dates={dates}
        scrollTo={now}
        maxStep={28}
        onPick={onPick}
        label={`Shift activation per day, ${scope}, ${dayMonth(dates[0])} to ${dayMonth(dates[dates.length - 1])}`}
        cell={(date, { x, y, size }) => {
          const st = status.get(date) ?? [];
          const gap = st.length > 1 ? 1 : 0;
          const h = (size - gap * (st.length - 1)) / Math.max(1, st.length);
          const mark = date === selected ? '#2a78d6' : date === now ? '#0b0b0b' : null;
          return (
            <>
              {st.map((s, i) => (
                <rect key={i} x={x} y={y + i * (h + gap)} width={size} height={h} rx={st.length > 1 ? 1 : 2} fill={COLOR[s]} />
              ))}
              {changedDates.has(date) && <circle cx={x + size - 3} cy={y + 3} r={2} fill="#fff" stroke="#0b0b0b" strokeWidth={0.8} />}
              <rect className="heat-outline" x={x + 0.5} y={y + 0.5} width={size - 1} height={size - 1} rx={2} fill="transparent"
                    stroke={mark ?? 'transparent'} strokeWidth={mark ? 1.5 : 1} />
            </>
          );
        }}
        tip={(date) => (
          <>
            <div className="font-weight-bold">{weekday(date)} {dayMonth(date)} {date.slice(0, 4)}{date === now ? ' (today)' : ''}</div>
            {shown.map((s, i) => {
              const st = status.get(date)?.[i] ?? 'on';
              const n = pool.filter((m) => isActive(date, s, m)).length;
              return (
                <div key={s}>
                  <i className="heat-tip-swatch" style={{ background: COLOR[st] }} />
                  {shiftName(s)}: {st === 'on' ? 'active' : st === 'off' ? 'inactive' : `active on ${n} of ${pool.length} machines`}
                </div>
              );
            })}
            {changedDates.has(date) && <div className="heat-tip-muted">Changed for this date</div>}
          </>
        )} />

      <div className="heat-legend">
        <i style={{ background: ON }} /> <span>Active</span>
        <i style={{ background: OFF }} className="ml-2" /> <span>Inactive</span>
        {someUsed && <><i style={{ background: SOME }} className="ml-2" /> <span>Some machines</span></>}
        <i className="heat-legend-dot ml-2" /> <span>Date change</span>
      </div>
    </Card>
  );
}
