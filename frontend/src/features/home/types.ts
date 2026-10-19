// Mirrors backend/app/schemas/home.py
import type { DayQuery, DayRow, DayTotals } from '../mas/types';

export type HomeQuery = DayQuery;

export interface MachineDay {
  date: string;
  machine: string;
  induction: number;
  rejected: number;
  rejected_client: number;
  rejected_nido: number;
}

export interface CodeDay {
  date: string;
  machine: string;
  code: string;         // "" = no code on the scan
  count: number;
}

export interface CodeInfo {
  code: string;
  name: string;         // "" when the code is not defined
  scope: string;        // "Client", "NIDO" or ""
}

export interface HomeReport {
  day_start: number;
  days: DayRow[];
  totals: DayTotals;
  machine_days: MachineDay[];
  code_days: CodeDay[];
  codes: CodeInfo[];
}
