import { useEffect, useRef, useState } from 'react';
import { errorMessage, isAbortError } from '../../api/client';
import Card from '../../components/Card';
import ConfirmDialog from '../../components/ConfirmDialog';
import CsvButton from '../../components/CsvButton';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import type { Column } from '../../components/ReportTable';
import { downloadCsv } from '../../utils/csv';
import { today } from '../../utils/format';
import { addAlarm, deleteAlarm, fetchAlarmConfig, setStops, updateAlarm } from './api';
import type { AlarmDef, AlarmDefIn } from './types';

const yesNo = (b: boolean) => (b ? 'Yes' : 'No');

const columns: Column<AlarmDef>[] = [
  { label: 'SN', value: (a) => a.sn, numeric: true },
  { label: 'Alarm', value: (a) => a.name },
  { label: 'Address', value: (a) => a.address },
  { label: 'Machine stops', value: (a) => yesNo(a.machine_stops) },
];

interface Form { sn: string; name: string; address: string; machine_stops: boolean }
const blank = (sn = ''): Form => ({ sn, name: '', address: '', machine_stops: true });
const squash = (s: string) => s.trim().replace(/\s+/g, ' ');
const nextSn = (list: AlarmDef[]) => String(list.reduce((m, a) => Math.max(m, a.sn), 0) + 1);

