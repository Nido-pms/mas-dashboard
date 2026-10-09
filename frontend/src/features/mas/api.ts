import { apiGet } from '../../api/client';
import type { BillingQuery, BillingReport, DayQuery, DayReport, FilterOptions } from './types';

export const fetchFilters = (site: string | undefined, signal?: AbortSignal) =>
  apiGet<FilterOptions>('/filters', { site }, signal);

export const fetchBilling = (q: BillingQuery, signal?: AbortSignal) =>
  apiGet<BillingReport>('/billing', {
    site: q.site, machine: q.machine, shift: q.shift, start_date: q.start, end_date: q.end,
  }, signal);

export const fetchDayWise = (q: DayQuery, signal?: AbortSignal) =>
  apiGet<DayReport>('/day-wise', {
    site: q.site, machine: q.machine, day_start: q.dayStart, start_date: q.start, end_date: q.end,
  }, signal);
