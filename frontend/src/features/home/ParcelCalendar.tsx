import { useEffect, useMemo, useState } from 'react';
import { errorMessage, isAbortError } from '../../api/client';
import Card from '../../components/Card';
import CalendarGrid from '../../components/charts/CalendarGrid';
import { dayMonth, shortNames, weekday } from '../../components/charts/kit';
import ErrorAlert from '../../components/ErrorAlert';
import { addDays, dmy, fmt, shiftName, today } from '../../utils/format';
import { fetchHeatmap } from '../shift-schedule/api';
import type { HeatDay } from '../shift-schedule/types';

// GitHub-style scale: level 0 = nothing, 4 = most.
const GREENS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const ALERT = '#e34948';   // outline: parcels scanned in a switched-off shift
const PERIODS = [{ months: 12, label: 'Last 12 months' }, { months: 6, label: 'Last 6 months' }, { months: 3, label: 'Last 3 months' }];

const level = (value: number, max: number) => (value <= 0 || max <= 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4)));

interface Props {
  site: string;
  machines: string[];
  shifts: string[];
}

/** Calendar heatmap, one square per day: parcels scanned in one shift. */
export default function ParcelCalendar({ site, machines, shifts }: Props) {
  const [months, setMonths] = useState(3);
  const [machine, setMachine] = useState('All');
  const [shift, setShift] = useState('');   // '' until the busiest shift of the period is known
  const [days, setDays] = useState<HeatDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { setMachine('All'); setShift(''); }, [site]);

  const end = today();
  const start = addDays(end, -Math.round((months * 365) / 12) + 1);
  useEffect(() => {
    const ctrl = new AbortController();
    setDays(null);
    fetchHeatmap(site, start, end, machine, shift || 'All', ctrl.signal).then((r) => {
      setError(null);
      if (!shift) {   // open on the shift with the most parcels
        const busiest = shifts.reduce((b, s) => ((r.by_shift[s] ?? 0) > (r.by_shift[b] ?? 0) ? s : b), shifts[0]);
        if (busiest) { setShift(busiest); return; }
      }
      setDays(r.days);
    }).catch((e) => { if (!isAbortError(e)) setError(errorMessage(e)); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, start, end, machine, shift, attempt]);

  const short = shortNames(machines);
  const byDate = useMemo(() => new Map((days ?? []).map((d) => [d.date, d])), [days]);
  const dates = useMemo(() => (days ?? []).map((d) => d.date), [days]);
  const maxParcels = useMemo(() => Math.max(0, ...(days ?? []).map((d) => d.induction)), [days]);

  const stats = useMemo(() => {
    const list = days ?? [];
    const worked = list.filter((d) => d.induction > 0);
    const parcels = worked.reduce((n, d) => n + d.induction, 0);
    const busiest = worked.reduce<HeatDay | null>((b, d) => (!b || d.induction > b.induction ? d : b), null);
    return {
      parcels,
      worked: worked.length,
      average: worked.length ? Math.round(parcels / worked.length) : 0,
      busiest,
      alerts: list.filter((d) => d.off_induction > 0).length,
    };
  }, [days]);

  const scope = shift ? shiftName(shift) : '';
  return (
    <Card title="Parcels per day" icon="fa-th" bodyClassName="p-0" collapsible
          footer={<span className="small text-muted">
            One square per day (the overnight shift belongs to the day it starts). Darker green = more parcels scanned, compared with the
            busiest day in view. A red outline marks a day with parcels in a shift switched off on the Shift Activation page.
          </span>}>
      <div className="abn-toolbar">
        <select className="form-control form-control-sm" style={{ maxWidth: 170 }} aria-label="Period" value={months}
                onChange={(e) => setMonths(Number(e.target.value))}>
          {PERIODS.map((p) => <option key={p.months} value={p.months}>{p.label}</option>)}
        </select>
        <select className="form-control form-control-sm" style={{ maxWidth: 200 }} aria-label="Machine" value={machine}
                onChange={(e) => setMachine(e.target.value)}>
          <option value="All">All machines</option>
          {machines.map((m) => <option key={m} value={m} title={m}>{short.get(m) ?? m}</option>)}
        </select>
        <select className="form-control form-control-sm" style={{ maxWidth: 170 }} aria-label="Shift" value={shift}
                onChange={(e) => setShift(e.target.value)}>
          {!shift && <option value="">Shift...</option>}
          {shifts.map((s) => <option key={s} value={s}>{shiftName(s)}</option>)}
        </select>
      </div>

      {error && <div className="p-2"><ErrorAlert message={error} onRetry={() => setAttempt((n) => n + 1)} /></div>}
      {!days && !error && <div className="text-muted small px-3 pb-3">Loading...</div>}

      {days && (
        <>
          <div className="heat-stats">
            <span><b>{fmt(stats.parcels)}</b> parcels, {scope}</span>
            <span><b>{fmt(stats.worked)}</b> days with parcels</span>
            <span><b>{fmt(stats.average)}</b> parcels per working day</span>
            {stats.busiest && <span>Busiest: <b>{fmt(stats.busiest.induction)}</b> on {dmy(stats.busiest.date)}</span>}
            <span className={stats.alerts ? 'text-danger' : ''}><b>{fmt(stats.alerts)}</b> days with parcels in a switched-off shift</span>
          </div>
          <CalendarGrid
            dates={dates}
            label={`Parcels scanned per day, ${scope}, ${dayMonth(start)} to ${dayMonth(end)}`}
            cell={(date, { x, y, size }) => {
              const d = byDate.get(date)!;
              const alert = d.off_induction > 0;
              const inset = alert ? 0.75 : 0;
              return (
                <rect className="heat-outline" x={x + inset} y={y + inset} width={size - 2 * inset} height={size - 2 * inset} rx={2}
                      fill={GREENS[level(d.induction, maxParcels)]} stroke={alert ? ALERT : 'rgba(27,31,35,0.06)'} strokeWidth={alert ? 1.5 : 1} />
              );
            }}
            tip={(date) => {
              const d = byDate.get(date)!;
              return (
                <>
                  <div className="font-weight-bold">{weekday(date)} {dayMonth(date)} {date.slice(0, 4)}</div>
                  <div>{fmt(d.induction)} parcels scanned, {scope}</div>
                  {d.active === 0 && <div className="heat-tip-muted">{shiftName(shift)} switched off</div>}
                  {d.off_induction > 0 && <div className="heat-tip-alert">{fmt(d.off_induction)} in switched-off shifts</div>}
                </>
              );
            }} />
          <div className="heat-legend">
            <span>Parcels scanned:</span>
            <span>Less</span>
            {GREENS.map((c) => <i key={c} style={{ background: c }} />)}
            <span>More</span>
            <i className="heat-legend-alert" /> <span>Parcels in a switched-off shift</span>
          </div>
        </>
      )}
    </Card>
  );
}
