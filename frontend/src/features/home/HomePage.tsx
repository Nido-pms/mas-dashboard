import { useMemo } from 'react';
import Card from '../../components/Card';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import MasPageFrame from '../mas/components/MasPageFrame';
import { useMas } from '../mas/MasContext';
import { useHome } from './api';
import ParcelCalendar from './ParcelCalendar';
import RejectionCodeChart from './RejectionCodeChart';
import RejectionTrendChart from './RejectionTrendChart';
import TargetTrendChart from './TargetTrendChart';
import type { HomeQuery } from './types';

/** Home: the production trend and the rejection trend per machine. */
export default function HomePage() {
  const m = useMas();
  const { options, filters, dayStart } = m;
  const query = useMemo<HomeQuery | null>(
    () => (options ? { site: options.site, machine: filters.machine, start: filters.start, end: filters.end, dayStart } : null),
    [options, filters.machine, filters.start, filters.end, dayStart],
  );
  const r = useHome(query);
  useAutoRefresh(r.reload, m.autoRefresh);
  const d = r.data;

  const allMachines = [...new Set([...(options?.machines ?? []), ...(d?.machine_days.map((x) => x.machine) ?? [])])].sort();
  const chartMachines = filters.machine === 'All' ? allMachines : [filters.machine];

  const hh = `${String(dayStart).padStart(2, '0')}:00`;

  return (
    <MasPageFrame
      title="Home"
      subtitle={`Production, rejection and rejection-code trends for the selected filters; days run ${hh} to ${hh} next day`}
      dayWise
      report={{ totals: undefined, error: r.error, loading: r.loading, updatedAt: r.updatedAt, reload: () => void r.reload() }}
    >
      <div className="abnormalities">
        {options && <ParcelCalendar site={options.site} machines={options.machines} shifts={options.shifts.map((s) => s.name)} />}

        <div className="home-charts">
        {d && (
          <Card title="Target vs inducted per day" icon="fa-chart-bar" bodyClassName="p-0" collapsible>
            <TargetTrendChart days={d.days} start={filters.start} end={filters.end} />
          </Card>
        )}

        {d && (
          <Card title="Rejection trend per day and machine" icon="fa-chart-line" bodyClassName="p-0" collapsible>
            {chartMachines.length ? (
              <RejectionTrendChart rows={d.machine_days} allMachines={allMachines} machines={chartMachines}
                                   start={filters.start} end={filters.end} />
            ) : <p className="text-muted text-center my-4">No scans for these filters.</p>}
          </Card>
        )}
        </div>

        {d && (
          <Card title="Rejection codes per day and machine" icon="fa-tags" bodyClassName="p-0" collapsible>
            <RejectionCodeChart rows={d.code_days} codes={d.codes} allMachines={allMachines} machines={chartMachines}
                                start={filters.start} end={filters.end} />
          </Card>
        )}

      </div>
    </MasPageFrame>
  );
}
