import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { errorMessage, isAbortError } from '../../api/client';
import Card from '../../components/Card';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import { addDays, dmy, shiftName, today } from '../../utils/format';
import { fetchMachineConfig } from '../machine-config/api';
import type { MachineConfig, ShiftInfo } from '../machine-config/types';
import { deleteSheet, fetchEmployees, fetchSheet, saveSheet } from './api';
import type { Employee, Sheet } from './types';

type Checked = Record<string, string[]>;  // employee id -> machines (empty for supervisors)

/** The shift running now and the date it is reported under (an overnight shift keeps the date it started). */
function currentShift(shifts: ShiftInfo[]): { date: string; shift: string } {
  const h = new Date().getHours();
  for (const s of shifts) {
    if ((h - s.start + 24) % 24 < s.hours) return { date: s.start > s.end && h < s.end ? addDays(today(), -1) : today(), shift: s.name };
  }
  return { date: today(), shift: shifts[0]?.name ?? '' };
}

const fromSheet = (s: Sheet): Checked => Object.fromEntries(s.present.map((p) => [p.employee, p.machines]));
const same = (a: Checked, b: Checked) =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, m]) => b[k]?.join() === m.join());

/** Attendance sheet for one site, date and shift: tick who checked in and assign operators their machines. */
export default function MarkAttendancePage() {
  const [params, setParams] = useSearchParams();
  const [config, setConfig] = useState<MachineConfig | null>(null);
  // Shift running when the config loaded. Fixed then, so a shift change or midnight while ticking people
  // does not switch the page to another sheet and drop the unsaved ticks.
  const [cur, setCur] = useState<{ date: string; shift: string } | null>(null);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [draft, setDraft] = useState<Checked | null>(null);  // null = unchanged
  const [attempt, setAttempt] = useState(0);
  const [version, setVersion] = useState(0);  // bump to reload the sheet
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [client, setClient] = useState('');
  const [confirm, setConfirm] = useState<'save' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  // The selection lives in the URL (?site=&date=&shift=) so the summary can link to a sheet.
  const siteParam = params.get('site') ?? undefined;  // undefined = backend default site
  const site = config?.site;
  const date = params.get('date') || cur?.date || '';
  const wanted = params.get('shift');
  const shift = config?.shifts.some((s) => s.name === wanted) ? wanted! : cur?.shift ?? '';

  useEffect(() => {
    const ctrl = new AbortController();
    setConfig(null);
    fetchMachineConfig(siteParam, ctrl.signal).then((c) => {
      setConfig(c);
      setCur(currentShift(c.shifts));
      setLoadError(null);
    }).catch((e) => { if (!isAbortError(e)) setLoadError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [siteParam, attempt]);

  useEffect(() => {
    if (!site) return;
    const ctrl = new AbortController();
    setEmployees(null);
    fetchEmployees(site, ctrl.signal).then((d) => {
      setEmployees(d.employees);
      setLoadError(null);
    }).catch((e) => { if (!isAbortError(e)) setLoadError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [site, attempt]);

  useEffect(() => {
    if (!site || !date || !shift) return;
    const ctrl = new AbortController();
    setSheet(null);
    fetchSheet(site, date, shift, ctrl.signal).then((s) => {
      setSheet(s);
      setDraft(null);
      setLoadError(null);
    }).catch((e) => { if (!isAbortError(e)) setLoadError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [site, date, shift, version, attempt]);

  const base = sheet ? fromSheet(sheet) : {};
  const checked = draft ?? base;
  const dirty = draft !== null && !same(draft, base);

  const select = (patch: { site?: string; date?: string; shift?: string }) => {
    if (dirty && !window.confirm('You have unsaved attendance. Switch and discard it?')) return;
    const next = { site: site ?? '', date, shift, ...patch };
    if (patch.site && patch.site !== site) next.shift = '';  // shifts differ per site
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
    setDraft(null);
    setNotice(null);
    setActionError(null);
  };

  const update = (c: Checked) => {
    setDraft(c);
    setNotice(null);
  };
  const toggle = (e: Employee) => {
    const { [e.id]: was, ...rest } = checked;
    update(was ? rest : { ...checked, [e.id]: [] });
  };
  const toggleMachine = (e: Employee, m: string) => {
    const mine = checked[e.id] ?? [];
    update({ ...checked, [e.id]: mine.includes(m) ? mine.filter((x) => x !== m) : [...mine, m].sort() });
  };

  const eligible = [...(employees ?? [])].sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  const byId = new Map(eligible.map((e) => [e.id, e]));
  const clients = [...new Set(eligible.map((e) => e.client))].sort();
  const rows = eligible.filter((e) => !client || e.client === client);
  const present = Object.keys(checked).filter((id) => byId.has(id)).map((id) => byId.get(id)!);
  const operators = present.filter((e) => e.role === 'Operator');
  const supervisors = present.length - operators.length;
  const orphans = sheet?.present.filter((p) => !byId.has(p.employee)) ?? [];
  const holders = new Map<string, Employee[]>();  // machine -> operators on it
  for (const e of operators) for (const m of checked[e.id]) holders.set(m, [...(holders.get(m) ?? []), e]);
  const machines = config?.machines.map((m) => m.name) ?? [];

  const problem = !present.length ? 'Check in at least one person.'
    : operators.find((e) => !checked[e.id].length) ? `Assign a machine to ${operators.find((e) => !checked[e.id].length)!.name}.`
      : null;
  const canSubmit = !!sheet && !problem && (dirty || !sheet.updated_at) && !busy;

  const submit = async () => {
    if (!site || !canSubmit) return;
    setBusy(true);
    setActionError(null);
    try {
      const saved = await saveSheet(site, { date, shift, entries: present.map((e) => ({ employee: e.id, machines: checked[e.id] })) });
      setSheet(saved);
      setDraft(null);
      setNotice(`Attendance saved: ${saved.present.length} people, ${shiftName(shift)} ${dmy(date)}.`);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const remove = async () => {
    if (!site) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteSheet(site, date, shift);
      setNotice(`Attendance deleted for ${shiftName(shift)} ${dmy(date)}.`);
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const loading = !loadError && (!config || !employees || !sheet);

  return (
    <>
      <PageHeader title="Mark attendance" subtitle="Who checked in for a shift, and the machines each operator runs" />
      <section className={`content${loading ? ' is-loading' : ''}`}>
        <div className="container-fluid">
          {loadError && <ErrorAlert message={loadError} onRetry={() => setAttempt((n) => n + 1)} />}
          {actionError && (
            <div className="alert alert-danger d-flex justify-content-between align-items-center flex-wrap">
              <span><i className="icon fas fa-ban" />{actionError}</span>
              <button type="button" className="close" aria-label="Close" onClick={() => setActionError(null)}><span>&times;</span></button>
            </div>
          )}

          {config && (
            <Card title="Shift" icon="fa-calendar-check">
              <div className="form-row">
                <div className="form-group col-sm-4">
                  <label htmlFor="atDate">Date</label>
                  <input type="date" id="atDate" className="form-control" max={today()} value={date}
                         onChange={(e) => e.target.value && select({ date: e.target.value })} />
                </div>
                <div className="form-group col-sm-4">
                  <label htmlFor="atSite">Site</label>
                  <select id="atSite" className="form-control" value={config.site} onChange={(e) => select({ site: e.target.value })}>
                    {config.sites.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group col-sm-4">
                  <label htmlFor="atShift">Shift</label>
                  <select id="atShift" className="form-control" value={shift} onChange={(e) => select({ shift: e.target.value })}>
                    {config.shifts.map((s) => <option key={s.name} value={s.name}>{shiftName(s.name)} ({s.label})</option>)}
                  </select>
                </div>
              </div>
              <p className="small mb-0">
                {sheet?.updated_at
                  ? <><span className="badge badge-success mr-1">Marked</span>Last saved {new Date(sheet.updated_at).toLocaleString('en-IN')}. Change it below and submit again, or delete it.</>
                  : <><span className="badge badge-secondary mr-1">Not marked yet</span>Tick the people who checked in and submit.</>}
              </p>
            </Card>
          )}

          {config && employees && !eligible.length && (
            <div className="alert alert-warning">
              <i className="icon fas fa-exclamation-triangle" />
              {config.site} has no employees yet. Add them on
              the <Link to="/employees" className="alert-link">Add employee</Link> page.
            </div>
          )}
          {config && !machines.length && (
            <div className="alert alert-warning">
              <i className="icon fas fa-exclamation-triangle" />
              {config.site} has no machines yet, so operators cannot be assigned. Machines appear once they send scans.
            </div>
          )}
          {orphans.length > 0 && (
            <div className="alert alert-info">
              <i className="icon fas fa-info-circle" />
              {orphans.map((p) => p.name).join(', ')} {orphans.length === 1 ? 'is' : 'are'} in the saved attendance but no
              longer in the Employee Master. Submitting again removes them from this shift.
            </div>
          )}

          {config && sheet && eligible.length > 0 && (
            <Card title={<>Attendance sheet {dirty && <span className="badge badge-warning ml-1">Unsaved</span>}</>} icon="fa-user-check"
                  bodyClassName="p-0"
                  tools={<>
                    <span className="badge badge-info mr-1">{operators.length} operators</span>
                    <span className="badge badge-info mr-1">{supervisors} supervisors</span>
                    <span className="badge badge-secondary">{holders.size} / {machines.length} machines in use</span>
                  </>}
                  footer={
                    <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: '.5rem' }}>
                      <span className={`small ${notice ? 'text-success' : problem && dirty ? 'text-danger' : 'text-muted'}`}>
                        {notice ?? (dirty && problem ? problem
                          : 'Operators need at least one machine. An operator can run several machines, and a machine can have several operators.')}
                      </span>
                      <span>
                        {sheet.updated_at && (
                          <button type="button" className="btn btn-outline-danger mr-2" disabled={busy} onClick={() => setConfirm('delete')}>
                            <i className="fas fa-trash mr-1" />Delete attendance
                          </button>
                        )}
                        <button type="button" className="btn btn-default mr-2" disabled={!dirty || busy} onClick={() => setDraft(null)}>
                          Discard changes
                        </button>
                        <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={() => setConfirm('save')}>
                          <i className="fas fa-check mr-1" />Submit
                        </button>
                      </span>
                    </div>
                  }>
              {clients.length > 1 && (
                <div className="form-inline px-3 py-2" style={{ gap: '.5rem' }}>
                  <label htmlFor="atClient">Client</label>
                  <select id="atClient" className="form-control form-control-sm" value={client} onChange={(e) => setClient(e.target.value)}>
                    <option value="">All clients</option>
                    {clients.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="table-responsive">
                <table className="table table-sm table-hover mb-0 attendance-sheet">
                  <thead>
                    <tr><th>Check in</th><th>Employee ID</th><th>Name</th><th>Role</th><th>Client</th><th>Machines</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => {
                      const on = e.id in checked;
                      return (
                        <tr key={e.id} className={on ? 'table-success' : undefined}>
                          <td>
                            <div className="custom-control custom-checkbox">
                              <input type="checkbox" className="custom-control-input" id={`chk-${e.id}`} checked={on}
                                     onChange={() => toggle(e)} />
                              <label className="custom-control-label" htmlFor={`chk-${e.id}`}><span className="sr-only">Check in {e.name}</span></label>
                            </div>
                          </td>
                          <td>{e.employee_id}</td>
                          <td>{e.name}</td>
                          <td>{e.role}</td>
                          <td>{e.client}</td>
                          <td className="machines">
                            {e.role === 'Supervisor' ? <span className="text-muted small">Not needed</span>
                              : !on ? <span className="text-muted small">Check in first</span>
                                : machines.map((m) => {
                                  const mine = checked[e.id].includes(m);
                                  const others = (holders.get(m) ?? []).filter((o) => o.id !== e.id).map((o) => o.name);
                                  const also = others.length ? ` Also on ${others.join(', ')}.` : '';
                                  return (
                                    <button key={m} type="button" aria-pressed={mine}
                                            title={`${mine ? 'Click to remove.' : 'Click to assign.'}${also}`}
                                            className={`btn btn-xs mr-1 mb-1 ${mine ? 'btn-success' : others.length ? 'btn-outline-info' : 'btn-outline-secondary'}`}
                                            onClick={() => toggleMachine(e, m)}>
                                      {mine && <i className="fas fa-check mr-1" />}{m}
                                    </button>
                                  );
                                })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </section>

      {confirm === 'save' && (
        <ConfirmDialog title="Mark attendance" confirmLabel="Yes, mark attendance" busy={busy}
                       onConfirm={() => void submit()} onCancel={() => setConfirm(null)}>
          <p>Are you sure you want to mark this attendance?</p>
          <ul className="mb-0">
            <li>{site}, {shiftName(shift)}, {dmy(date)}</li>
            <li>{operators.length} operator{operators.length === 1 ? '' : 's'} on {holders.size} machine{holders.size === 1 ? '' : 's'}</li>
            <li>{supervisors} supervisor{supervisors === 1 ? '' : 's'}</li>
          </ul>
          {sheet?.updated_at && <div className="small text-muted mt-2">This replaces the attendance saved earlier for this shift.</div>}
        </ConfirmDialog>
      )}
      {confirm === 'delete' && (
        <ConfirmDialog title="Delete attendance" confirmLabel="Delete" danger busy={busy}
                       onConfirm={() => void remove()} onCancel={() => setConfirm(null)}>
          Are you sure you want to delete the attendance for <strong>{site}, {shiftName(shift)}, {dmy(date)}</strong>?
        </ConfirmDialog>
      )}
    </>
  );
}
