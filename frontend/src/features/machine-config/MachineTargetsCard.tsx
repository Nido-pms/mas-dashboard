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
const MAX_DAY = 100_000_000;
const isWhole = (v: string, max: number) => /^\d+$/.test(v) && Number(v) <= max;

interface Draft {
  hour: string;  // required
  day: string;   // '' = automatic (hourly × shift hours per day)
}
type Drafts = Record<string, Draft>;  // machine -> targets as typed

/** Saved targets as form values; machines without an hourly target show the value in use (site fallback). */
const toDraft = (c: MachineConfig): Drafts => Object.fromEntries(c.machines.map((m) => [m.name, {
  hour: String(m.target ?? c.default_target),
  day: m.day_target === null ? '' : String(m.day_target),
}]));

const invalid = (d: Draft) => ({ hour: !isWhole(d.hour, MAX_HOUR), day: d.day !== '' && !isWhole(d.day, MAX_DAY) });

interface Props {
  config: MachineConfig;
  onSaved: (updated: MachineConfig) => void;
  onDirtyChange: (dirty: boolean) => void;
}

/** Target parcels per machine of the site, per hour and per day. */
export default function MachineTargetsCard({ config: c, onSaved, onDirtyChange }: Props) {
  const base = toDraft(c);
  const [drafts, setDrafts] = useState<Drafts>({});  // only machines being edited
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const draftOf = (name: string): Draft => drafts[name] ?? base[name];
  const dirty = c.machines.some(({ name }) => {
    const d = draftOf(name);
    return d.hour !== base[name].hour || d.day !== base[name].day;
  });
  const invalidCount = c.machines.filter(({ name }) => {
    const bad = invalid(draftOf(name));
    return bad.hour || bad.day;
  }).length;
  const canSave = dirty && invalidCount === 0 && !saving;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const edit = (name: string, patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [name]: { ...draftOf(name), ...patch } }));
    setSaved(false);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      onSaved(await saveMachineConfig(c.site, {
        machines: c.machines.map(({ name }) => {
          const d = draftOf(name);
          return { name, target: Number(d.hour), day_target: d.day === '' ? null : Number(d.day) };
        }),
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
                             : <>Blank day target = hourly target × {c.shift_hours_per_day} shift hours per day.</>} />}>
      {saveError && <div className="p-2"><ErrorAlert message={saveError} onRetry={() => void save()} /></div>}
      <table className="table mb-0 machine-tree">
        <thead>
          <tr><th>Machine</th><th>Target / hour</th><th>Target / day</th></tr>
        </thead>
        <tbody>
          {c.machines.length === 0 && (
            <tr><td colSpan={3} className="text-muted">No machines found in the scans for this site.</td></tr>
          )}
          {c.machines.map(({ name }) => {
            const d = draftOf(name);
            const bad = invalid(d);
            const autoDay = bad.hour ? null : Number(d.hour) * c.shift_hours_per_day;
            const cls = (isBad: boolean, changed: boolean) =>
              `form-control form-control-sm${isBad ? ' is-invalid' : changed ? ' border-warning' : ''}`;
            return (
              <tr key={name}>
                <td><i className="fas fa-cog text-muted mr-2" />{name}</td>
                <td data-label="Target / hour">
                  <input type="number" min={0} max={MAX_HOUR} step={1} aria-label={`Hourly target for ${name}`}
                         className={cls(bad.hour, d.hour !== base[name].hour)}
                         value={d.hour} onChange={(e) => edit(name, { hour: e.target.value })} />
                  <div className="invalid-feedback">Whole number from 0 to {fmt(MAX_HOUR)}.</div>
                </td>
                <td data-label="Target / day">
                  <input type="number" min={0} max={MAX_DAY} step={1} aria-label={`Day target for ${name}`}
                         className={cls(bad.day, d.day !== base[name].day)}
                         placeholder={autoDay === null ? 'Auto' : `Auto (${fmt(autoDay)})`}
                         value={d.day} onChange={(e) => edit(name, { day: e.target.value })} />
                  <div className="invalid-feedback">Whole number from 0 to {fmt(MAX_DAY)}, or blank for auto.</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
