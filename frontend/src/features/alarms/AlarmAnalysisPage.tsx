import { useMemo } from 'react';
import Card from '../../components/Card';
import CsvButton from '../../components/CsvButton';
import ReportTable, { type Column } from '../../components/ReportTable';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { downloadCsv } from '../../utils/csv';
import { dmyHms, duration, fmt } from '../../utils/format';
import MasPageFrame from '../mas/components/MasPageFrame';
import { useMas } from '../mas/MasContext';
import { useAlarmAnalysis } from './api';
import StopTimeChart from './StopTimeChart';
import type { AlarmQuery, KeyFinding, MachineStop } from './types';

const columns: Column<MachineStop>[] = [
  { label: 'Machine', value: (r) => r.machine },
  { label: 'Alarm Code', value: (r) => r.alarm_code || '-' },
  { label: 'Alarm Name', value: (r) => r.name,
    title: (r) => (r.grouped.length ? `Also active at the same time (grouped): ${r.grouped.join(', ')}` : '') },
  { label: 'Raise time', value: (r) => dmyHms(r.raised) },
  { label: 'Diffused time', value: (r) => dmyHms(r.cleared) },
  { label: 'Total time', value: (r) => duration(r.duration_s), title: (r) => `${fmt(r.duration_s)} s` },
];

/** Line above the first row of each machine. */
const newMachine = (r: MachineStop, i: number, rows: MachineStop[]) =>
  (i > 0 && rows[i - 1].machine !== r.machine ? 'newshift' : undefined);

// Icon and colour of each key-finding card.
const FINDING_STYLE: Record<string, { icon: string; tone: string }> = {
  stops: { icon: 'fa-hand-paper', tone: 'info' },
  stopped: { icon: 'fa-stopwatch', tone: 'danger' },
  top_cause: { icon: 'fa-bullseye', tone: 'danger' },
  time_lost: { icon: 'fa-hourglass-half', tone: 'warning' },
};

function FindingCard({ finding: f }: { finding: KeyFinding }) {
  const s = FINDING_STYLE[f.key] ?? { icon: 'fa-info-circle', tone: 'secondary' };
  return (
    <div className={`finding-card border-${s.tone}`}>
      <div className={`finding-title text-${s.tone}`}><i className={`fas ${s.icon} mr-1`} />{f.title}</div>
      <div className="finding-value" title={f.value}>{f.value}</div>
      <div className="finding-detail">{f.detail}</div>
    </div>
  );
}

/**
 * Alarm analysis: how long alarms stopped the machine. Machine-stop alarms of one machine whose times overlap are
 * one row, timed from the first raise to the last clear and named after the first alarm raised.
 */
export default function AlarmAnalysisPage() {
  const m = useMas();
  const { options, filters, dayStart } = m;
  const query = useMemo<AlarmQuery | null>(
    () => (options ? { site: options.site, machine: filters.machine, start: filters.start, end: filters.end, dayStart } : null),
    [options, filters.machine, filters.start, filters.end, dayStart],
  );
  const r = useAlarmAnalysis(query);
  useAutoRefresh(r.reload, m.autoRefresh);
  const d = r.data;
  const stops = d?.stops ?? [];
  const capped = !!d && d.stops_total > d.stops.length;
  const hh = `${String(dayStart).padStart(2, '0')}:00`;
  const csvName = `${options?.site.toLowerCase()}_machine_stops_${filters.start}_to_${filters.end}.csv`;
  // Chart series: every machine of the site (so one with no stops shows as 0), or the one picked in the Machine filter.
  const allMachines = [...new Set([...(options?.machines ?? []), ...(d?.machines.map((t) => t.machine) ?? [])])].sort();
  const chartMachines = filters.machine === 'All' ? allMachines : [filters.machine];

  return (
    <MasPageFrame
      title="Alarm analysis"
      subtitle={`Machine stops caused by alarms; days run ${hh} to ${hh} next day`}
      dayWise
      report={{ totals: undefined, error: r.error, loading: r.loading, updatedAt: r.updatedAt, reload: () => void r.reload() }}
    >
      <div className="abnormalities">
        {d && (
          <div className="finding-grid" aria-label="Key findings">
            {d.findings.map((f) => <FindingCard key={f.key} finding={f} />)}
          </div>
        )}

        {d && (
          <Card title="Stop time per day" icon="fa-chart-bar" bodyClassName="p-0" collapsible>
            {chartMachines.length ? (
              <StopTimeChart days={d.days} allMachines={allMachines} machines={chartMachines} start={filters.start} end={filters.end} />
            ) : (
              <p className="text-muted text-center my-4">No machine-stop alarms for these filters.</p>
            )}
          </Card>
        )}

        <Card title={<>Machine stops <span className="badge badge-secondary ml-1">{fmt(d?.stops_total ?? 0)}</span></>}
              icon="fa-hand-paper" bodyClassName="p-0"
              tools={<CsvButton disabled={!stops.length} onClick={() => downloadCsv(csvName, columns, stops)} />}
              footer={
                <div className="d-flex flex-wrap justify-content-between align-items-center" style={{ gap: '.5rem' }}>
                  <span className="small text-muted">
                    Only alarms set to stop the machine on the Alarm Configuration page, machine by machine. Alarms on one
                    machine whose times overlap (e.g. 3000 and 3001 PORT DISCONNECTED) are one row: from the first raise
                    to the last clear, named after the alarm raised first, so no time is counted twice. Point at an alarm
                    name to see the alarms grouped with it.
                  </span>
                  {d && (
                    <span className="text-nowrap text-right">
                      {d.machines.length > 1 && d.machines.map((t) => (
                        <span key={t.machine} className="d-block small">
                          {t.machine}: {duration(t.stop_time_s)} ({fmt(t.stops)} stops)
                        </span>
                      ))}
                      <span className="font-weight-bold">Total machine stop time: {duration(d.stop_time_s)}</span>
                      {capped && <span className="small text-warning ml-2">(table shows the first {fmt(stops.length)})</span>}
                    </span>
                  )}
                </div>
              }>
          <ReportTable columns={columns} rows={stops} rowKey={(x) => `${x.machine}|${x.raised}`} rowClassName={newMachine}
                       emptyText="No machine-stop alarms for these filters." />
        </Card>
      </div>
    </MasPageFrame>
  );
}
