import { apiGet } from '../../api/client';
import { useReport } from '../../hooks/useReport';
import type { AbnormalityQuery, AbnormalityReport } from './types';

export const fetchAbnormalities = (q: AbnormalityQuery, signal?: AbortSignal) =>
  apiGet<AbnormalityReport>('/abnormalities', {
    site: q.site, machine: q.machine, day_start: q.dayStart, start_date: q.start, end_date: q.end, min_series: q.minSeries, min_scans: q.minScans,
  }, signal);

export const useAbnormalities = (query: AbnormalityQuery | null) => useReport(query, fetchAbnormalities);
