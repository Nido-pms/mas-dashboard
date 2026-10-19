import { apiGet } from '../../api/client';
import { useReport } from '../../hooks/useReport';
import type { HomeQuery, HomeReport } from './types';

export const fetchHome = (q: HomeQuery, signal?: AbortSignal) =>
  apiGet<HomeReport>('/home', {
    site: q.site, machine: q.machine, day_start: q.dayStart, start_date: q.start, end_date: q.end,
  }, signal);

export const useHome = (query: HomeQuery | null) => useReport(query, fetchHome);
