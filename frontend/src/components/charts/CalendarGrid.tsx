import { useEffect, useRef, useState, type ReactNode } from 'react';
import { INK, useWidth } from './kit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
const LEFT = 34, TOP = 18, GAP = 3;

const weekdayOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;   // 0 = Monday

export interface Cell {
  x: number;
  y: number;
  size: number;
}

interface Props {
  dates: string[];                                   // consecutive days, oldest first
  label: string;                                     // for screen readers
  cell: (date: string, c: Cell) => ReactNode;        // the day's square (SVG)
  tip: (date: string) => ReactNode;                  // tooltip content on hover
  onPick?: (date: string) => void;
  scrollTo?: string;                                 // date to bring into view on narrow screens (default: the last)
  maxStep?: number;                                  // largest square + gap, px
}

/** GitHub-style calendar: one column per week (Monday first), one square per day, month labels on top. */
export default function CalendarGrid({ dates, label, cell, tip, onPick, scrollTo, maxStep = 20 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ date: string; x: number; y: number } | null>(null);

  const lead = dates.length ? weekdayOf(dates[0]) : 0;
  const weeks = Math.ceil((lead + dates.length) / 7);
  const step = weeks ? Math.max(11, Math.min(maxStep, Math.floor((width - LEFT - 36) / weeks))) : 14;
  const size = step - GAP;
  const svgW = LEFT + weeks * step;
  const pos = (i: number) => ({ col: Math.floor((lead + i) / 7), row: (lead + i) % 7 });

  useEffect(() => {   // on a narrow screen, open on the latest weeks (or the given date), like GitHub
    const el = scroller.current;
    if (!el) return;
    const i = scrollTo ? dates.indexOf(scrollTo) : -1;
    el.scrollLeft = i < 0 ? el.scrollWidth : LEFT + pos(i).col * step - el.clientWidth / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, scrollTo, step]);

  // A month is labelled over the first week that starts in it; a label too close to the next one is dropped.
  const months: { col: number; text: string }[] = [];
  dates.forEach((d, i) => {
    const { col, row } = pos(i);
    if (row !== 0 && i !== 0) return;
    const text = MONTHS[Number(d.slice(5, 7)) - 1];
    const prev = months[months.length - 1];
    if (prev?.text === text) return;
    if (prev && col - prev.col < 3) months.pop();
    months.push({ col, text });
  });

  return (
    <div ref={ref} className="heat-area">
      <div ref={scroller} className="heat-wrap">
        <svg width={svgW} height={TOP + 7 * step} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
          {months.map((m) => (
            <text key={`${m.col}${m.text}`} x={LEFT + m.col * step} y={11} fontSize={11} fill={INK.secondary}>{m.text}</text>
          ))}
          {ROW_LABELS.map((t, r) => t && (
            <text key={t} x={0} y={TOP + r * step + size - 2} fontSize={10} fill={INK.muted}>{t}</text>
          ))}
          {dates.map((d, i) => {
            const { col, row } = pos(i);
            const x = LEFT + col * step, y = TOP + row * step;
            return (
              <g key={d} className="heat-day" style={{ cursor: onPick ? 'pointer' : undefined }}
                 onMouseEnter={() => setHover({ date: d, x: x + size / 2 - (scroller.current?.scrollLeft ?? 0), y })}
                 onClick={onPick && (() => onPick(d))}>
                {cell(d, { x, y, size })}
              </g>
            );
          })}
        </svg>
      </div>
      {hover && (
        <div className="heat-tip" style={{ left: Math.max(90, Math.min(hover.x, width - 120)), top: hover.y }}>
          {tip(hover.date)}
        </div>
      )}
    </div>
  );
}
