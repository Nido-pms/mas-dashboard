import Card from '../../../components/Card';
import type { FilterOptions, Filters } from '../types';

interface Props {
  options: FilterOptions | null;
  value: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onSiteChange: (site: string) => void;
  onRange: (days: number) => void;  // 0 = all dates
  /** Day-wise report: show "Day starts at" instead of the shift filter. */
  dayStart?: { value: number; onChange: (hour: number) => void };
}

const col = 'form-group col-12 col-sm-6 col-lg-4 col-xl';
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function MasFilters({ options, value, onChange, onSiteChange, onRange, dayStart }: Props) {
  const min = options?.min_date ?? '';
  const max = options?.max_date ?? '';
  return (
    <Card title="Filters" icon="fa-filter" collapsible>
      <div className="form-row align-items-end">
        <div className={col}>
          <label htmlFor="site">Site</label>
          <select id="site" className="form-control" value={options?.site ?? ''} onChange={(e) => onSiteChange(e.target.value)}>
            {options?.sites.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className={col}>
          <label htmlFor="machine">Machine</label>
          <select id="machine" className="form-control" value={value.machine} onChange={(e) => onChange({ machine: e.target.value })}>
            <option value="All">All machines</option>
            {options?.machines.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {dayStart ? (
          <div className={col}>
            <label htmlFor="dayStart">Day starts at</label>
            <select id="dayStart" className="form-control border-primary" value={dayStart.value}
                    onChange={(e) => dayStart.onChange(Number(e.target.value))}>
              {HOURS.map((h) => <option key={h} value={h}>{hh(h)}</option>)}
            </select>
          </div>
        ) : (
          <div className={col}>
            <label htmlFor="shift">Shift</label>
            <select id="shift" className="form-control" value={value.shift} onChange={(e) => onChange({ shift: e.target.value })}>
              <option value="All">All shifts</option>
              {options?.shifts.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.label})</option>)}
              <option value="Outside shift">Outside shift</option>
            </select>
          </div>
        )}
        <div className={col}>
          <label htmlFor="start">Start date</label>
          <input type="date" id="start" className="form-control" min={min} max={max} value={value.start}
                 onChange={(e) => onChange({ start: e.target.value })} />
        </div>
        <div className={col}>
          <label htmlFor="end">End date</label>
          <input type="date" id="end" className="form-control" min={min} max={max} value={value.end}
                 onChange={(e) => onChange({ end: e.target.value })} />
        </div>
        <div className="form-group col-12 mb-0">
          <div className="btn-group btn-group-sm">
            <button type="button" className="btn btn-default" onClick={() => onRange(1)}>Last day</button>
            <button type="button" className="btn btn-default" onClick={() => onRange(7)}>7 days</button>
            <button type="button" className="btn btn-default" onClick={() => onRange(0)}>All</button>
          </div>
        </div>
      </div>
    </Card>
  );
}
