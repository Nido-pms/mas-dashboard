import type { ReactNode } from 'react';
import ErrorAlert from '../../../components/ErrorAlert';
import PageHeader from '../../../components/PageHeader';
import RefreshControls from '../../../components/RefreshControls';
import { useMas } from '../MasContext';
import type { KpiTotals } from '../types';
import MasFilters from './MasFilters';
import MasKpis from './MasKpis';

/** A page's own report, when it is not the shared shift/hour billing report. */
export interface PageReport {
  totals: KpiTotals | undefined;
  error: string | null;
  loading: boolean;
  updatedAt: Date | null;
  reload: () => void;
}

interface Props {
  title: string;
  subtitle: string;
  dayWise?: boolean;               // show "Day starts at" instead of the shift filter
  report?: PageReport;             // defaults to the shared billing report
  children?: ReactNode;
}

/** Common top of every MAS page: header with refresh controls, filters and KPI tiles. */
export default function MasPageFrame({ title, subtitle, dayWise, report, children }: Props) {
  const m = useMas();
  const r: PageReport = report ?? { totals: m.data?.totals, error: m.error, loading: m.loading, updatedAt: m.updatedAt, reload: m.reload };
  const error = m.filtersError ?? r.error;
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={<RefreshControls updatedAt={r.updatedAt} failed={!!error} autoRefresh={m.autoRefresh}
                                  onAutoRefreshChange={m.setAutoRefresh} onRefresh={r.reload} />}
      />
      <section className={`content${r.loading ? ' is-loading' : ''}`}>
        <div className="container-fluid">
          {error && <ErrorAlert message={error} onRetry={m.filtersError ? m.retry : r.reload} />}
          <MasFilters options={m.options} value={m.filters} onChange={m.setFilter} onSiteChange={m.setSite} onRange={m.setRange}
                      dayStart={dayWise ? { value: m.dayStart, onChange: m.setDayStart } : undefined} />
          {r.totals && <MasKpis totals={r.totals} />}
          {children}
        </div>
      </section>
    </>
  );
}
