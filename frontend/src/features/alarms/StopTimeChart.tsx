import { useState } from 'react';
import { bar, dateRange, dayMonth, INK, machineColor, shortNames, useWidth, weekday } from '../../components/charts/kit';
import { dmy, duration } from '../../utils/format';
import type { DayMachineStop } from './types';

const HEIGHT = 240;                          // plot area
const M = { top: 26, right: 16, bottom: 40, left: 52 };
const BAR_MAX = 24;
const GAP = 2;

/** Axis ticks in minutes: a clean step giving at most 5 intervals. */
function ticks(maxMin: number): number[] {
  const steps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720];
  const step = steps.find((s) => maxMin / s <= 5) ?? 1440;
  const top = Math.max(step, Math.ceil(maxMin / step) * step);
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

const tickLabel = (min: number) => (min < 60 ? `${min}m` : min % 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min / 60}h`);

interface Props {
  days: DayMachineStop[];
  allMachines: string[];   // every machine of the site, for stable colours
  machines: string[];      // the machines to draw (one when the Machine filter picks one)
  start: string;           // date range of the filters; days without stops show as 0
  end: string;
}

/** Column chart of the time alarms stopped each machine, per day. */
export default function StopTimeChart({ days, allMachines, machines, start, end }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const [wrap, width] = useWidth<HTMLDivElement>([table]);

  const known = [...allMachines, ...machines.filter((m) => !allMachines.includes(m))];
  const color = (m: string) => machineColor(known, m);
  const short = shortNames(known);
  const label = (m: string) => short.get(m) ?? m;
  const dates = start && end ? dateRange(start, end) : [...new Set(days.map((d) => d.date))].sort();
  const secs = new Map(days.map((d) => [`${d.date}|${d.machine}`, d.stop_time_s]));
  const value = (date: string, m: string) => secs.get(`${date}|${m}`) ?? 0;
  const machineTotal = (m: string) => dates.reduce((s, d) => s + value(d, m), 0);
  const dayTotal = (d: string) => machines.reduce((s, m) => s + value(d, m), 0);
  const total = machines.reduce((s, m) => s + machineTotal(m), 0);

  const maxMin = Math.max(1, ...dates.flatMap((d) => machines.map((m) => value(d, m) / 60)));
  const yTicks = ticks(maxMin);
  const yMax = yTicks[yTicks.length - 1];
  const plotW = width - M.left - M.right;
  const band = plotW / Math.max(dates.length, 1);
  const barW = Math.max(2, Math.min(BAR_MAX, (band * 0.7 - GAP * (machines.length - 1)) / machines.length));
  const groupW = barW * machines.length + GAP * (machines.length - 1);
  const y = (min: number) => M.top + HEIGHT - (min / yMax) * HEIGHT;
  const labelEvery = Math.ceil(52 / band);

  // The one bar labelled directly: the day and machine with the most stop time.
  let peak: { date: string; machine: string; s: number } | null = null;
  for (const d of dates) for (const m of machines) if (value(d, m) > (peak?.s ?? 0)) peak = { date: d, machine: m, s: value(d, m) };

  const tip = hover === null ? null : dates[hover];
  const tipX = hover === null ? 0 : M.left + band * hover + band / 2;
  const worst = dates.reduce<string | null>((w, d) => (w === null || dayTotal(d) > dayTotal(w) ? d : w), null);

  return (
    <div className="stop-chart">
      <div className="stop-head">
        <div className="stop-summary">
          <span className="stop-total">{duration(total)}</span>
          <span className="stop-sub">
            stopped over {dates.length} {dates.length === 1 ? 'day' : 'days'} · avg {duration(Math.round(total / Math.max(dates.length, 1)))} per day
            {worst && dayTotal(worst) > 0 && <> · worst {dayMonth(worst)}</>}
          </span>
        </div>
        <div className="stop-switch" role="group" aria-label="Chart or table">
          <button type="button" className={table ? '' : 'active'} aria-pressed={!table} onClick={() => setTable(false)}>
            <i className="fas fa-chart-bar mr-1" />Chart
          </button>
          <button type="button" className={table ? 'active' : ''} aria-pressed={table} onClick={() => setTable(true)}>
            <i className="fas fa-table mr-1" />Table
          </button>
        </div>
      </div>

      <ul className="stop-legend" aria-label="Legend">
        {machines.map((m) => (
          <li key={m} title={m}>
            <span className="stop-swatch" style={{ background: color(m) }} />
            <span className="stop-legend-name">{label(m)}</span>
            <span className="stop-legend-value">{duration(machineTotal(m))}</span>
          </li>
        ))}
      </ul>

      {table ? (
        <div className="report-wrap">
          <table className="table table-sm table-striped report mb-0">
            <thead>
              <tr>
                <th>Date</th>
                {machines.map((m) => <th key={m} title={m}>{label(m)}</th>)}
                {machines.length > 1 && <th>Total</th>}
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => (
                <tr key={d}>
                  <td>{dmy(d)}</td>
                  {machines.map((m) => <td key={m}>{duration(value(d, m))}</td>)}
                  {machines.length > 1 && <td className="font-weight-bold">{duration(dayTotal(d))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className={`stop-chart-plot${hover !== null ? ' is-hovering' : ''}`} onMouseLeave={() => setHover(null)}>
          <svg width={width} height={M.top + HEIGHT + M.bottom} role="img"
               aria-label="Machine stop time per day; use the Table button for the values">
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth={1} />
                <text x={M.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK.muted}>{tickLabel(t)}</text>
              </g>
            ))}

            {dates.map((d, i) => {
              const x0 = M.left + band * i + (band - groupW) / 2;
              const cx = M.left + band * i + band / 2;
              return (
                <g key={d} className={`stop-day${hover === i ? ' is-active' : ''}`}>
                  {machines.map((m, k) => {
                    const v = value(d, m) / 60;
                    const h = y(0) - y(v);
                    return h > 0 && (
                      <path key={m} className="stop-bar" d={bar(x0 + k * (barW + GAP), y(v), barW, h)} fill={color(m)}
                            style={{ animationDelay: `${Math.min(i * 30, 400)}ms` }} />
                    );
                  })}
                  {i % labelEvery === 0 && (
                    <>
                      <text x={cx} y={M.top + HEIGHT + 17} textAnchor="middle" fontSize={11} fill={INK.secondary}>{dayMonth(d)}</text>
                      <text x={cx} y={M.top + HEIGHT + 31} textAnchor="middle" fontSize={10} fill={INK.muted}>{weekday(d)}</text>
                    </>
                  )}
                  {/* hit target: the whole day band, bigger than the bars */}
                  <rect className="stop-hit" x={M.left + band * i} y={M.top - 10} width={band} height={HEIGHT + 10} fill="transparent" tabIndex={0}
                        aria-label={`${dmy(d)}: ${machines.map((m) => `${label(m)} ${duration(value(d, m))}`).join(', ')}`}
                        onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
                </g>
              );
            })}

            {peak && hover === null && (() => {
              const i = dates.indexOf(peak.date);
              const k = machines.indexOf(peak.machine);
              const cx = M.left + band * i + (band - groupW) / 2 + k * (barW + GAP) + barW / 2;
              return <text x={cx} y={y(peak.s / 60) - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK.secondary}>
                {duration(peak.s)}
              </text>;
            })()}
          </svg>

          {tip && (
            <div className="stop-tip" role="status" style={{ left: Math.min(Math.max(tipX, 110), width - 110), top: 0 }}>
              <div className="stop-tip-date">{weekday(tip)}, {dayMonth(tip)} {tip.slice(0, 4)}</div>
              {machines.map((m) => (
                <div key={m} className="stop-tip-row">
                  <span className="stop-tip-key" style={{ background: color(m) }} />
                  <strong>{duration(value(tip, m))}</strong>
                  <span className="stop-tip-name">{label(m)}</span>
                </div>
              ))}
              {machines.length > 1 && (
                <div className="stop-tip-row stop-tip-total">
                  <strong>{duration(dayTotal(tip))}</strong>
                  <span className="stop-tip-name">total</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
