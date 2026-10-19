// Mirrors backend/app/schemas/shift_schedule.py

export const ALL = '*';   // "all machines" in a rule
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];   // index = weekday, 0 = Monday

export interface WeeklyOff {
  weekday: number;
  shift: string;
  machine: string;        // machine name or ALL
}

export interface DateOverride {
  date: string;
  shift: string;
  machine: string;
  active: boolean;
}

export interface ScheduleConfig {
  site: string;
  sites: string[];
  shifts: string[];
  machines: string[];
  weekly_off: WeeklyOff[];
  overrides: DateOverride[];
}

export interface InactiveScan {
  date: string;
  shift: string;
  machine: string;
  induction: number;
  rejected: number;
  first_hour: string;
  last_hour: string;
  reason: string;         // "weekly pattern" or "date change"
}

export interface HeatDay {
  date: string;
  active: number;         // shift x machine slots that run that day
  slots: number;
  induction: number;      // parcels scanned in the day's shifts
  off_induction: number;  // of which in switched-off shifts
}

export interface Heatmap {
  machines: string[];
  days: HeatDay[];
  by_shift: Record<string, number>;   // parcels per shift over the whole range
}
