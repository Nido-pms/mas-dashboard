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
import { addCode, deleteCode, fetchCodes, setScope, updateCode } from './api';
import { SCOPES, type RejectionCode, type RejectionCodeIn, type Scope } from './types';

const columns: Column<RejectionCode>[] = [
  { label: 'Code', value: (c) => c.code },
  { label: 'Rejection name', value: (c) => c.name },
  { label: 'Possible reasons', value: (c) => c.reasons },
  { label: 'Scope', value: (c) => c.scope },
];

const blank = (scope: Scope = 'Client'): RejectionCodeIn => ({ code: '', name: '', reasons: '', scope });
const squash = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Rejection code definitions: what each code means and whether the client or NIDO owns it. */
export default function RejectionCodesPage() {
  const [requestedSite, setRequestedSite] = useState<string>();  // undefined = backend default site
  const [site, setSite] = useState('');                          // site of the list shown
  const [sites, setSites] = useState<string[]>([]);
  const [codes, setCodes] = useState<RejectionCode[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<RejectionCodeIn>(blank());
  const [editing, setEditing] = useState<RejectionCode | null>(null);
  const [saving, setSaving] = useState(false);
  const [scoping, setScoping] = useState<Set<string>>(new Set());  // ids whose scope is being saved
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<RejectionCode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [filter, setFilter] = useState({ scope: '', q: '' });
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchCodes(requestedSite, ctrl.signal).then((d) => {
      setCodes(d.codes);
      setSite(d.site);
      setSites(d.sites);
      setLoadError(null);
    }).catch((e) => { if (!isAbortError(e)) setLoadError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [requestedSite, attempt]);

  const reload = () => setAttempt((n) => n + 1);
  const changeSite = (s: string) => {
    setRequestedSite(s);
    setAttempt((n) => n + 1);  // also reloads when the same site is picked again after a failed load
    setCodes(null);
    setEditing(null);
    setForm((f) => blank(f.scope));
    setNotice(null);
    setActionError(null);
  };
  const set = (patch: Partial<RejectionCodeIn>) => {
    setForm((f) => ({ ...f, ...patch }));
    setNotice(null);
  };
  const complete = !!(form.code.trim() && squash(form.name));

  const reset = () => {
    setEditing(null);
    setForm((f) => blank(f.scope));
  };

  const save = async () => {
    if (!complete || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const c = editing ? await updateCode(site, editing.id, form) : await addCode(site, form);
      setNotice(`${editing ? 'Updated' : 'Added'} ${c.code} (${c.name}).`);
      reset();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const edit = (c: RejectionCode) => {
    const { code, name, reasons, scope } = c;
    setEditing(c);
    setForm({ code, name, reasons, scope });
    setNotice(null);
    setActionError(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const changeScope = async (c: RejectionCode, scope: Scope) => {
    setScoping((s) => new Set(s).add(c.id));
    setActionError(null);
    try {
      const saved = await setScope(site, c.id, scope);
      setCodes((list) => list?.map((x) => (x.id === saved.id ? saved : x)) ?? list);
      if (editing?.id === saved.id) setForm((f) => ({ ...f, scope: saved.scope }));
      setNotice(`${saved.code} is now attributed to ${saved.scope}.`);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setScoping((s) => { const next = new Set(s); next.delete(c.id); return next; });
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteCode(site, toDelete.id);
      setNotice(`Deleted ${toDelete.code} (${toDelete.name}).`);
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
  const shown = (codes ?? []).filter((c) => (!filter.scope || c.scope === filter.scope)
    && (!q || [c.code, c.name, c.reasons].some((v) => v.toLowerCase().includes(q))));
  const count = (s: Scope) => (codes ?? []).filter((c) => c.scope === s).length;

  return (
    <>
      <PageHeader title="Rejection Code Definition"
                  subtitle={`What each rejection code means and who it is attributed to${site ? `, for ${site}` : ''}`}
                  actions={sites.length > 0 && (
                    <span className="d-flex align-items-center" style={{ gap: '.5rem' }}>
                      <label htmlFor="rcSite" className="mb-0">Site</label>
                      <select id="rcSite" className="form-control form-control-sm" value={site} onChange={(e) => changeSite(e.target.value)}>
                        {sites.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </span>
                  )} />
      <section className={`content${!codes && !loadError ? ' is-loading' : ''}`}>
        <div className="container-fluid">
          {loadError && <ErrorAlert message={loadError} onRetry={reload} />}
          {actionError && (
            <div className="alert alert-danger d-flex justify-content-between align-items-center flex-wrap">
              <span><i className="icon fas fa-ban" />{actionError}</span>
              <button type="button" className="close" aria-label="Close" onClick={() => setActionError(null)}><span>&times;</span></button>
            </div>
          )}

          {codes && (
            <div ref={formRef}>
              <Card title={editing ? `Edit rejection code: ${editing.code}` : 'Add rejection code'} icon={editing ? 'fa-edit' : 'fa-plus-circle'}>
                <div className="form-row">
                  <div className="form-group col-sm-4 col-lg-2">
                    <label htmlFor="rcCode">Code</label>
                    <input type="text" id="rcCode" className="form-control text-uppercase" maxLength={10} placeholder="e.g. DBAR"
                           value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="form-group col-sm-8 col-lg-6">
                    <label htmlFor="rcName">Rejection name</label>
                    <input type="text" id="rcName" className="form-control" maxLength={60} value={form.name}
                           onChange={(e) => set({ name: e.target.value })} />
                  </div>
                  <div className="form-group col-sm-4 col-lg-4">
                    <label htmlFor="rcScope">Scope</label>
                    <select id="rcScope" className="form-control" value={form.scope} onChange={(e) => set({ scope: e.target.value as Scope })}>
                      {SCOPES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group col-12">
                    <label htmlFor="rcReasons">Possible reasons</label>
                    <textarea id="rcReasons" className="form-control" rows={2} maxLength={500} value={form.reasons}
                              onChange={(e) => set({ reasons: e.target.value })} />
                  </div>
                </div>
                <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: '.5rem' }}>
                  <span className={`small ${notice ? 'text-success' : 'text-muted'}`}>
                    {notice ?? 'Code and name are required. Codes must be unique.'}
                  </span>
                  <span>
                    {editing && <button type="button" className="btn btn-default mr-2" disabled={saving} onClick={reset}>Cancel</button>}
                    <button type="button" className="btn btn-primary" disabled={!complete || saving} onClick={() => void save()}>
                      <i className={`fas ${saving ? 'fa-spinner fa-spin' : editing ? 'fa-save' : 'fa-plus'} mr-1`} />
                      {editing ? 'Update code' : 'Add code'}
                    </button>
                  </span>
                </div>
              </Card>
            </div>
          )}

          {codes && (
            <Card title={<>Rejection codes <span className="badge badge-secondary ml-1">{shown.length}</span></>} icon="fa-ban"
                  bodyClassName="p-0"
                  tools={<CsvButton disabled={!shown.length} onClick={() => downloadCsv(`rejection_codes_${today()}.csv`, columns, shown)} />}>
              <div className="form-inline px-3 py-2" style={{ gap: '.5rem' }}>
                <select aria-label="Filter by scope" className="form-control form-control-sm" value={filter.scope}
                        onChange={(e) => setFilter((f) => ({ ...f, scope: e.target.value }))}>
                  <option value="">All scopes ({codes.length})</option>
                  {SCOPES.map((s) => <option key={s} value={s}>{s} ({count(s)})</option>)}
                </select>
                <input type="search" aria-label="Search" className="form-control form-control-sm" placeholder="Search code, name or reason"
                       value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} />
              </div>
              <div className="report-wrap">
                <table className="table table-sm table-striped table-hover report rejection-codes mb-0">
                  <thead>
                    <tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}<th /></tr>
                  </thead>
                  <tbody>
                    {shown.length ? shown.map((c) => (
                      <tr key={c.id} className={editing?.id === c.id ? 'table-warning' : undefined}>
                        <td className="font-weight-bold">{c.code}</td>
                        <td>{c.name}</td>
                        <td className="reasons">{c.reasons || <span className="text-muted">—</span>}</td>
                        <td>
                          <select aria-label={`Scope of ${c.code}`} className="form-control form-control-sm" value={c.scope}
                                  disabled={scoping.has(c.id)} onChange={(e) => void changeScope(c, e.target.value as Scope)}>
                            {SCOPES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="text-nowrap">
                          <button type="button" className="btn btn-xs btn-outline-primary mr-1" title="Edit"
                                  aria-label={`Edit ${c.code}`} onClick={() => edit(c)}>
                            <i className="fas fa-pen" />
                          </button>
                          <button type="button" className="btn btn-xs btn-outline-danger" title="Delete"
                                  aria-label={`Delete ${c.code}`} onClick={() => setToDelete(c)}>
                            <i className="fas fa-trash" />
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={columns.length + 1} className="text-center text-muted">
                        {codes.length ? 'No rejection codes match the filters.' : 'No rejection codes yet. Add the first one above.'}
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
        <ConfirmDialog title="Delete rejection code" confirmLabel="Delete" danger busy={deleting}
                       onConfirm={() => void remove()} onCancel={() => setToDelete(null)}>
          Are you sure you want to delete <strong>{toDelete.code}</strong> ({toDelete.name})?
        </ConfirmDialog>
      )}
    </>
  );
}
