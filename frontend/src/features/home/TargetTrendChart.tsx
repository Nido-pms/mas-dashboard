import { useState } from 'react';
import { bar, compact, dateRange, dayMonth, INK, niceTicks, SERIES, useWidth, weekday } from '../../components/charts/kit';
import { dmy, fmt } from '../../utils/format';
import type { DayRow } from '../mas/types';

const HEIGHT = 250;
const M = { top: 28, right: 16, bottom: 40, left: 52 };
const INDUCT = SERIES[0];        // the series the chart is about
const AVG = SERIES[1];           // 3-day average: the trend through daily noise
const TARGET = INK.secondary;    // reference, kept neutral

const pct = (a: number, b: number) => (b ? Math.round((a * 1000) / b) / 10 : 0);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(Math.abs(n))}`;

interface Props {
  days: DayRow[];
  start: string;
  end: string;
}

/** Inducted per day against the day target, with a 3-day average showing the trend. */
export default function TargetTrendChart({ days, start, end }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const [wrap, width] = useWidth<HTMLDivElement>([table]);

  const byDate = new Map(days.map((d) => [d.date, d]));
  const dates = start && end ? dateRange(start, end) : days.map((d) => d.date);
  const induct = dates.map((d) => byDate.get(d)?.induction ?? 0);
  const target = dates.map((d) => byDate.get(d)?.target ?? 0);
  const avg = induct.map((_, i) => {
    const w = induct.slice(Math.max(0, i - 2), i + 1);
    return w.reduce((s, v) => s + v, 0) / w.length;
  });

  const totalIn = induct.reduce((s, v) => s + v, 0);
  const totalTarget = target.reduce((s, v) => s + v, 0);
  const mean = totalIn / Math.max(dates.length, 1);
  const best = induct.some((v) => v > 0) ? induct.indexOf(Math.max(...induct)) : -1;
  // lowest working day: a day with no induction at all (e.g. a holiday) is not "the lowest"
  const worked = induct.filter((v) => v > 0);
  const lowest = best >= 0 ? induct.indexOf(Math.min(...worked)) : -1;

  const yTicks = niceTicks(Math.max(...induct, ...target, ...avg, 1));
  const yMax = yTicks[yTicks.length - 1];
  const plotW = width - M.left - M.right;
  const band = plotW / Math.max(dates.length, 1);
  const barW = Math.max(3, Math.min(24, band * 0.55));
  const y = (v: number) => M.top + HEIGHT - (v / yMax) * HEIGHT;
  const cx = (i: number) => M.left + band * i + band / 2;
  const labelEvery = Math.ceil(52 / band);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${cx(i)},${y(v)}`).join('');
  // target drawn as steps across each day's band, so a change of target reads as a step
  const steps = target.map((v, i) => `${i ? 'L' : 'M'}${M.left + band * i},${y(v)}H${M.left + band * (i + 1)}`).join('');

  const tip = hover;

  return (
    <div className="stop-chart">
      <div className="stop-head">
        <div className="stop-summary">
          <span className="stop-total">{fmt(totalIn)}</span>
          <span className="stop-sub">
            inducted of {fmt(totalTarget)} target · {pct(totalIn, totalTarget)}% achieved · avg {fmt(Math.round(mean))} per day
            {best >= 0 && lowest !== best && <> · best {dayMonth(dates[best])} ({fmt(induct[best])}) · lowest {dayMonth(dates[lowest])} ({fmt(induct[lowest])})</>}
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
        <li><span className="stop-swatch" style={{ background: INDUCT }} /><span className="stop-legend-name">Inducted</span></li>
        <li><span className="legend-line" style={{ background: TARGET }} /><span className="stop-legend-name">Target</span></li>
        <li><span className="legend-line" style={{ background: AVG }} /><span className="stop-legend-name">3-day average</span></li>
      </ul>

      {table ? (
        <div className="report-wrap">
          <table className="table table-sm table-striped report mb-0">
            <thead>
              <tr><th>Date</th><th>Target</th><th>Inducted</th><th>Achieved</th><th>Gap (target − inducted)</th><th>Change vs previous day</th><th>3-day average</th></tr>
            </thead>
            <tbody>
              {dates.map((d, i) => (
                <tr key={d}>
                  <td>{dmy(d)}</td>
                  <td>{fmt(target[i])}</td>
                  <td>{fmt(induct[i])}</td>
                  <td>{pct(induct[i], target[i])}%</td>
                  <td>{fmt(target[i] - induct[i])}</td>
                  <td>{i ? signed(induct[i] - induct[i - 1]) : '-'}</td>
                  <td>{fmt(Math.round(avg[i]))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className={`stop-chart-plot${hover !== null ? ' is-hovering' : ''}`} onMouseLeave={() => setHover(null)}>
          <svg width={width} height={M.top + HEIGHT + M.bottom} role="img"
               aria-label="Inducted and target per day; use the Table button for the values">
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth={1} />
                <text x={M.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK.muted}>{compact(t)}</text>
              </g>
            ))}

            {dates.map((d, i) => {
              const h = y(0) - y(induct[i]);
              return (
                <g key={d} className={`stop-day${hover === i ? ' is-active' : ''}`}>
                  {h > 0 && <path className="stop-bar" d={bar(cx(i) - barW / 2, y(induct[i]), barW, h)} fill={INDUCT}
                                  style={{ animationDelay: `${Math.min(i * 30, 400)}ms` }} />}
                  {i % labelEvery === 0 && (
                    <>
                      <text x={cx(i)} y={M.top + HEIGHT + 17} textAnchor="middle" fontSize={11} fill={INK.secondary}>{dayMonth(d)}</text>
                      <text x={cx(i)} y={M.top + HEIGHT + 31} textAnchor="middle" fontSize={10} fill={INK.muted}>{weekday(d)}</text>
                    </>
                  )}
                </g>
              );
            })}

            <path d={steps} fill="none" stroke={TARGET} strokeWidth={2} strokeLinejoin="round" />
            {dates.length > 1 && <path d={line(avg)} fill="none" stroke={AVG} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}

            {/* one direct label: the best day sits above the average line; the lowest day is named in the headline */}
            {hover === null && best >= 0 && (
              <text x={cx(best)} y={Math.min(y(induct[best]), y(avg[best])) - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK.secondary}>
                Best {fmt(induct[best])}
              </text>
            )}

            {dates.map((d, i) => (
              <rect key={d} className="stop-hit" x={M.left + band * i} y={M.top - 10} width={band} height={HEIGHT + 10} fill="transparent"
                    tabIndex={0} aria-label={`${dmy(d)}: inducted ${fmt(induct[i])}, target ${fmt(target[i])}`}
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            ))}
          </svg>

          {tip !== null && (
            <div className="stop-tip" role="status" style={{ left: Math.min(Math.max(cx(tip), 120), width - 120), top: 0 }}>
              <div className="stop-tip-date">{weekday(dates[tip])}, {dayMonth(dates[tip])} {dates[tip].slice(0, 4)}</div>
              <div className="stop-tip-row"><span className="stop-tip-key" style={{ background: INDUCT }} /><strong>{fmt(induct[tip])}</strong><span className="stop-tip-name">inducted</span></div>
              <div className="stop-tip-row"><span className="stop-tip-key" style={{ background: TARGET }} /><strong>{fmt(target[tip])}</strong><span className="stop-tip-name">target</span></div>
              <div className="stop-tip-row"><span className="stop-tip-key" style={{ background: AVG }} /><strong>{fmt(Math.round(avg[tip]))}</strong><span className="stop-tip-name">3-day average</span></div>
              <div className="stop-tip-row stop-tip-total">
                <strong>{pct(induct[tip], target[tip])}%</strong><span className="stop-tip-name">achieved · gap {fmt(target[tip] - induct[tip])}</span>
              </div>
              {tip > 0 && (
                <div className="stop-tip-row" style={{ paddingLeft: 'calc(12px + .45rem)' }}>
                  <strong>{signed(induct[tip] - induct[tip - 1])}</strong>
                  <span className="stop-tip-name">vs previous day{induct[tip - 1] ? ` (${signed(Math.round(pct(induct[tip] - induct[tip - 1], induct[tip - 1])))}%)` : ''}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
