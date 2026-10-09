// Mirrors backend/app/schemas/alarms.py
import type { DayQuery } from '../mas/types';

// ---------------------------------------------------------------- configuration

export interface AlarmDefIn {
  sn: number;
  name: string;          // matched to "Alarm Name" in the alarm reports, ignoring case and extra spaces
  address: string;       // PLC bit, e.g. "Alarm1.X0"; unique per site
  machine_stops: boolean;
}

export interface AlarmDef extends AlarmDefIn {
  id: string;
  occurrences: number;   // times this alarm appears in the site's alarm reports
  created_at: string;
  updated_at: string;
}

export interface AlarmDefList {
  site: string;
  sites: string[];
  alarms: AlarmDef[];
}

// ---------------------------------------------------------------- analysis

export type AlarmQuery = DayQuery;

/** One machine stop: the overlapping machine-stop alarms of one machine, counted once. */
export interface MachineStop {
  date: string;
  machine: string;
  alarm_code: string;    // of the main alarm: the first one raised
  alarm_id: string;
  name: string;
  raised: string;        // first alarm raised
  cleared: string;       // last alarm of the group cleared
  duration_s: number;    // time the machine was stopped, no overlap counted twice
  grouped: string[];     // the other alarms in the group
}

export interface KeyFinding {
  key: string;           // "stops", "stopped", "top_cause", "time_lost"
  title: string;
  value: string;
  detail: string;
}

export interface MachineTotal {
  machine: string;
  stops: number;
  stop_time_s: number;
}

export interface DayMachineStop {
  date: string;
  machine: string;
  stops: number;
  stop_time_s: number;
}

export interface AlarmReport {
  day_start: number;
  stop_alarms: number;
  stop_time_s: number;   // exact time the machines were stopped
  findings: KeyFinding[];
  machines: MachineTotal[];
  days: DayMachineStop[];  // per day and machine (only days with stops), every stop counted
  stops: MachineStop[];  // machine by machine, oldest first within each; capped
  stops_total: number;
}
