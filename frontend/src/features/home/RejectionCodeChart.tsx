import { useState } from 'react';
import { compact, dateRange, dayMonth, INK, niceTicks, SERIES, shortNames, useWidth, weekday } from '../../components/charts/kit';
import { dmy, fmt } from '../../utils/format';
import type { CodeDay, CodeInfo } from './types';

const HEIGHT = 240;
const M = { top: 22, right: 16, bottom: 40, left: 52 };
const TOP_CODES = 7;          // codes with their own colour; the rest are grouped as "Other"
const OTHER = 'Other';
const OTHER_COLOR = '#b8b6ad';
const TIP_ROWS = 10;

const pct = (n: number, of: number) => (of ? `${((n * 100) / of).toFixed(1)}%` : '-');
const codeLabel = (c: string) => c || 'No code';
const sum = (xs: Iterable<number>) => [...xs].reduce((a, b) => a + b, 0);

interface Props {
  rows: CodeDay[];
  codes: CodeInfo[];
  allMachines: string[];   // every machine of the site, for stable order and names
  machines: string[];      // machines to draw
  start: string;
  end: string;
}

/** Rejections per day and machine, each bar stacked by rejection code; hover a bar for every code's count and share. */
export default function RejectionCodeChart({ rows, codes, allMachines, machines, start, end }: Props) {
  const [hover, setHover] = useState<{ day: number; machine: string } | null>(null);
  const [table, setTable] = useState(false);
  const [wrap, width] = useWidth<HTMLDivElement>([table]);

  const info = new Map(codes.map((c) => [c.code, c]));
  const short = shortNames([...allMachines, ...machines.filter((m) => !allMachines.includes(m))]);
  const label = (m: string) => short.get(m) ?? m;
  const dates = start && end ? dateRange(start, end) : [...new Set(rows.map((r) => r.date))].sort();

  const cells = new Map<string, Map<string, number>>();   // "date|machine" -> code -> count
  const totals = new Map<string, number>();               // code -> count, selected machines
  const machineTotals = new Map<string, number>();
  for (const r of rows) {
    if (!machines.includes(r.machine)) continue;
    const k = `${r.date}|${r.machine}`;
    if (!cells.has(k)) cells.set(k, new Map());
    cells.get(k)!.set(r.code, r.count);
    totals.set(r.code, (totals.get(r.code) ?? 0) + r.count);
    machineTotals.set(r.machine, (machineTotals.get(r.machine) ?? 0) + r.count);
  }
  const cell = (d: string, m: string) => cells.get(`${d}|${m}`);
  const cellTotal = (d: string, m: string) => sum(cell(d, m)?.values() ?? []);

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const top = ranked.slice(0, ranked.length > TOP_CODES + 1 ? TOP_CODES : TOP_CODES + 1);
  const series = ranked.length > top.length ? [...top, OTHER] : top;
  const color = (s: string) => (s === OTHER || !top.includes(s) ? OTHER_COLOR : SERIES[top.indexOf(s) % SERIES.length]);
  const allRejected = sum(totals.values());
  const seriesValue = (d: string, m: string, s: string) => {
    const c = cell(d, m);
    if (!c) return 0;
    return s === OTHER ? sum([...c.entries()].filter(([code]) => !top.includes(code)).map(([, n]) => n)) : c.get(s) ?? 0;
  };
  const seriesTotal = (s: string) => (s === OTHER ? sum(ranked.slice(top.length).map((c) => totals.get(c) ?? 0)) : totals.get(s) ?? 0);

  const yTicks = niceTicks(Math.max(1, ...dates.flatMap((d) => machines.map((m) => cellTotal(d, m)))));
  const yMax = yTicks[yTicks.length - 1];
  const plotW = width - M.left - M.right;
  const band = plotW / Math.max(dates.length, 1);
  const groupW = band * 0.78;
  const slot = groupW / Math.max(machines.length, 1);
  const barW = Math.max(2, Math.min(40, slot - Math.min(4, slot * 0.18)));
  const y = (v: number) => M.top + HEIGHT - (v / yMax) * HEIGHT;
  const cx = (i: number) => M.left + band * i + band / 2;
  const bx = (i: number, j: number) => cx(i) - groupW / 2 + slot * j + slot / 2;   // centre of machine j's bar on day i
  const labelEvery = Math.ceil(52 / band);
  const machineTag = (m: string) => label(m).replace(/^Machine\s+/, '');           // "Machine 001" -> "001" above the bar
  const showTags = machines.length > 1 && barW >= 16;
  const lead = ranked[0];

  const describe = (c: string) => {
    const i = info.get(c);
    return i?.name ? `${i.name}${i.scope ? ` (${i.scope})` : ''}` : c ? 'not defined' : 'scan without a code';
  };

  return (
    <div className="stop-chart">
      <div className="stop-head">
        <div className="stop-summary">
          <span className="stop-total">{fmt(allRejected)}</span>
          <span className="stop-sub">
            rejected · {ranked.length} code{ranked.length === 1 ? '' : 's'}
            {lead && <> · most: {codeLabel(lead)} {fmt(totals.get(lead) ?? 0)} ({pct(totals.get(lead) ?? 0, allRejected)})</>}
            {machines.length > 1 && <> · {machines.map((m) => `${label(m)} ${fmt(machineTotals.get(m) ?? 0)}`).join(' · ')}</>}
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
        {series.map((s) => (
          <li key={s} title={s === OTHER ? ranked.slice(top.length).map(codeLabel).join(', ') : describe(s)}>
            <span className="stop-swatch" style={{ background: color(s) }} />
            <span className="stop-legend-name">{s === OTHER ? `Other (${ranked.length - top.length})` : codeLabel(s)}</span>
            <span className="stop-legend-value">{fmt(seriesTotal(s))} · {pct(seriesTotal(s), allRejected)}</span>
          </li>
        ))}
      </ul>

      {!ranked.length ? <p className="text-muted text-center my-4">No rejections for these filters.</p> : table ? (
        <div className="report-wrap">
          <table className="table table-sm table-striped report mb-0">
            <thead>
              <tr><th>Date</th><th>Machine</th><th>Rejected</th>{ranked.map((c) => <th key={c} title={describe(c)}>{codeLabel(c)}</th>)}</tr>
            </thead>
            <tbody>
              {dates.flatMap((d) => machines.map((m) => {
                const t = cellTotal(d, m);
                return (
                  <tr key={`${d}|${m}`}>
                    <td>{dmy(d)}</td>
                    <td title={m}>{label(m)}</td>
                    <td>{fmt(t)}</td>
                    {ranked.map((c) => {
                      const n = cell(d, m)?.get(c) ?? 0;
                      return <td key={c}>{n ? <>{fmt(n)} <span className="text-muted small">({pct(n, t)})</span></> : '-'}</td>;
                    })}
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="stop-chart-plot" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={M.top + HEIGHT + M.bottom} role="img"
               aria-label="Rejections per day and machine by rejection code; use the Table button for the values">
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth={1} />
                <text x={M.left - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK.muted}>{compact(t)}</text>
              </g>
            ))}
            {dates.map((d, i) => i % labelEvery === 0 && (
              <g key={d}>
                <text x={cx(i)} y={M.top + HEIGHT + 17} textAnchor="middle" fontSize={11} fill={INK.secondary}>{dayMonth(d)}</text>
                <text x={cx(i)} y={M.top + HEIGHT + 31} textAnchor="middle" fontSize={10} fill={INK.muted}>{weekday(d)}</text>
              </g>
            ))}

            {dates.map((d, i) => machines.map((m, j) => {
              let base = 0;
              const active = hover === null || (hover.day === i && hover.machine === m);
              const t = cellTotal(d, m);
              return (
                <g key={`${d}|${m}`} opacity={active ? 1 : 0.45}>
                  {series.map((s) => {
                    const v = seriesValue(d, m, s);
                    if (!v) return null;
                    const y0 = y(base), y1 = y(base + v);
                    base += v;
                    return <rect key={s} x={bx(i, j) - barW / 2} y={y1} width={barW} height={Math.max(0, y0 - y1 - 1)} fill={color(s)} />;
                  })}
                  {showTags && t > 0 && (
                    <text x={bx(i, j)} y={y(t) - 4} textAnchor="middle" fontSize={9} fill={INK.muted}>{machineTag(m)}</text>
                  )}
                </g>
              );
            }))}

            {dates.map((d, i) => machines.map((m, j) => (
              <rect key={`${d}|${m}`} className="stop-hit" x={bx(i, j) - slot / 2} y={M.top} width={slot} height={HEIGHT} fill="transparent"
                    tabIndex={0} aria-label={`${dmy(d)}, ${label(m)}: ${fmt(cellTotal(d, m))} rejected`}
                    onMouseEnter={() => setHover({ day: i, machine: m })} onFocus={() => setHover({ day: i, machine: m })}
                    onBlur={() => setHover(null)} />
            )))}
          </svg>

          {hover !== null && (() => {
            const d = dates[hover.day];
            const m = hover.machine;
            const t = cellTotal(d, m);
            const list = [...(cell(d, m)?.entries() ?? [])].sort((a, b) => b[1] - a[1]);
            const rest = list.slice(TIP_ROWS);
            const restN = sum(rest.map(([, n]) => n));
            return (
              <div className="stop-tip" role="status"
                   style={{ left: Math.min(Math.max(bx(hover.day, machines.indexOf(m)), 160), width - 160), top: 0 }}>
                <div className="stop-tip-date">{weekday(d)}, {dayMonth(d)} {d.slice(0, 4)} · <b>{label(m)}</b> · {fmt(t)} rejected</div>
                {!list.length && <div className="stop-tip-row">No rejections</div>}
                {list.slice(0, TIP_ROWS).map(([c, n]) => (
                  <div key={c} className="stop-tip-row">
                    <span className="stop-tip-key stop-tip-key-box" style={{ background: color(c) }} />
                    <strong>{pct(n, t)}</strong>
                    <span className="stop-tip-name">{codeLabel(c)} · {fmt(n)}{info.get(c)?.name ? ` · ${info.get(c)!.name}` : ''}</span>
                  </div>
                ))}
                {rest.length > 0 && (
                  <div className="stop-tip-row stop-tip-total">
                    <strong>{pct(restN, t)}</strong>
                    <span className="stop-tip-name">{rest.length} more code{rest.length === 1 ? '' : 's'} · {fmt(restN)}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
