// Mirrors backend/app/schemas/employees.py and attendance.py

export const ROLES = ['Operator', 'Supervisor'] as const;
export type Role = (typeof ROLES)[number];

export interface EmployeeIn {
  name: string;
  registration_date: string;  // "2026-10-08"; does not limit attendance
  employee_id: string;
  site: string;
  client: string;
  role: Role;
}

export interface Employee extends EmployeeIn {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface EmployeeList {
  sites: string[];
  clients: string[];  // every client name in use, for suggestions
  employees: Employee[];
}

export interface SheetEntryIn {
  employee: string;    // Employee.id
  machines: string[];  // operators only
}

export interface SheetIn {
  date: string;
  shift: string;
  entries: SheetEntryIn[];
}

export interface Present {
  employee: string;
  employee_id: string;
  name: string;
  role: Role;
  client: string;
  machines: string[];
}

export interface Sheet {
  site: string;
  date: string;
  shift: string;
  present: Present[];
  updated_at: string | null;  // null = not marked yet
}

export interface PersonRef {
  employee_id: string;
  name: string;
}

export interface SummaryRow {
  date: string;
  shift: string;
  site: string;
  client: string;
  operators: PersonRef[];
  supervisors: PersonRef[];
}

export interface AttendanceSummary {
  rows: SummaryRow[];
}
