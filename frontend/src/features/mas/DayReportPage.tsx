import { useMemo } from 'react';
import Card from '../../components/Card';
import CsvButton from '../../components/CsvButton';
import ReportTable from '../../components/ReportTable';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { downloadCsv } from '../../utils/csv';
import { dayColumns } from './columns';
import MasPageFrame from './components/MasPageFrame';
import VarianceLegend from './components/VarianceLegend';
import { useMas } from './MasContext';
import type { DayQuery } from './types';
import { useDayWise } from './useBilling';

export default function DayReportPage() {
  const m = useMas();
  const { options, filters, dayStart } = m;
  const query = useMemo<DayQuery | null>(
    () => (options ? { site: options.site, machine: filters.machine, start: filters.start, end: filters.end, dayStart } : null),
    [options, filters.machine, filters.start, filters.end, dayStart],
  );
  const day = useDayWise(query);
  useAutoRefresh(day.reload, m.autoRefresh);
  const hh = `${String(dayStart).padStart(2, '0')}:00`;

  return (
    <MasPageFrame
      title="Day-wise report"
      subtitle={`Induction against target per day, ${hh} to ${hh} next day`}
      dayWise
      report={{ totals: day.data?.totals, error: day.error, loading: day.loading, updatedAt: day.updatedAt, reload: () => void day.reload() }}
    >
      <Card title="Day-wise report" icon="fa-calendar-day" bodyClassName="p-0"
            tools={<CsvButton disabled={!day.data} onClick={() => day.data && downloadCsv(m.csvName('day'), dayColumns, day.data.days)} />}
            footer={<VarianceLegend />}>
        <ReportTable columns={dayColumns} rows={day.data?.days ?? []} rowKey={(r) => r.date}
                     emptyText="No scans for these filters." />
      </Card>
    </MasPageFrame>
  );
}
