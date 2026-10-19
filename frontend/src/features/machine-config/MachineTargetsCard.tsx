import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import Card from '../../components/Card';
import ErrorAlert from '../../components/ErrorAlert';
import { fmt } from '../../utils/format';
import { saveMachineConfig } from './api';
import SaveBar from './SaveBar';
import type { MachineConfig } from './types';

const MAX_HOUR = 1_000_000;
const isWhole = (v: string, max: number) => /^\d+$/.test(v) && Number(v) <= max;

type Drafts = Record<string, string>;  // machine -> target per hour as typed

/** Saved targets as form values; machines without a target show the value in use (site fallback). */
const toDraft = (c: MachineConfig): Drafts =>
  Object.fromEntries(c.machines.map((m) => [m.name, String(m.target ?? c.default_target)]));

interface Props {
  config: MachineConfig;
  onSaved: (updated: MachineConfig) => void;
  onDirtyChange: (dirty: boolean) => void;
}

/** Target parcels per hour for each machine; day and shift targets follow from the active shift hours. */
export default function MachineTargetsCard({ config: c, onSaved, onDirtyChange }: Props) {
  const base = toDraft(c);
  const [drafts, setDrafts] = useState<Drafts>({});  // only machines being edited
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const draftOf = (name: string) => drafts[name] ?? base[name];
  const dirty = c.machines.some(({ name }) => draftOf(name) !== base[name]);
  const invalidCount = c.machines.filter(({ name }) => !isWhole(draftOf(name), MAX_HOUR)).length;
  const canSave = dirty && invalidCount === 0 && !saving;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const edit = (name: string, value: string) => {
    setDrafts((d) => ({ ...d, [name]: value }));
    setSaved(false);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      onSaved(await saveMachineConfig(c.site, {
        machines: c.machines.map(({ name }) => ({ name, target: Number(draftOf(name)) })),
      }));
      setDrafts({});
      setSaved(true);
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={<>Machine targets {dirty && <span className="badge badge-warning ml-1">Unsaved</span>}</>} icon="fa-cogs"
          bodyClassName="p-0"
          tools={<span className="badge badge-secondary">{c.machines.length} machine{c.machines.length === 1 ? '' : 's'}</span>}
          footer={<SaveBar dirty={dirty} canSave={canSave} saving={saving} label="Save targets" onSave={() => void save()}
                           onDiscard={() => { setDrafts({}); setSaveError(null); }}
                           note={saved
                             ? <>Targets saved. The <Link to="/">MAS reports</Link> now use them.</>
                             : <>Day and shift targets = target per hour × the hours of the shifts that are active (set on the{' '}
                                 <Link to="/shift-activation">Shift Activation</Link> page).</>} />}>
      {saveError && <div className="p-2"><ErrorAlert message={saveError} onRetry={() => void save()} /></div>}
      <table className="table mb-0 machine-tree">
        <thead>
          <tr><th>Machine</th><th>Target / hour</th><th>Day, all {c.shift_hours_per_day} shift hours on</th></tr>
        </thead>
        <tbody>
          {c.machines.length === 0 && (
            <tr><td colSpan={3} className="text-muted">No machines found in the scans for this site.</td></tr>
          )}
          {c.machines.map(({ name }) => {
            const d = draftOf(name);
            const bad = !isWhole(d, MAX_HOUR);
            return (
              <tr key={name}>
                <td><i className="fas fa-cog text-muted mr-2" />{name}</td>
                <td data-label="Target / hour">
                  <input type="number" min={0} max={MAX_HOUR} step={1} aria-label={`Hourly target for ${name}`}
                         className={`form-control form-control-sm${bad ? ' is-invalid' : d !== base[name] ? ' border-warning' : ''}`}
                         value={d} onChange={(e) => edit(name, e.target.value)} />
                  <div className="invalid-feedback">Whole number from 0 to {fmt(MAX_HOUR)}.</div>
                </td>
                <td data-label="Day, all shifts on" className="text-muted" title="Lower on days with shifts switched off">
                  {bad ? '-' : fmt(Number(d) * c.shift_hours_per_day)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
