export const fmt = (n: number) => Number(n || 0).toLocaleString('en-IN');

/** "2026-10-07" -> "07-10-2026" */
export const dmy = (iso: string) => iso.split('-').reverse().join('-');

/** Today's local date as "YYYY-MM-DD". */
export const today = () => new Date().toLocaleDateString('en-CA');

/** "2026-10-07" + 1 -> "2026-10-08" */
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Seconds as a readable duration: 45 -> "45s", 754 -> "12m 34s", 7810 -> "2h 10m". */
export const duration = (secs: number) => {
  const s = Math.max(0, Math.round(secs || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${fmt(Math.floor(s / 3600))}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
};

/** "2026-10-08T03:15:17.708" -> "08-10-2026 03:15:17" */
export const dmyHms = (ts: string) => (ts ? `${dmy(ts.slice(0, 10))} ${ts.slice(11, 19)}` : '');

/** "Day" -> "Day shift"; names that already end in "shift" are kept. */
export const shiftName = (name: string) => (name.toLowerCase().endsWith('shift') ? name : `${name} shift`);
