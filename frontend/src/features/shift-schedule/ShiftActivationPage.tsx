import { useEffect, useMemo, useState } from 'react';
import { errorMessage, isAbortError } from '../../api/client';
import Card from '../../components/Card';
import { shortNames } from '../../components/charts/kit';
import CsvButton from '../../components/CsvButton';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import ReportTable, { type Column } from '../../components/ReportTable';
import { downloadCsv } from '../../utils/csv';
import { addDays, dmy, shiftName, today } from '../../utils/format';
import ActivationCalendar from './ActivationCalendar';
import { fetchInactiveScans, fetchSchedule, saveWeekly, setOverride } from './api';
import { ALL, WEEKDAYS, type DateOverride, type InactiveScan, type ScheduleConfig } from './types';

const key = (weekday: number, shift: string, machine: string) => `${weekday}|${shift}|${machine}`;
const weekdayOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;   // 0 = Monday

const scanColumns: Column<InactiveScan>[] = [
  { label: 'Date', value: (r) => dmy(r.date) },
  { label: 'Shift', value: (r) => shiftName(r.shift) },
  { label: 'Machine', value: (r) => r.machine },
  { label: 'Parcels scanned', value: (r) => r.induction, numeric: true, total: true },
  { label: 'Rejected', value: (r) => r.rejected, numeric: true, total: true },
  { label: 'First hour', value: (r) => r.first_hour },
  { label: 'Last hour', value: (r) => r.last_hour },
  { label: 'Switched off by', value: (r) => r.reason },
];

