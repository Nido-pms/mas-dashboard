import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage, isAbortError } from '../../api/client';
import ErrorAlert from '../../components/ErrorAlert';
import PageHeader from '../../components/PageHeader';
import { fetchMachineConfig } from './api';
import MachineTargetsCard from './MachineTargetsCard';
import ShiftsCard from './ShiftsCard';
import type { MachineConfig } from './types';

type Section = 'shifts' | 'targets';

/** One site's configuration at a time: shifts and machine targets. The site is kept in the URL (?site=). */
export default function MachineConfigPage() {
  const [params, setParams] = useSearchParams();
  const site = params.get('site') ?? undefined;  // undefined = backend default site
  const [attempt, setAttempt] = useState(0);
  const [config, setConfig] = useState<MachineConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<Section, boolean>>({ shifts: false, targets: false });

  useEffect(() => {
    const ctrl = new AbortController();
    setConfig(null);
    fetchMachineConfig(site, ctrl.signal).then((c) => {
      setConfig(c);
      setLoadError(null);
    }).catch((e) => { if (!isAbortError(e)) setLoadError(errorMessage(e)); });
    return () => ctrl.abort();
  }, [site, attempt]);

  // Stable callbacks so the cards' effects don't re-run on every render.
  const onDirty = useMemo(() => {
    const set = (k: Section) => (d: boolean) => setDirty((s) => (s[k] === d ? s : { ...s, [k]: d }));
    return { shifts: set('shifts'), targets: set('targets') };
  }, []);
  const anyDirty = Object.values(dirty).some(Boolean);

  const changeSite = (next: string) => {
    if (anyDirty && !window.confirm('You have unsaved changes for this site. Switch site and discard them?')) return;
    setDirty({ shifts: false, targets: false });
    setParams({ site: next });
  };

  return (
    <>
      <PageHeader title="Machine Configuration" subtitle="Shifts and machine targets for each site"
                  actions={config && (
                    <div className="form-inline">
                      <label htmlFor="configSite" className="mr-2"><i className="fas fa-industry mr-1 text-primary" />Site</label>
                      <select id="configSite" className="form-control border-primary" value={config.site}
                              onChange={(e) => changeSite(e.target.value)}>
                        {config.sites.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  )} />
      <section className={`content${!config && !loadError ? ' is-loading' : ''}`}>
        <div className="container-fluid">
          {loadError && <ErrorAlert message={loadError} onRetry={() => setAttempt((n) => n + 1)} />}
          {config && (
            <div key={config.site}>
              <p className="text-muted small">
                Showing the configuration of <strong>{config.site}</strong>.
                {config.updated_at && <> Last saved {new Date(config.updated_at).toLocaleString('en-IN')}.</>}
              </p>
              <ShiftsCard config={config} onSaved={setConfig} onDirtyChange={onDirty.shifts} />
              <MachineTargetsCard config={config} onSaved={setConfig} onDirtyChange={onDirty.targets} />            </div>
          )}
        </div>
      </section>
    </>
  );
}
