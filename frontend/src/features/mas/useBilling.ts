import { useReport } from '../../hooks/useReport';
import { fetchBilling, fetchDayWise } from './api';
import type { BillingQuery, DayQuery } from './types';

export const useBilling = (query: BillingQuery | null) => useReport(query, fetchBilling);

export const useDayWise = (query: DayQuery | null) => useReport(query, fetchDayWise);
