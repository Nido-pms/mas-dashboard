// Mirrors backend/app/schemas/mas.py

export interface ShiftOption {
  name: string;
  label: string;
}

export interface FilterOptions {
  site: string;
  sites: string[];
  machines: string[];
  shifts: ShiftOption[];
  min_date: string | null;
  max_date: string | null;
}

export interface HourRow {
  date: string;
  hour: string;
  shift: string;
  machines: number;
  target: number;
  induction: number;
  calibration: number;
  balance: number;
  shortfall: number;
  rejected: number;
  rejected_client: number;
  rejected_nido: number;
  rejected_undefined: number;  // code not on the Rejection Code Definition page
}

export interface ShiftRow {
  date: string;
  shift: string;
  total_machines: number;  // machines available at the site
  machines: number;        // machines that ran
  hours: number;
  target_per_hour: number;
  target: number;
  induction: number;
  rejected: number;
  calibration: number;
  balance: number;
  shortfall: number;
  rejected_client: number;
  rejected_nido: number;
  rejected_undefined: number;  // code not on the Rejection Code Definition page
}

export interface BillingTotals {
  target: number;
  induction: number;
  rejected: number;
  calibration: number;
  balance: number;
  shortfall: number;
  rejected_client: number;
  rejected_nido: number;
  rejected_undefined: number;  // code not on the Rejection Code Definition page
  achievement: number;
}

export interface DayRow {
  date: string;   // the day is named after the date it starts on
  start: string;  // e.g. "2026-10-01T07:00:00"
  end: string;
  total_machines: number;  // machines available at the site
  machines: number;        // machines that ran
  target: number;
  induction: number;
  rejected: number;
  shortfall: number;
  rejected_client: number;
  rejected_nido: number;
  rejected_undefined: number;  // code not on the Rejection Code Definition page
}

export interface DayTotals {
  target: number;
  induction: number;
  rejected: number;
  shortfall: number;
  rejected_client: number;
  rejected_nido: number;
  rejected_undefined: number;  // code not on the Rejection Code Definition page
  achievement: number;
}

export interface DayReport {
  day_start: number;
  totals: DayTotals;
  days: DayRow[];
}

/** Figures shown in the KPI tiles; both report types provide them. */
export type KpiTotals = Pick<DayTotals, 'target' | 'induction' | 'rejected' | 'shortfall' | 'achievement'>;

export interface BillingReport {
  config: { default_target: number; machine_targets: Record<string, number>; calibration: number };
  totals: BillingTotals;
  hour: HourRow[];
  shift: ShiftRow[];
}

export interface Filters {
  machine: string;
  shift: string;
  start: string;
  end: string;
}

export interface BillingQuery extends Filters {
  site: string;
}

export interface DayQuery extends Omit<Filters, 'shift'> {
  site: string;
  dayStart: number;  // hour 0-23
}
