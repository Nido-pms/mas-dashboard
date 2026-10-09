import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage, isAbortError } from '../../api/client';
import Card from '../../components/Card';
import CsvButton from '../../components/CsvButton';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import type { Column } from '../../components/ReportTable';
import { downloadCsv } from '../../utils/csv';
import { addDays, dmy, shiftName, today } from '../../utils/format';
import { fetchEmployees, fetchSummary } from './api';
import type { PersonRef, SummaryRow } from './types';

const names = (people: PersonRef[]) => people.map((p) => p.name).join(', ');

const columns: Column<SummaryRow>[] = [
  { label: 'Date', value: (r) => dmy(r.date) },
  { label: 'Shift', value: (r) => shiftName(r.shift) },
  { label: 'Site', value: (r) => r.site },
  { label: 'Client', value: (r) => r.client },
  { label: 'Operators', value: (r) => r.operators.length, numeric: true },
  { label: 'Operators present', value: (r) => names(r.operators) },
  { label: 'Supervisors', value: (r) => r.supervisors.length, numeric: true },
  { label: 'Supervisors present', value: (r) => names(r.supervisors) },
];
const wide = new Set(['Operators present', 'Supervisors present']);

/** Who was present per date, shift, site and client over a date range. */
export default function AttendanceSummaryPage() {
  const [sites, setSites] = useState<string[]>([]);
  const [filter, setFilter] = useState({ start: addDays(today(), -6), end: today(), site: '', shift: '', client: '' });
  const [rows, setRows] = useState<SummaryRow[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchEmployees(undefined, ctrl.signal).then((d) => setSites(d.sites))
      .catch((e) => { if (!isAbortError(e)) setError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [attempt]);

  const { start, end, site } = filter;
  useEffect(() => {
    if (!start || !end || start > end) {
      setRows([]);  // nothing to show for an incomplete or reversed range; keeps old rows out of the CSV
      return;
    }
    const ctrl = new AbortController();
    setRows(null);
    fetchSummary(site || undefined, start, end, ctrl.signal).then((s) => {
      setRows(s.rows);
      setError(null);
    }).catch((e) => { if (!isAbortError(e)) setError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [start, end, site, attempt]);

  const set = (patch: Partial<typeof filter>) => setFilter((f) => ({ ...f, ...patch }));
  const all = rows ?? [];
  const shifts = [...new Set(all.map((r) => r.shift))];
  const clients = [...new Set(all.map((r) => r.client))].sort();
  const shown = all.filter((r) => (!filter.shift || r.shift === filter.shift) && (!filter.client || r.client === filter.client));

  const editLink = (r: SummaryRow) =>
    `/attendance/mark?${new URLSearchParams({ site: r.site, date: r.date, shift: r.shift })}`;

  return (
    <>
      <PageHeader title="Attendance summary" subtitle="People present per date, shift, site and client" />
      <section className={`content${rows === null && !error ? ' is-loading' : ''}`}>
        <div className="container-fluid">
          {error && <ErrorAlert message={error} onRetry={() => setAttempt((n) => n + 1)} />}

          <Card title="Filters" icon="fa-filter">
            <div className="form-row">
              <div className="form-group col-sm-6 col-lg">
                <label htmlFor="smFrom">From</label>
                <input type="date" id="smFrom" className="form-control" value={start} max={end}
                       onChange={(e) => set({ start: e.target.value })} />
              </div>
              <div className="form-group col-sm-6 col-lg">
                <label htmlFor="smTo">To</label>
                <input type="date" id="smTo" className="form-control" value={end} min={start}
                       onChange={(e) => set({ end: e.target.value })} />
              </div>
              <div className="form-group col-sm-4 col-lg">
                <label htmlFor="smSite">Site</label>
                <select id="smSite" className="form-control" value={site} onChange={(e) => set({ site: e.target.value, shift: '' })}>
                  <option value="">All sites</option>
                  {sites.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group col-sm-4 col-lg">
                <label htmlFor="smShift">Shift</label>
                <select id="smShift" className="form-control" value={filter.shift} onChange={(e) => set({ shift: e.target.value })}>
                  <option value="">All shifts</option>
                  {shifts.map((s) => <option key={s} value={s}>{shiftName(s)}</option>)}
                </select>
              </div>
              <div className="form-group col-sm-4 col-lg">
                <label htmlFor="smClient">Client</label>
                <select id="smClient" className="form-control" value={filter.client} onChange={(e) => set({ client: e.target.value })}>
                  <option value="">All clients</option>
                  {clients.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </Card>

          <Card title={<>Attendance <span className="badge badge-secondary ml-1">{shown.length}</span>
                         <small className="text-muted ml-1">{dmy(start)} to {dmy(end)}</small></>}
                icon="fa-clipboard-list" bodyClassName="p-0"
                tools={<CsvButton disabled={!shown.length} onClick={() =>
                  downloadCsv(`attendance_summary_${start}_to_${end}.csv`, columns, shown)} />}>
            <div className="report-wrap">
              <table className="table table-sm table-striped table-hover report mb-0">
                <thead>
                  <tr>
                    {columns.map((c) => <th key={c.label}>{c.label}</th>)}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.length ? shown.map((r) => (
                    <tr key={`${r.site}|${r.date}|${r.shift}|${r.client}`}>
                      {columns.map((c) => (
                        <td key={c.label}
                            style={wide.has(c.label) ? { whiteSpace: 'normal', minWidth: 200 } : undefined}>
                          {c.numeric ? c.value(r) : c.value(r) || <span className="text-muted">-</span>}
                        </td>
                      ))}
                      <td>
                        <Link to={editLink(r)} className="btn btn-xs btn-outline-primary" title="Edit this attendance">
                          <i className="fas fa-pen" />
                        </Link>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={columns.length + 1} className="text-center text-muted">
                      {rows === null ? 'Loading...' : start > end ? 'The From date is after the To date.' : 'No attendance marked for these dates.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}
