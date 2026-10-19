import { useState } from 'react';
import { compact, dateRange, dayMonth, INK, machineColor, niceTicks, shortNames, useWidth, weekday } from '../../components/charts/kit';
import { dmy, fmt } from '../../utils/format';
import type { MachineDay } from './types';

const HEIGHT = 230;
const M = { top: 22, right: 16, bottom: 40, left: 52 };
type Metric = 'count' | 'rate';

const rate = (rej: number, ind: number) => (ind ? (rej * 100) / ind : null);
const pctText = (v: number | null) => (v === null ? '-' : `${v.toFixed(1)}%`);

interface Props {
  rows: MachineDay[];
  allMachines: string[];   // every machine of the site, for stable colours
  machines: string[];      // machines to draw
  start: string;
  end: string;
}

/** Rejections per day, one line per machine; as a count or as a share of what the machine inducted. */
export default function RejectionTrendChart({ rows, allMachines, machines, start, end }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>('count');
  const [table, setTable] = useState(false);
  const [wrap, width] = useWidth<HTMLDivElement>([table]);

  const known = [...allMachines, ...machines.filter((m) => !allMachines.includes(m))];
  const color = (m: string) => machineColor(known, m);
  const short = shortNames(known);
  const label = (m: string) => short.get(m) ?? m;
  const dates = start && end ? dateRange(start, end) : [...new Set(rows.map((r) => r.date))].sort();
  const cell = new Map(rows.map((r) => [`${r.date}|${r.machine}`, r]));
  const get = (d: string, m: string) => cell.get(`${d}|${m}`);
  const value = (d: string, m: string): number | null => {
    const r = get(d, m);
    return metric === 'count' ? r?.rejected ?? 0 : rate(r?.rejected ?? 0, r?.induction ?? 0);
  };
  const total = (m: string, k: 'rejected' | 'induction') => dates.reduce((s, d) => s + (get(d, m)?.[k] ?? 0), 0);
  const allRej = machines.reduce((s, m) => s + total(m, 'rejected'), 0);
  const allInd = machines.reduce((s, m) => s + total(m, 'induction'), 0);

  const values = dates.flatMap((d) => machines.map((m) => value(d, m) ?? 0));
  const yTicks = niceTicks(Math.max(...values, metric === 'rate' ? 1 : 1));
  const yMax = yTicks[yTicks.length - 1];
  const plotW = width - M.left - M.right;
  const band = plotW / Math.max(dates.length, 1);
  const y = (v: number) => M.top + HEIGHT - (v / yMax) * HEIGHT;
  const cx = (i: number) => M.left + band * i + band / 2;
  const labelEvery = Math.ceil(52 / band);
  /** Line through the days that have a value; a day without one (no induction, for the rate) breaks the line. */
  const path = (m: string) => {
    let d = '';
    let pen = false;
    dates.forEach((date, i) => {
      const v = value(date, m);
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${cx(i)},${y(v)}`;
      pen = true;
    });
    return d;
  };
  const worst = (() => {
    let w: { d: string; m: string; v: number } | null = null;
    for (const d of dates) for (const m of machines) {
      const v = value(d, m);
      if (v !== null && v > (w?.v ?? -1)) w = { d, m, v };
    }
    return w;
  })();

  const tip = hover;

  return (
    <div className="stop-chart">
      <div className="stop-head">
        <div className="stop-summary">
          <span className="stop-total">{fmt(allRej)}</span>
          <span className="stop-sub">
            rejected · {pctText(rate(allRej, allInd))} of {fmt(allInd)} inducted
            {worst && worst.v > 0 && <> · highest {label(worst.m)} on {dayMonth(worst.d)} ({metric === 'count' ? fmt(worst.v) : pctText(worst.v)})</>}
          </span>
        </div>
        <div className="d-flex flex-wrap" style={{ gap: '.5rem' }}>
          <div className="stop-switch" role="group" aria-label="Count or rate">
            <button type="button" className={metric === 'count' ? 'active' : ''} aria-pressed={metric === 'count'} onClick={() => setMetric('count')}>Count</button>
            <button type="button" className={metric === 'rate' ? 'active' : ''} aria-pressed={metric === 'rate'} onClick={() => setMetric('rate')}>Rate %</button>
          </div>
          <div className="stop-switch" role="group" aria-label="Chart or table">
            <button type="button" className={table ? '' : 'active'} aria-pressed={!table} onClick={() => setTable(false)}>
              <i className="fas fa-chart-line mr-1" />Chart
            </button>
            <button type="button" className={table ? 'active' : ''} aria-pressed={table} onClick={() => setTable(true)}>
              <i className="fas fa-table mr-1" />Table
            </button>
          </div>
        </div>
      </div>

      <ul className="stop-legend" aria-label="Legend">
        {machines.map((m) => (
          <li key={m} title={m}>
            <span className="legend-line" style={{ background: color(m) }} />
            <span className="stop-legend-name">{label(m)}</span>
            <span className="stop-legend-value">{fmt(total(m, 'rejected'))} · {pctText(rate(total(m, 'rejected'), total(m, 'induction')))}</span>
          </li>
        ))}
      </ul>

      {table ? (
        <div className="report-wrap">
          <table className="table table-sm table-striped report mb-0">
            <thead>
              <tr>
                <th>Date</th>
                {machines.map((m) => <th key={m} title={m}>{label(m)} rejected</th>)}
                {machines.map((m) => <th key={`${m}-r`} title={m}>{label(m)} rate</th>)}
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => (
                <tr key={d}>
                  <td>{dmy(d)}</td>
                  {machines.map((m) => <td key={m}>{fmt(get(d, m)?.rejected ?? 0)}</td>)}
                  {machines.map((m) => <td key={`${m}-r`}>{pctText(rate(get(d, m)?.rejected ?? 0, get(d, m)?.induction ?? 0))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="stop-chart-plot" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={M.top + HEIGHT + M.bottom} role="img"
               aria-label="Rejections per day per machine; use the Table button for the values">
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth={1} />
                <text x={M.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK.muted}>
                  {metric === 'rate' ? `${+t.toFixed(1)}%` : compact(t)}
                </text>
              </g>
            ))}
            {dates.map((d, i) => i % labelEvery === 0 && (
              <g key={d}>
                <text x={cx(i)} y={M.top + HEIGHT + 17} textAnchor="middle" fontSize={11} fill={INK.secondary}>{dayMonth(d)}</text>
                <text x={cx(i)} y={M.top + HEIGHT + 31} textAnchor="middle" fontSize={10} fill={INK.muted}>{weekday(d)}</text>
              </g>
            ))}

            {tip !== null && <line x1={cx(tip)} x2={cx(tip)} y1={M.top} y2={M.top + HEIGHT} stroke={INK.axis} strokeWidth={1} />}

            {machines.map((m) => (
              <g key={m}>
                <path className="trend-line" d={path(m)} fill="none" stroke={color(m)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {dates.map((d, i) => {
                  const v = value(d, m);
                  return v !== null && (
                    <circle key={d} cx={cx(i)} cy={y(v)} r={tip === i ? 5 : 4} fill={color(m)} stroke="#fff" strokeWidth={2} />
                  );
                })}
              </g>
            ))}

            {dates.map((d, i) => (
              <rect key={d} className="stop-hit" x={M.left + band * i} y={M.top - 10} width={band} height={HEIGHT + 10} fill="transparent"
                    tabIndex={0} aria-label={`${dmy(d)}: ${machines.map((m) => `${label(m)} ${fmt(get(d, m)?.rejected ?? 0)} rejected`).join(', ')}`}
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            ))}
          </svg>

          {tip !== null && (
            <div className="stop-tip" role="status" style={{ left: Math.min(Math.max(cx(tip), 130), width - 130), top: 0 }}>
              <div className="stop-tip-date">{weekday(dates[tip])}, {dayMonth(dates[tip])} {dates[tip].slice(0, 4)}</div>
              {machines.map((m) => {
                const r = get(dates[tip], m);
                return (
                  <div key={m} className="stop-tip-row">
                    <span className="stop-tip-key" style={{ background: color(m) }} />
                    <strong>{fmt(r?.rejected ?? 0)}</strong>
                    <span className="stop-tip-name">
                      {label(m)} · {pctText(rate(r?.rejected ?? 0, r?.induction ?? 0))} · client {fmt(r?.rejected_client ?? 0)} / NIDO {fmt(r?.rejected_nido ?? 0)}
                    </span>
                  </div>
                );
              })}
              {machines.length > 1 && (() => {
                const rej = machines.reduce((s, m) => s + (get(dates[tip], m)?.rejected ?? 0), 0);
                const ind = machines.reduce((s, m) => s + (get(dates[tip], m)?.induction ?? 0), 0);
                return (
                  <div className="stop-tip-row stop-tip-total">
                    <strong>{fmt(rej)}</strong><span className="stop-tip-name">total · {pctText(rate(rej, ind))}</span>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
