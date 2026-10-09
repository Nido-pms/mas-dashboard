import { useEffect, useRef, useState } from 'react';
import { errorMessage, isAbortError } from '../../api/client';
import Card from '../../components/Card';
import ConfirmDialog from '../../components/ConfirmDialog';
import CsvButton from '../../components/CsvButton';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import type { Column } from '../../components/ReportTable';
import { downloadCsv } from '../../utils/csv';
import { dmy, today } from '../../utils/format';
import { addEmployee, deleteEmployee, fetchEmployees, updateEmployee } from './api';
import { ROLES, type Employee, type EmployeeIn, type EmployeeList, type Role } from './types';

const columns: Column<Employee>[] = [
  { label: 'Employee ID', value: (e) => e.employee_id },
  { label: 'Name', value: (e) => e.name },
  { label: 'Role', value: (e) => e.role },
  { label: 'Site', value: (e) => e.site },
  { label: 'Client', value: (e) => e.client },
  { label: 'Registration date', value: (e) => dmy(e.registration_date) },
];

const blank = (site = ''): EmployeeIn => ({ name: '', registration_date: today(), employee_id: '', site, client: '', role: 'Operator' });
const squash = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Employee master: add, edit and delete the people who can be marked present. */
export default function EmployeesPage() {
  const [data, setData] = useState<EmployeeList | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<EmployeeIn>(blank());
  const [editing, setEditing] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filter, setFilter] = useState({ site: '', role: '', q: '' });
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchEmployees(undefined, ctrl.signal).then((d) => {
      setData(d);
      setLoadError(null);
      setForm((f) => (f.site ? f : { ...f, site: d.sites[0] ?? '' }));
    }).catch((e) => { if (!isAbortError(e)) setLoadError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [attempt]);

  const reload = () => setAttempt((n) => n + 1);
  const set = (patch: Partial<EmployeeIn>) => {
    setForm((f) => ({ ...f, ...patch }));
    setNotice(null);
  };
  const complete = !!(squash(form.name) && form.registration_date && form.employee_id.trim() && form.site && squash(form.client));

  const reset = () => {
    setEditing(null);
    setForm((f) => ({ ...blank(f.site), client: f.client, role: f.role }));  // keep site, client and role for the next person
  };

  const save = async () => {
    if (!complete || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const e = editing ? await updateEmployee(editing.id, form) : await addEmployee(form);
      setNotice(`${editing ? 'Updated' : 'Added'} ${e.name} (${e.employee_id}).`);
      reset();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const edit = (e: Employee) => {
    const { name, registration_date, employee_id, site, client, role } = e;
    setEditing(e);
    setForm({ name, registration_date, employee_id, site, client, role });
    setNotice(null);
    setActionError(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteEmployee(toDelete.id);
      setNotice(`Deleted ${toDelete.name} (${toDelete.employee_id}).`);
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
  const shown = (data?.employees ?? []).filter((e) =>
    (!filter.site || e.site === filter.site) && (!filter.role || e.role === filter.role)
    && (!q || [e.name, e.employee_id, e.client].some((v) => v.toLowerCase().includes(q))));

  return (
    <>
      <PageHeader title="Employee Master" subtitle="Operators and supervisors of each site and client" />
      <section className={`content${!data && !loadError ? ' is-loading' : ''}`}>
        <div className="container-fluid">
          {loadError && <ErrorAlert message={loadError} onRetry={reload} />}
          {actionError && (
            <div className="alert alert-danger d-flex justify-content-between align-items-center flex-wrap">
              <span><i className="icon fas fa-ban" />{actionError}</span>
              <button type="button" className="close" aria-label="Close" onClick={() => setActionError(null)}><span>&times;</span></button>
            </div>
          )}

          {data && (
            <div ref={formRef}>
              <Card title={editing ? `Edit employee: ${editing.name}` : 'Add employee'} icon={editing ? 'fa-user-edit' : 'fa-user-plus'}>
                <div className="form-row">
                  <div className="form-group col-sm-6 col-lg-4">
                    <label htmlFor="empName">Name</label>
                    <input type="text" id="empName" className="form-control" maxLength={60} value={form.name}
                           onChange={(e) => set({ name: e.target.value })} />
                  </div>
                  <div className="form-group col-sm-6 col-lg-4">
                    <label htmlFor="empId">Employee ID</label>
                    <input type="text" id="empId" className="form-control" maxLength={30} value={form.employee_id}
                           onChange={(e) => set({ employee_id: e.target.value })} />
                  </div>
                  <div className="form-group col-sm-6 col-lg-4">
                    <label htmlFor="empDate">Registration date</label>
                    <input type="date" id="empDate" className="form-control" max={today()} value={form.registration_date}
                           onChange={(e) => set({ registration_date: e.target.value })} />
                  </div>
                  <div className="form-group col-sm-6 col-lg-4">
                    <label htmlFor="empSite">Site</label>
                    <select id="empSite" className="form-control" value={form.site} onChange={(e) => set({ site: e.target.value })}>
                      {data.sites.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group col-sm-6 col-lg-4">
                    <label htmlFor="empClient">Client name</label>
                    <input type="text" id="empClient" className="form-control" maxLength={60} list="empClients" autoComplete="off"
                           placeholder={data.clients.length ? 'Type or pick a client' : 'Type the client name'}
                           value={form.client} onChange={(e) => set({ client: e.target.value })} />
                    <datalist id="empClients">{data.clients.map((c) => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div className="form-group col-sm-6 col-lg-4">
                    <label htmlFor="empRole">Role</label>
                    <select id="empRole" className="form-control" value={form.role} onChange={(e) => set({ role: e.target.value as Role })}>
                      {ROLES.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: '.5rem' }}>
                  <span className={`small ${notice ? 'text-success' : 'text-muted'}`}>
                    {notice ?? 'All fields are required. Employee IDs must be unique.'}
                  </span>
                  <span>
                    {editing && <button type="button" className="btn btn-default mr-2" disabled={saving} onClick={reset}>Cancel</button>}
                    <button type="button" className="btn btn-primary" disabled={!complete || saving} onClick={() => void save()}>
                      <i className={`fas ${saving ? 'fa-spinner fa-spin' : editing ? 'fa-save' : 'fa-plus'} mr-1`} />
                      {editing ? 'Update employee' : 'Add employee'}
                    </button>
                  </span>
                </div>
              </Card>
            </div>
          )}

          {data && (
            <Card title={<>Employees <span className="badge badge-secondary ml-1">{shown.length}</span></>} icon="fa-id-badge"
                  bodyClassName="p-0"
                  tools={<CsvButton disabled={!shown.length} onClick={() => downloadCsv(`employees_${today()}.csv`, columns, shown)} />}>
              <div className="form-inline px-3 py-2" style={{ gap: '.5rem' }}>
                <select aria-label="Filter by site" className="form-control form-control-sm" value={filter.site}
                        onChange={(e) => setFilter((f) => ({ ...f, site: e.target.value }))}>
                  <option value="">All sites</option>
                  {data.sites.map((s) => <option key={s}>{s}</option>)}
                </select>
                <select aria-label="Filter by role" className="form-control form-control-sm" value={filter.role}
                        onChange={(e) => setFilter((f) => ({ ...f, role: e.target.value }))}>
                  <option value="">All roles</option>
                  {ROLES.map((r) => <option key={r}>{r}</option>)}
                </select>
                <input type="search" aria-label="Search" className="form-control form-control-sm" placeholder="Search name, ID or client"
                       value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} />
              </div>
              <div className="report-wrap">
                <table className="table table-sm table-striped table-hover report mb-0">
                  <thead>
                    <tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}<th /></tr>
                  </thead>
                  <tbody>
                    {shown.length ? shown.map((e) => (
                      <tr key={e.id} className={editing?.id === e.id ? 'table-warning' : undefined}>
                        {columns.map((c) => <td key={c.label}>{c.value(e)}</td>)}
                        <td className="text-nowrap">
                          <button type="button" className="btn btn-xs btn-outline-primary mr-1" title="Edit"
                                  aria-label={`Edit ${e.name}`} onClick={() => edit(e)}>
                            <i className="fas fa-pen" />
                          </button>
                          <button type="button" className="btn btn-xs btn-outline-danger" title="Delete"
                                  aria-label={`Delete ${e.name}`} onClick={() => setToDelete(e)}>
                            <i className="fas fa-trash" />
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={columns.length + 1} className="text-center text-muted">
                        {data.employees.length ? 'No employees match the filters.' : 'No employees yet. Add the first one above.'}
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
        <ConfirmDialog title="Delete employee" confirmLabel="Delete" danger busy={deleting}
                       onConfirm={() => void remove()} onCancel={() => setToDelete(null)}>
          Are you sure you want to delete <strong>{toDelete.name}</strong> ({toDelete.employee_id})?
          <div className="small text-muted mt-2">Attendance already marked for them is kept.</div>
        </ConfirmDialog>
      )}
    </>
  );
}