/** Alarm configuration: the PLC alarms of a site, their PLC address and whether they stop the machine. */
export default function AlarmConfigPage() {
  const [requestedSite, setRequestedSite] = useState<string>();  // undefined = backend default site
  const [site, setSite] = useState('');
  const [sites, setSites] = useState<string[]>([]);
  const [alarms, setAlarms] = useState<AlarmDef[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<Form>(blank());
  const [editing, setEditing] = useState<AlarmDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());  // ids whose yes/no settings are being saved
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AlarmDef | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filter, setFilter] = useState({ stops: '', q: '' });
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchAlarmConfig(requestedSite, ctrl.signal).then((d) => {
      setAlarms(d.alarms);
      setSite(d.site);
      setSites(d.sites);
      setForm((f) => (f.sn ? f : { ...f, sn: nextSn(d.alarms) }));
      setLoadError(null);
    }).catch((e) => { if (!isAbortError(e)) setLoadError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [requestedSite, attempt]);

  const reload = () => setAttempt((n) => n + 1);
  const changeSite = (s: string) => {
    setRequestedSite(s);
    setAttempt((n) => n + 1);  // also reloads when the same site is picked again after a failed load
    setAlarms(null);
    setEditing(null);
    setForm(blank());
    setNotice(null);
    setActionError(null);
  };
  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setNotice(null);
  };
  const sn = Number(form.sn);
  const complete = Number.isInteger(sn) && sn >= 1 && !!squash(form.name) && !!form.address.trim();

  const reset = () => {
    setEditing(null);
    setForm(blank());
  };

  const save = async () => {
    if (!complete || saving) return;
    setSaving(true);
    setActionError(null);
    const body: AlarmDefIn = { sn, name: form.name, address: form.address, machine_stops: form.machine_stops };
    try {
      const a = editing ? await updateAlarm(site, editing.id, body) : await addAlarm(site, body);
      setNotice(`${editing ? 'Updated' : 'Added'} ${a.address} (${a.name}).`);
      reset();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const edit = (a: AlarmDef) => {
    setEditing(a);
    setForm({ sn: String(a.sn), name: a.name, address: a.address, machine_stops: a.machine_stops });
    setNotice(null);
    setActionError(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const changeStops = async (a: AlarmDef, stops: boolean) => {
    setToggling((s) => new Set(s).add(a.id));
    setActionError(null);
    try {
      const saved = await setStops(site, a.id, stops);
      setAlarms((list) => list?.map((x) => (x.id === saved.id ? saved : x)) ?? list);
      if (editing?.id === saved.id) setForm((f) => ({ ...f, machine_stops: saved.machine_stops }));
      setNotice(`${saved.name} ${saved.machine_stops ? 'now stops' : 'no longer stops'} the machine.`);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setToggling((s) => { const next = new Set(s); next.delete(a.id); return next; });
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteAlarm(site, toDelete.id);
      setNotice(`Deleted ${toDelete.address} (${toDelete.name}).`);
      if (editing?.id === toDelete.id) reset();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  const q = filter.q.trim().toLowerCase();
  const all = alarms ?? [];
  const shown = all.filter((a) => (!filter.stops || yesNo(a.machine_stops) === filter.stops)
    && (!q || [a.name, a.address, String(a.sn)].some((v) => v.toLowerCase().includes(q))));
  const stopping = all.filter((a) => a.machine_stops).length;

  return (
    <>
      <PageHeader title="Alarm Configuration"
                  subtitle={`PLC alarms, their address and whether they stop the machine${site ? `, for ${site}` : ''}`}
                  actions={sites.length > 0 && (
                    <span className="d-flex align-items-center" style={{ gap: '.5rem' }}>
                      <label htmlFor="acSite" className="mb-0">Site</label>
                      <select id="acSite" className="form-control form-control-sm" value={site} onChange={(e) => changeSite(e.target.value)}>
                        {sites.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </span>
                  )} />
      <section className={`content${!alarms && !loadError ? ' is-loading' : ''}`}>
        <div className="container-fluid">
          {loadError && <ErrorAlert message={loadError} onRetry={reload} />}
          {actionError && (
            <div className="alert alert-danger d-flex justify-content-between align-items-center flex-wrap">
              <span><i className="icon fas fa-ban" />{actionError}</span>
              <button type="button" className="close" aria-label="Close" onClick={() => setActionError(null)}><span>&times;</span></button>
            </div>
          )}

          {alarms && (
            <div ref={formRef}>
              <Card title={editing ? `Edit alarm: ${editing.address}` : 'Add alarm'} icon={editing ? 'fa-edit' : 'fa-plus-circle'}>
                <div className="form-row">
                  <div className="form-group col-4 col-sm-2 col-lg-1">
                    <label htmlFor="acSn">SN</label>
                    <input type="number" id="acSn" className="form-control" min={1} max={9999} value={form.sn}
                           onChange={(e) => set({ sn: e.target.value })} />
                  </div>
                  <div className="form-group col-8 col-sm-10 col-lg-6">
                    <label htmlFor="acName">Alarm name</label>
                    <input type="text" id="acName" className="form-control" maxLength={80} placeholder="As in the alarm report, e.g. OP1 EMERGENCY ACTIVATED"
                           value={form.name} onChange={(e) => set({ name: e.target.value })} />
                  </div>
                  <div className="form-group col-12 col-sm-4 col-lg-2">
                    <label htmlFor="acAddress">Address</label>
                    <input type="text" id="acAddress" className="form-control" maxLength={20} placeholder="e.g. Alarm1.X0"
                           value={form.address} onChange={(e) => set({ address: e.target.value })} />
                  </div>
                  <div className="form-group col-12 col-sm-8 col-lg-3">
                    <label htmlFor="acStops">Machine stops</label>
                    <select id="acStops" className="form-control" value={yesNo(form.machine_stops)}
                            onChange={(e) => set({ machine_stops: e.target.value === 'Yes' })}>
                      <option>Yes</option>
                      <option>No</option>
                    </select>
                  </div>
                </div>
                <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: '.5rem' }}>
                  <span className={`small ${notice ? 'text-success' : 'text-muted'}`}>
                    {notice ?? 'All fields are required. Addresses must be unique. The name links the alarm to the alarm reports (case and extra spaces ignored).'}
                  </span>
                  <span>
                    {editing && <button type="button" className="btn btn-default mr-2" disabled={saving} onClick={reset}>Cancel</button>}
                    <button type="button" className="btn btn-primary" disabled={!complete || saving} onClick={() => void save()}>
                      <i className={`fas ${saving ? 'fa-spinner fa-spin' : editing ? 'fa-save' : 'fa-plus'} mr-1`} />
                      {editing ? 'Update alarm' : 'Add alarm'}
                    </button>
                  </span>
                </div>
              </Card>
            </div>
          )}

          {alarms && (
            <Card title={<>PLC alarms <span className="badge badge-secondary ml-1">{shown.length}</span></>} icon="fa-bell"
                  bodyClassName="p-0"
                  tools={<CsvButton disabled={!shown.length} onClick={() => downloadCsv(`alarm_configuration_${site.toLowerCase()}_${today()}.csv`, columns, shown)} />}
                  footer={<span className="small text-muted">
                    The alarm name links each alarm to the alarm reports (case and extra spaces ignored). Only alarms that
                    stop the machine are used in the alarm analysis.
                  </span>}>
              <div className="form-inline px-3 py-2" style={{ gap: '.5rem' }}>
                <select aria-label="Filter by machine stops" className="form-control form-control-sm" value={filter.stops}
                        onChange={(e) => setFilter((f) => ({ ...f, stops: e.target.value }))}>
                  <option value="">Machine stops: all ({all.length})</option>
                  <option value="Yes">Stops the machine ({stopping})</option>
                  <option value="No">Does not stop it ({all.length - stopping})</option>
                </select>
                <input type="search" aria-label="Search" className="form-control form-control-sm" placeholder="Search name, address or SN"
                       value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} />
              </div>
              <div className="report-wrap">
                <table className="table table-sm table-striped table-hover report alarm-config mb-0">
                  <thead>
                    <tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}<th /></tr>
                  </thead>
                  <tbody>
                    {shown.length ? shown.map((a) => (
                      <tr key={a.id} className={editing?.id === a.id ? 'table-warning' : undefined}>
                        <td>{a.sn}</td>
                        <td className="name">{a.name}</td>
                        <td>{a.address}</td>
                        <td>
                          <select aria-label={`Machine stops for ${a.name}`} className="form-control form-control-sm" value={yesNo(a.machine_stops)}
                                  disabled={toggling.has(a.id)} onChange={(e) => void changeStops(a, e.target.value === 'Yes')}>
                            <option>Yes</option>
                            <option>No</option>
                          </select>
                        </td>
                        <td className="text-nowrap">
                          <button type="button" className="btn btn-xs btn-outline-primary mr-1" title="Edit"
                                  aria-label={`Edit ${a.name}`} onClick={() => edit(a)}>
                            <i className="fas fa-pen" />
                          </button>
                          <button type="button" className="btn btn-xs btn-outline-danger" title="Delete"
                                  aria-label={`Delete ${a.name}`} onClick={() => setToDelete(a)}>
                            <i className="fas fa-trash" />
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={columns.length + 1} className="text-center text-muted">
                        {all.length ? 'No alarms match the filters.' : 'No alarms configured yet. Add the first one above.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </section>

      {toDelete && (
        <ConfirmDialog title="Delete alarm" confirmLabel="Delete" danger busy={deleting}
                       onConfirm={() => void remove()} onCancel={() => setToDelete(null)}>
          Are you sure you want to delete <strong>{toDelete.name}</strong> ({toDelete.address})?
          <div className="small text-muted mt-2">Its alarms then count as "not configured" in the alarm analysis.</div>
        </ConfirmDialog>
      )}
    </>
  );
}
