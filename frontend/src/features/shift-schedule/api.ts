import { apiGet, apiPut } from '../../api/client';
import type { Heatmap, InactiveScan, ScheduleConfig, WeeklyOff } from './types';

export const fetchSchedule = (site: string | undefined, signal?: AbortSignal) =>
  apiGet<ScheduleConfig>('/shift-schedule', { site }, signal);

export const saveWeekly = (site: string, weekly_off: WeeklyOff[]) =>
  apiPut<ScheduleConfig>('/shift-schedule/weekly', { weekly_off }, { site });

/** active = null removes the change for that date, so the weekly pattern applies again. */
export const setOverride = (site: string, date: string, shift: string, machine: string, active: boolean | null) =>
  apiPut<ScheduleConfig>('/shift-schedule/override', { date, shift, machine, active }, { site });

export const fetchInactiveScans = (site: string, start: string, end: string, signal?: AbortSignal) =>
  apiGet<{ rows: InactiveScan[] }>('/shift-schedule/inactive-scans', { site, start_date: start, end_date: end }, signal);

export const fetchHeatmap = (site: string, start: string, end: string, machine: string, shift: string, signal?: AbortSignal) =>
  apiGet<Heatmap>('/shift-schedule/heatmap', { site, start_date: start, end_date: end, machine, shift }, signal);
