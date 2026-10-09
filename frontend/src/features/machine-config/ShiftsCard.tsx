import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import Card from '../../components/Card';
import ErrorAlert from '../../components/ErrorAlert';
import { saveShifts } from './api';
import SaveBar from './SaveBar';
import type { MachineConfig, Shift } from './types';

// Mirrors the rules in backend/app/schemas/machine_config.py (ShiftsUpdate).
const MAX_SHIFTS = 3;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const hoursOf = (s: Shift) => Array.from({ length: (s.end - s.start + 24) % 24 }, (_, i) => (s.start + i) % 24);
const shown = (name: string) => {
  const n = name.trim().toLowerCase();
  return n.endsWith('shift') ? n : `${n} shift`;
};

const toDraft = (c: MachineConfig): Shift[] => c.shifts.map(({ name, start, end }) => ({ name, start, end }));
const same = (a: Shift[], b: Shift[]) => JSON.stringify(a) === JSON.stringify(b);

/** First problem with the shifts, or null when they can be saved. */
function problem(shifts: Shift[]): string | null {
  if (!shifts.length) return 'Add at least one shift.';
  const names = shifts.map((s) => s.name.trim());
  if (names.some((n) => !n)) return 'Every shift needs a name.';
  if (names.some((n) => ['all', 'outside shift'].includes(n.toLowerCase()))) return 'A shift cannot be named "All" or "Outside shift".';
  if (new Set(names.map(shown)).size !== names.length) return 'Shift names must be unique.';
  const taken = new Map<number, string>();
  for (const s of shifts) {
    if (s.start === s.end) return `${s.name}: start and end cannot be the same hour.`;
    for (const h of hoursOf(s)) {
      if (taken.has(h)) return `${s.name} overlaps ${taken.get(h)} at ${hh(h)}.`;
      taken.set(h, s.name);
    }
  }
  return null;
}

/** A one-hour shift in the first free hour, or null when all 24 hours are used. */
function newShift(shifts: Shift[]): Shift | null {
  const used = new Set(shifts.flatMap(hoursOf));
  const free = HOURS.find((h) => !used.has(h));
  return free === undefined ? null : { name: `Shift ${shifts.length + 1}`, start: free, end: (free + 1) % 24 };
}

interface Props {
  config: MachineConfig;
  onSaved: (updated: MachineConfig) => void;
  onDirtyChange: (dirty: boolean) => void;
}

/** The site's shifts (1 to 3); the MAS reports and automatic day targets use them. */
export default function ShiftsCard({ config, onSaved, onDirtyChange }: Props) {
  const base = toDraft(config);
  const [draft, setDraft] = useState<Shift[] | null>(null);  // null = unchanged
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const shifts = draft ?? base;
  const dirty = draft !== null && !same(draft, base);
  const err = problem(shifts);
  const canSave = dirty && !err && !saving;
  const next = shifts.length < MAX_SHIFTS ? newShift(shifts) : null;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const update = (s: Shift[]) => {
    setDraft(s);
    setSaved(false);
  };
  const edit = (i: number, patch: Partial<Shift>) => update(shifts.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      onSaved(await saveShifts(config.site, shifts.map((s) => ({ ...s, name: s.name.trim() }))));
      setDraft(null);
      setSaved(true);
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const cls = (i: number, k: keyof Shift) => `form-control form-control-sm${base[i]?.[k] !== shifts[i][k] ? ' border-warning' : ''}`;

  return (
    <Card title={<>Shifts {dirty && <span className="badge badge-warning ml-1">Unsaved</span>}</>} icon="fa-business-time"
          bodyClassName="p-0"
          tools={<span className="badge badge-secondary">
            {shifts.length} shift{shifts.length === 1 ? '' : 's'} &middot; {shifts.reduce((n, s) => n + hoursOf(s).length, 0)} h / day
          </span>}
          footer={<SaveBar dirty={dirty} canSave={canSave} saving={saving} label="Save shifts" onSave={() => void save()}
                           onDiscard={() => { setDraft(null); setSaveError(null); }}
                           note={saved ? 'Shifts saved. The MAS reports now use them.'
                             : `Up to ${MAX_SHIFTS} shifts, in whole hours. An end time earlier than the start means the shift ends the next day; it is reported under the date it starts.`} />}>
      {saveError && <div className="p-2"><ErrorAlert message={saveError} onRetry={() => void save()} /></div>}
      <table className="table mb-0 machine-tree">
        <thead>
          <tr><th>Shift</th><th>Starts</th><th>Ends</th><th>Hours</th><th /></tr>
        </thead>
        <tbody>
          {shifts.map((s, i) => (
            <tr key={i}>
              <td>
                <input type="text" maxLength={30} aria-label={`Name of shift ${i + 1}`}
                       className={`${cls(i, 'name')}${s.name.trim() ? '' : ' is-invalid'}`}
                       value={s.name} onChange={(e) => edit(i, { name: e.target.value })} />
              </td>
              <td data-label="Starts">
                <select className={cls(i, 'start')} aria-label={`Start of ${s.name}`} value={s.start}
                        onChange={(e) => edit(i, { start: Number(e.target.value) })}>
                  {HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}
                </select>
              </td>
              <td data-label="Ends">
                <select className={cls(i, 'end')} aria-label={`End of ${s.name}`} value={s.end}
                        onChange={(e) => edit(i, { end: Number(e.target.value) })}>
                  {HOURS.map((h) => <option key={h} value={h}>{hh(h)}{h < s.start ? ' (next day)' : ''}</option>)}
                </select>
              </td>
              <td data-label="Hours">{hoursOf(s).length} h</td>
              <td>
                <button type="button" className="btn btn-sm btn-outline-danger" disabled={shifts.length === 1}
                        title={shifts.length === 1 ? 'A site needs at least one shift' : `Remove ${s.name}`}
                        aria-label={`Remove ${s.name}`} onClick={() => update(shifts.filter((_, j) => j !== i))}>
                  <i className="fas fa-trash" />
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={5}>
              <button type="button" className="btn btn-sm btn-outline-primary mr-2" disabled={!next}
                      onClick={() => next && update([...shifts, next])}>
                <i className="fas fa-plus mr-1" />Add shift
              </button>
              <span className={`small ${err ? 'text-danger' : 'text-muted'}`}>
                {err ?? (shifts.length >= MAX_SHIFTS ? `Maximum ${MAX_SHIFTS} shifts.` : !next ? 'All 24 hours are already in a shift.' : '')}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
