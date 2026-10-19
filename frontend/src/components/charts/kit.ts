import { useEffect, useRef, useState } from 'react';

// Shared pieces of the dashboard's SVG charts.

/** Categorical slots in fixed order (validated: CVD separation and contrast on the white card). */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#eeede8', axis: '#c3c2b7' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Every date from start to end ("YYYY-MM-DD"). */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${start}T00:00:00Z`); out.length < 400; d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10);
    if (s > end) break;
    out.push(s);
  }
  return out;
}

export const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
export const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** Clean axis ticks from 0 for counts: steps of 1, 2 or 5 x 10^n, at most 5 intervals. */
export function niceTicks(max: number): number[] {
  const m = Math.max(max, 1);
  const pow = 10 ** Math.floor(Math.log10(m / 5));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * pow).find((s) => m / s <= 5) ?? 10 * pow;
  const top = Math.ceil(m / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** "12,500" -> "12.5k" for axis labels. */
export const compact = (n: number) => (Math.abs(n) >= 1000 ? `${+(n / 1000).toFixed(1)}k` : `${+n.toFixed(1)}`);

/** Column path with a 4px rounded top and a square base. */
export function bar(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Short names for machines that share a long prefix: "SC_MIS_..._001_002" -> "Machine 002". */
export function shortNames(names: string[]): Map<string, string> {
  if (names.length < 2) return new Map(names.map((n) => [n, n]));
  let prefix = names[0];
  for (const n of names) while (!n.startsWith(prefix)) prefix = prefix.slice(0, -1);
  const cut = prefix.lastIndexOf('_') + 1;
  return new Map(names.map((n) => [n, cut > 0 && n.slice(cut) ? `Machine ${n.slice(cut)}` : n]));
}

/** Colour of a machine: its place in the site's full machine list, so it never changes with the filter. */
export const machineColor = (all: string[], m: string) => {
  const i = all.indexOf(m);
  return SERIES[(i < 0 ? all.length : i) % SERIES.length];
};

/** Width of the element the ref points at, kept up to date as the layout changes. */
export function useWidth<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [ref, width] as const;
}
