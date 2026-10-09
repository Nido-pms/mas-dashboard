import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { errorMessage, isAbortError } from '../../api/client';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { fetchFilters } from './api';
import type { BillingQuery, BillingReport, FilterOptions, Filters } from './types';
import { useBilling } from './useBilling';

/** Filters and report data shared by all MAS pages (dashboard, shift-wise, hour-wise). */
export interface MasState {
  options: FilterOptions | null;
  filters: Filters;
  setFilter: (patch: Partial<Filters>) => void;
  setSite: (site: string) => void;
  setRange: (days: number) => void;  // 0 = all dates
  filtersError: string | null;  // filter options could not be loaded
  data: BillingReport | null;
  error: string | null;         // filters or billing report failed
  loading: boolean;
  updatedAt: Date | null;
  reload: () => void;
  retry: () => void;
  autoRefresh: boolean;
  setAutoRefresh: (on: boolean) => void;
  dayStart: number;  // hour each day starts at, for the day-wise report
  setDayStart: (hour: number) => void;
  csvName: (kind: 'day' | 'shift' | 'hour') => string;
}

const DAY_START_KEY = 'mas.dayStart';
const savedDayStart = () => {
  const v = Number(localStorage.getItem(DAY_START_KEY) ?? 7);
  return Number.isInteger(v) && v >= 0 && v <= 23 ? v : 7;
};

export const MasContext = createContext<MasState | null>(null);

export function useMas() {
  const ctx = useContext(MasContext);
  if (!ctx) throw new Error('useMas must be used inside <MasLayout>');
  return ctx;
}

export function useMasState(): MasState {
  const [requestedSite, setRequestedSite] = useState<string>();  // undefined = backend default site
  const [filtersAttempt, setFiltersAttempt] = useState(0);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ machine: 'All', shift: 'All', start: '', end: '' });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [dayStart, setDayStart] = useState(savedDayStart);

  // Filter options for the selected site; selecting a site resets machine, shift and dates.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchFilters(requestedSite, ctrl.signal).then((f) => {
      setOptions(f);
      setFiltersError(null);
      setFilters({ machine: 'All', shift: 'All', start: f.min_date ?? '', end: f.max_date ?? '' });
    }).catch((e) => { if (!isAbortError(e)) setFiltersError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [requestedSite, filtersAttempt]);

  const setRange = (days: number) => {
    if (!options?.max_date) return;
    const min = options.min_date ?? '';
    let start = min;
    if (days) {
      const d = new Date(`${options.max_date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - days + 1);
      const s = d.toISOString().slice(0, 10);
      start = s < min ? min : s;
    }
    setFilters((f) => ({ ...f, start, end: options.max_date! }));
  };

  const query = useMemo<BillingQuery | null>(() => (options ? { site: options.site, ...filters } : null), [options, filters]);
  const { data, error, loading, updatedAt, reload } = useBilling(query);
  useAutoRefresh(reload, autoRefresh);

  return {
    options,
    filters,
    setFilter: (patch) => setFilters((f) => ({ ...f, ...patch })),
    setSite: setRequestedSite,
    setRange,
    filtersError,
    data,
    error: filtersError ?? error,
    loading,
    updatedAt,
    reload: () => void reload(),
    retry: () => (filtersError ? setFiltersAttempt((n) => n + 1) : void reload()),
    autoRefresh,
    setAutoRefresh,
    dayStart,
    setDayStart: (hour) => {
      localStorage.setItem(DAY_START_KEY, String(hour));
      setDayStart(hour);
    },
    csvName: (kind) => `${options?.site.toLowerCase()}_${kind}_wise_${filters.start}_to_${filters.end}.csv`,
  };
}
