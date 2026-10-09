import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../api/client';
import { useReport } from '../../hooks/useReport';
import type { AlarmDef, AlarmDefIn, AlarmDefList, AlarmQuery, AlarmReport } from './types';

// Each site has its own configuration; leaving out the site uses the backend's default site.
const url = (id: string) => `/alarm-config/${encodeURIComponent(id)}`;

export const fetchAlarmConfig = (site: string | undefined, signal?: AbortSignal) =>
  apiGet<AlarmDefList>('/alarm-config', { site }, signal);

export const addAlarm = (site: string, a: AlarmDefIn) => apiPost<AlarmDef>('/alarm-config', a, { site });

export const updateAlarm = (site: string, id: string, a: AlarmDefIn) => apiPut<AlarmDef>(url(id), a, { site });

export const setStops = (site: string, id: string, machine_stops: boolean) =>
  apiPatch<AlarmDef>(`${url(id)}/stops`, { machine_stops }, { site });

export const deleteAlarm = (site: string, id: string) => apiDelete<{ deleted: string }>(url(id), { site });

export const fetchAlarmAnalysis = (q: AlarmQuery, signal?: AbortSignal) =>
  apiGet<AlarmReport>('/alarm-analysis', {
    site: q.site, machine: q.machine, day_start: q.dayStart, start_date: q.start, end_date: q.end,
  }, signal);

export const useAlarmAnalysis = (query: AlarmQuery | null) => useReport(query, fetchAlarmAnalysis);
