import type { Column } from '../../components/ReportTable';
import { dmy, fmt } from '../../utils/format';
import type { DayRow, HourRow, ShiftRow } from './types';

/** "2026-10-01T07:00:00" -> "01-10-2026 07:00" */
const dmyHm = (iso: string) => `${dmy(iso.slice(0, 10))} ${iso.slice(11, 16)}`;

type RejectSplit = Pick<DayRow, 'induction' | 'rejected_client' | 'rejected_nido' | 'rejected_undefined'>;

/** Total reject split by the scope set for each code on the Rejection Code Definition page, then the final quantity. */
const rejectColumns = <R extends RejectSplit>(): Column<R>[] => [
  { label: 'Rejected by client', value: (r) => r.rejected_client, numeric: true, total: true },
  { label: 'Rejected by NIDO', value: (r) => r.rejected_nido, numeric: true, total: true },
  { label: 'Undefined code', value: (r) => r.rejected_undefined, numeric: true, total: true,
    title: () => 'Rejection codes not on the Rejection Code Definition page; add them there to count them as client or NIDO' },
  { label: 'Final quantity', header: <>Final quantity<br />(induction − NIDO)</>,
    value: (r) => r.induction - r.rejected_nido, numeric: true, total: true,
    title: (r) => `${fmt(r.induction)} inducted − ${fmt(r.rejected_nido)} rejected by NIDO` },
];

export const dayColumns: Column<DayRow>[] = [
  { label: 'Date', value: (r) => dmy(r.date) },
  { label: 'From', value: (r) => dmyHm(r.start) },
  { label: 'To', value: (r) => dmyHm(r.end) },
  { label: 'Total machines', value: (r) => r.total_machines, numeric: true },
  { label: 'In-use machines', value: (r) => r.machines, numeric: true },
  { label: 'Total target', value: (r) => r.target, numeric: true, total: true,
    title: () => 'Sum of the day targets of all machines (or the selected machine)' },
  { label: 'Total induction', value: (r) => r.induction, numeric: true, total: true },
  { label: 'Total reject', value: (r) => r.rejected, numeric: true, total: true },
  { label: 'Achieve target (targeted - inducted)', header: <>Achieve target<br />(targeted − inducted)</>,
    value: (r) => r.shortfall, numeric: true, total: true, variance: true },
  ...rejectColumns<DayRow>(),
];

export const shiftColumns: Column<ShiftRow>[] = [
  { label: 'Date', value: (r) => dmy(r.date) },
  { label: 'Shift', value: (r) => r.shift },
  { label: 'Total machines', value: (r) => r.total_machines, numeric: true },
  { label: 'In-use machines', value: (r) => r.machines, numeric: true },
  { label: 'Total target', value: (r) => r.target, numeric: true, total: true,
    title: (r) => `${fmt(r.target_per_hour)} / h × ${r.hours} h` },
  { label: 'Total induction', value: (r) => r.induction, numeric: true, total: true },
  { label: 'Total reject', value: (r) => r.rejected, numeric: true, total: true },
  { label: 'Achieve target (targeted - inducted)', header: <>Achieve target<br />(targeted − inducted)</>,
    value: (r) => r.shortfall, numeric: true, total: true, variance: true },
  ...rejectColumns<ShiftRow>(),
];

export const hourColumns: Column<HourRow>[] = [
  { label: 'Date', value: (r) => dmy(r.date) },
  { label: 'Hour', value: (r) => r.hour },
  { label: 'Shift', value: (r) => r.shift },
  { label: 'Total target', value: (r) => r.target, numeric: true, total: true,
    title: () => 'Sum of the hourly targets of all machines (or the selected machine)' },
  { label: 'Total induction', value: (r) => r.induction, numeric: true, total: true },
  { label: 'Total reject', value: (r) => r.rejected, numeric: true, total: true },
  { label: 'Targeted - inducted', header: 'Targeted − inducted', value: (r) => r.shortfall, numeric: true, total: true, variance: true },
  ...rejectColumns<HourRow>(),
];
