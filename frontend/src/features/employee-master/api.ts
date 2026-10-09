import { apiDelete, apiGet, apiPost, apiPut } from '../../api/client';
import type { AttendanceSummary, Employee, EmployeeIn, EmployeeList, Sheet, SheetIn } from './types';

export const fetchEmployees = (site?: string, signal?: AbortSignal) =>
  apiGet<EmployeeList>('/employees', { site }, signal);

export const addEmployee = (e: EmployeeIn) => apiPost<Employee>('/employees', e);

export const updateEmployee = (id: string, e: EmployeeIn) => apiPut<Employee>(`/employees/${encodeURIComponent(id)}`, e);

export const deleteEmployee = (id: string) => apiDelete<{ deleted: string }>(`/employees/${encodeURIComponent(id)}`);

export const fetchSheet = (site: string, date: string, shift: string, signal?: AbortSignal) =>
  apiGet<Sheet>('/attendance/sheet', { site, date, shift }, signal);

export const saveSheet = (site: string, sheet: SheetIn) => apiPut<Sheet>('/attendance/sheet', sheet, { site });

export const deleteSheet = (site: string, date: string, shift: string) =>
  apiDelete<{ deleted: boolean }>('/attendance/sheet', { site, date, shift });

export const fetchSummary = (site: string | undefined, start: string, end: string, signal?: AbortSignal) =>
  apiGet<AttendanceSummary>('/attendance/summary', { site, start_date: start, end_date: end }, signal);