/** Shift activation: which shifts each machine runs (weekly pattern + date changes), and parcels scanned in shifts that were off. */
export default function ShiftActivationPage() {
  const [requestedSite, setRequestedSite] = useState<string>();
  const [cfg, setCfg] = useState<ScheduleConfig | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<Set<string> | null>(null);   // weekly pattern being edited; null = unchanged
  const [saving, setSaving] = useState(false);
  const [day, setDay] = useState(today());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [range, setRange] = useState({ start: addDays(today(), -6), end: today() });
  const [scans, setScans] = useState<InactiveScan[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanVersion, setScanVersion] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchSchedule(requestedSite, ctrl.signal).then((c) => {
      setCfg(c);
      setLoadError(null);
    }).catch((e) => { if (!isAbortError(e)) setLoadError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [requestedSite, attempt]);

  const site = cfg?.site;
  useEffect(() => {
    if (!site || !range.start || !range.end || range.start > range.end) return;
    const ctrl = new AbortController();
    setScans(null);
    fetchInactiveScans(site, range.start, range.end, ctrl.signal).then((r) => {
      setScans(r.rows);
      setScanError(null);
    }).catch((e) => { if (!isAbortError(e)) setScanError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [site, range.start, range.end, scanVersion]);

  const saved = useMemo(() => new Set((cfg?.weekly_off ?? []).map((r) => key(r.weekday, r.shift, r.machine))), [cfg]);
  const weekly = draft ?? saved;
  const dirty = draft !== null && (draft.size !== saved.size || [...draft].some((k) => !saved.has(k)));
  const short = shortNames(cfg?.machines ?? []);
  const label = (m: string) => (m === ALL ? 'All machines' : short.get(m) ?? m);
  const overrides = new Map((cfg?.overrides ?? []).map((o) => [`${o.date}|${o.shift}|${o.machine}`, o.active]));

  /** Whether the weekly pattern alone runs this shift. */
  const weeklyActive = (wd: number, shift: string, machine: string, set = weekly) =>
    !set.has(key(wd, shift, ALL)) && (machine === ALL || !set.has(key(wd, shift, machine)));
  /** Whether the shift runs on a date: date change for the machine, then for all machines, then the saved pattern. */
  const activeOn = (date: string, shift: string, machine: string) => {
    for (const m of machine === ALL ? [ALL] : [machine, ALL]) {
      const o = overrides.get(`${date}|${shift}|${m}`);
      if (o !== undefined) return o;
    }
    return weeklyActive(weekdayOf(date), shift, machine, saved);
  };

  const toggleWeekly = (wd: number, shift: string, machine: string) => {
    const next = new Set(weekly);
    const k = key(wd, shift, machine);
    if (next.has(k)) next.delete(k); else next.add(k);
    setDraft(next);
    setNotice(null);
  };

  const run = async (fn: () => Promise<ScheduleConfig>, ok: string) => {
    setActionError(null);
    try {
      setCfg(await fn());
      setNotice(ok);
      setScanVersion((v) => v + 1);   // the exception table depends on the schedule
      return true;
    } catch (err) {
      setActionError(errorMessage(err));
      return false;
    }
  };

  const save = async () => {
    if (!site || !draft) return;
    setSaving(true);
    const rules = [...draft].map((k) => { const [w, s, m] = k.split('|'); return { weekday: Number(w), shift: s, machine: m }; });
    if (await run(() => saveWeekly(site, rules), 'Weekly pattern saved. The reports use it from now on.')) setDraft(null);
    setSaving(false);
  };

  const changeDate = async (shift: string, machine: string, value: string) => {
    if (!site) return;
    const active = value === 'on' ? true : value === 'off' ? false : null;
    setBusyKey(`${shift}|${machine}`);
    await run(() => setOverride(site, day, shift, machine, active),
              `${shiftName(shift)}, ${label(machine)} on ${dmy(day)}: ${active === null ? 'back to the weekly pattern' : active ? 'active' : 'inactive'}.`);
    setBusyKey(null);
  };

  const removeOverride = (o: DateOverride) => site && void run(() => setOverride(site, o.date, o.shift, o.machine, null),
                                                                `Removed the change for ${shiftName(o.shift)}, ${label(o.machine)} on ${dmy(o.date)}.`);

  const changeSite = (s: string) => {
    if (dirty && !window.confirm('The weekly pattern has unsaved changes. Switch site and discard them?')) return;
    setDraft(null);
    setCfg(null);
    setRequestedSite(s);
    setAttempt((n) => n + 1);
    setNotice(null);
  };

  const rows = cfg ? cfg.shifts.flatMap((s) => [ALL, ...cfg.machines].map((m) => ({ shift: s, machine: m }))) : [];
  const offCount = cfg ? rows.reduce((n, r) => n + WEEKDAYS.filter((_, wd) => weekly.has(key(wd, r.shift, r.machine))).length, 0) : 0;

  return (
    <>
      <PageHeader title="Shift Activation"
                  subtitle={`Which shifts each machine runs; switched-off shifts get no target in the reports${site ? `, for ${site}` : ''}`}
                  actions={cfg && cfg.sites.length > 0 && (
                    <span className="d-flex align-items-center" style={{ gap: '.5rem' }}>
                      <label htmlFor="saSite" className="mb-0">Site</label>
                      <select id="saSite" className="form-control form-control-sm" value={cfg.site} onChange={(e) => changeSite(e.target.value)}>
                        {cfg.sites.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </span>
                  )} />
      <section className={`content${!cfg && !loadError ? ' is-loading' : ''}`}>
        <div className="container-fluid">
          {loadError && <ErrorAlert message={loadError} onRetry={() => setAttempt((n) => n + 1)} />}
          {actionError && (
            <div className="alert alert-danger d-flex justify-content-between align-items-center flex-wrap">
              <span><i className="icon fas fa-ban" />{actionError}</span>
              <button type="button" className="close" aria-label="Close" onClick={() => setActionError(null)}><span>&times;</span></button>
            </div>
          )}
          {notice && <div className="alert alert-success py-2"><i className="icon fas fa-check" />{notice}</div>}

          {cfg && (
            <ActivationCalendar shifts={cfg.shifts} machines={cfg.machines} isActive={activeOn} selected={day}
                                changedDates={new Set(cfg.overrides.map((o) => o.date))}
                                onPick={(d) => { setDay(d); document.getElementById('saDateCard')?.scrollIntoView({ behavior: 'smooth' }); }} />
          )}

          {cfg && (
            <Card title={<>Weekly pattern {dirty && <span className="badge badge-warning ml-1">Unsaved</span>}</>} icon="fa-calendar-week" bodyClassName="p-0"
                  tools={<span className="badge badge-secondary">{offCount} switched off</span>}
                  footer={
                    <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: '.5rem' }}>
                      <span className="small text-muted">
                        Click a day to switch the shift off or on for every week. "All machines" switches the whole shift; a machine row
                        switches only that machine. Everything is on until switched off.
                      </span>
                      <span>
                        <button type="button" className="btn btn-default mr-2" disabled={!dirty || saving} onClick={() => setDraft(null)}>Discard</button>
                        <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
                          <i className={`fas ${saving ? 'fa-spinner fa-spin' : 'fa-save'} mr-1`} />Save weekly pattern
                        </button>
                      </span>
                    </div>
                  }>
              <div className="report-wrap">
                <table className="table table-sm report schedule-grid mb-0">
                  <thead>
                    <tr><th>Shift</th><th>Machine</th>{WEEKDAYS.map((d) => <th key={d}>{d}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map(({ shift, machine }, i) => (
                      <tr key={`${shift}|${machine}`} className={`${machine === ALL ? 'schedule-all' : ''}${i > 0 && machine === ALL ? ' newshift' : ''}`}>
                        <td>{machine === ALL ? shiftName(shift) : ''}</td>
                        <td title={machine === ALL ? undefined : machine}>{label(machine)}</td>
                        {WEEKDAYS.map((d, wd) => {
                          const allOff = machine !== ALL && weekly.has(key(wd, shift, ALL));
                          const on = weeklyActive(wd, shift, machine);
                          return (
                            <td key={d}>
                              <button type="button" className={`schedule-toggle ${on ? 'is-on' : 'is-off'}`} disabled={allOff}
                                      aria-pressed={on} aria-label={`${shiftName(shift)} ${label(machine)} on ${d}: ${on ? 'active' : 'inactive'}`}
                                      title={allOff ? 'Switched off for all machines' : `Click to switch ${on ? 'off' : 'on'}`}
                                      onClick={() => toggleWeekly(wd, shift, machine)}>
                                {on ? 'On' : 'Off'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {cfg && (
            <Card id="saDateCard" title="Changes for a date" icon="fa-calendar-day" bodyClassName="p-0"
                  footer={<span className="small text-muted">
                    A change for a date overrides the weekly pattern for that date only, e.g. a holiday, a breakdown or an extra shift.
                    It is saved as soon as you pick it.
                  </span>}>
              <div className="abn-toolbar">
                <label htmlFor="saDay" className="mb-0 font-weight-bold">Date</label>
                <input type="date" id="saDay" className="form-control form-control-sm" style={{ maxWidth: 180 }} value={day}
                       onChange={(e) => e.target.value && setDay(e.target.value)} />
                <span className="small text-muted">{WEEKDAYS[weekdayOf(day)]}</span>
              </div>
              <div className="report-wrap">
                <table className="table table-sm report schedule-grid mb-0">
                  <thead>
                    <tr><th>Shift</th><th>Machine</th><th>Weekly pattern</th><th>Setting for {dmy(day)}</th><th>Runs that day</th></tr>
                  </thead>
                  <tbody>
                    {rows.map(({ shift, machine }, i) => {
                      const o = overrides.get(`${day}|${shift}|${machine}`);
                      const pattern = weeklyActive(weekdayOf(day), shift, machine, saved);
                      const runs = activeOn(day, shift, machine);
                      return (
                        <tr key={`${shift}|${machine}`} className={`${machine === ALL ? 'schedule-all' : ''}${i > 0 && machine === ALL ? ' newshift' : ''}`}>
                          <td>{machine === ALL ? shiftName(shift) : ''}</td>
                          <td title={machine === ALL ? undefined : machine}>{label(machine)}</td>
                          <td className="text-muted">{pattern ? 'On' : 'Off'}</td>
                          <td>
                            <select className="form-control form-control-sm" style={{ maxWidth: 210 }} disabled={busyKey === `${shift}|${machine}`}
                                    aria-label={`Setting for ${shiftName(shift)}, ${label(machine)} on ${dmy(day)}`}
                                    value={o === undefined ? 'pattern' : o ? 'on' : 'off'}
                                    onChange={(e) => void changeDate(shift, machine, e.target.value)}>
                              <option value="pattern">Use weekly pattern</option>
                              <option value="on">Active on this date</option>
                              <option value="off">Inactive on this date</option>
                            </select>
                          </td>
                          <td><span className={`schedule-pill ${runs ? 'is-on' : 'is-off'}`}>{runs ? 'Active' : 'Inactive'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {cfg.overrides.length > 0 && (
                <div className="px-3 py-2 border-top">
                  <div className="small font-weight-bold mb-1">All date changes ({cfg.overrides.length})</div>
                  <div className="d-flex flex-wrap" style={{ gap: '.4rem' }}>
                    {cfg.overrides.map((o) => (
                      <span key={`${o.date}|${o.shift}|${o.machine}`} className={`schedule-chip ${o.active ? 'is-on' : 'is-off'}`}>
                        <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setDay(o.date)} title="Show this date">
                          {dmy(o.date)} · {shiftName(o.shift)} · {label(o.machine)}: {o.active ? 'active' : 'inactive'}
                        </button>
                        <button type="button" className="close ml-2" aria-label="Remove this change" onClick={() => removeOverride(o)}>
                          <span>&times;</span>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {cfg && (
            <Card title={<>Parcels scanned in switched-off shifts <span className="badge badge-secondary ml-1">{scans?.length ?? 0}</span></>}
                  icon="fa-exclamation-circle" bodyClassName="p-0"
                  tools={<CsvButton disabled={!scans?.length}
                                    onClick={() => scans && downloadCsv(`${cfg.site.toLowerCase()}_inactive_shift_scans_${range.start}_to_${range.end}.csv`, scanColumns, scans)} />}
                  footer={<span className="small text-muted">
                    These shifts were switched off for the machine, but it still scanned parcels. The reports give them no target
                    and still count their parcels; check whether the shift actually ran.
                  </span>}>
              <div className="abn-toolbar">
                <label htmlFor="saFrom" className="mb-0">From</label>
                <input type="date" id="saFrom" className="form-control form-control-sm" style={{ maxWidth: 170 }} value={range.start} max={range.end}
                       onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
                <label htmlFor="saTo" className="mb-0">To</label>
                <input type="date" id="saTo" className="form-control form-control-sm" style={{ maxWidth: 170 }} value={range.end} min={range.start}
                       onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
              </div>
              {scanError && <div className="p-2"><ErrorAlert message={scanError} onRetry={() => setScanVersion((v) => v + 1)} /></div>}
              <ReportTable columns={scanColumns} rows={scans ?? []} rowKey={(r) => `${r.date}|${r.shift}|${r.machine}`}
                           emptyText={scans === null ? 'Loading...' : range.start > range.end ? 'The From date is after the To date.'
                             : 'None: no machine scanned parcels in a switched-off shift.'} />
            </Card>
          )}
        </div>
      </section>
    </>
  );
}
