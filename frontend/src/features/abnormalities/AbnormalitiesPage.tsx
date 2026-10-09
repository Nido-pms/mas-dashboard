import { useMemo, useState } from 'react';
import Card from '../../components/Card';
import CsvButton from '../../components/CsvButton';
import InfoBox from '../../components/InfoBox';
import ReportTable, { type Column } from '../../components/ReportTable';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { downloadCsv } from '../../utils/csv';
import { dmy, fmt } from '../../utils/format';
import MasPageFrame from '../mas/components/MasPageFrame';
import { useMas } from '../mas/MasContext';
import { useAbnormalities } from './api';
import type { AbnormalityQuery, DbarSeries, DuplicateDay, DuplicateParcel, MissingBagSeal } from './types';

/** "2026-10-08T03:15:17.708" -> "08-10-2026 03:15:17" */
const dmyHms = (ts: string) => `${dmy(ts.slice(0, 10))} ${ts.slice(11, 19)}`;

/** A whole number from localStorage within [2, 1000], else `fallback`. */
const savedCount = (key: string, fallback: number) => {
  const v = Number(localStorage.getItem(key) ?? fallback);
  return Number.isInteger(v) && v >= 2 && v <= 1000 ? v : fallback;
};
const MIN_SERIES_KEY = 'abnormalities.minSeries';
const MIN_SCANS_KEY = 'abnormalities.minScans';

// The tables of the page; only the selected one is shown.
const VIEWS = {
  duplicateDays: 'Duplicate parcels per day',
  duplicates: 'Duplicate parcels, each barcode',
  dbarDays: 'DBAR series per day',
  dbarMax: 'Longest DBAR series per day',
  dbarHours: 'DBAR series by hour',
  dbarSeries: 'DBAR series, each one',
  missingBagSeal: 'Not rejected but no bag seal',
} as const;
type View = keyof typeof VIEWS;

// "Type" dropdown, then "View" dropdown with that type's tables (first one shown when the type changes).
const TYPES: { label: string; views: { view: View; label: string }[] }[] = [
  { label: '1. Duplicate parcels', views: [{ view: 'duplicateDays', label: 'Day-wise' }, { view: 'duplicates', label: 'Each barcode' }] },
  { label: '2. DBAR series', views: [{ view: 'dbarMax', label: 'Maximum per day' }, { view: 'dbarDays', label: 'Day-wise' },
                                    { view: 'dbarHours', label: 'Hour-wise' }, { view: 'dbarSeries', label: 'Each series (machine, time)' }] },
  { label: '3. Not rejected, no bag seal', views: [{ view: 'missingBagSeal', label: 'Parcel list' }] },
];
const typeOf = (v: View) => TYPES.findIndex((t) => t.views.some((x) => x.view === v));

const VIEW_KEY = 'abnormalities.view';
const savedView = (): View => {
  const v = localStorage.getItem(VIEW_KEY);
  return v && Object.hasOwn(VIEWS, v) ? (v as View) : 'duplicateDays';
};

const duplicateDayColumns: Column<DuplicateDay>[] = [
  { label: 'Date', value: (r) => dmy(r.date) },
  { label: 'Duplicate barcodes', value: (r) => r.barcodes, numeric: true, total: true },
  { label: 'Scans of them', value: (r) => r.scans, numeric: true, total: true },
];

const duplicateColumns: Column<DuplicateParcel>[] = [
  { label: 'Date', value: (r) => dmy(r.date) },
  { label: 'Barcode', value: (r) => r.barcode },
  { label: 'Scans', value: (r) => r.scans, numeric: true, total: true },
  { label: 'Confirmed', value: (r) => r.confirmed, numeric: true, total: true },
  { label: 'Rejected', value: (r) => r.rejected, numeric: true, total: true },
  { label: 'Rejection codes', value: (r) => r.codes.join(', ') },
  { label: 'Machines', value: (r) => r.machines.join(', ') },
  { label: 'First scan', value: (r) => dmyHms(r.first) },
  { label: 'Last scan', value: (r) => dmyHms(r.last) },
];

/** How many DBAR series of each length there were, per day (and hour). */
interface SeriesCount {
  date: string;
  hour: string;  // '' in the day-wise table
  length: number;
  quantity: number;
}

/** Line above the first row of each date, as on the shift-wise report. */
const newDate = (r: SeriesCount, i: number, rows: SeriesCount[]) => (i > 0 && rows[i - 1].date !== r.date ? 'newshift' : undefined);

function countSeries(series: DbarSeries[], byHour: boolean, dayStart: number): SeriesCount[] {
  const rows = new Map<string, SeriesCount>();
  for (const s of series) {
    const hour = byHour ? s.hour : '';
    const key = `${s.date}|${hour}|${s.length}`;
    const row = rows.get(key) ?? { date: s.date, hour, length: s.length, quantity: 0 };
    row.quantity += 1;
    rows.set(key, row);
  }
  // Hours in the order they happen within a day that starts at `dayStart` (post-midnight hours come last).
  const order = (hour: string) => (hour ? (Number(hour.slice(0, 2)) - dayStart + 24) % 24 : 0);
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date) || order(a.hour) - order(b.hour) || a.length - b.length);
}

const seriesCountColumns = (byHour: boolean): Column<SeriesCount>[] => [
  { label: 'Date', value: (r) => dmy(r.date) },
  ...(byHour ? [{ label: 'Hour', value: (r: SeriesCount) => r.hour }] : []),
  { label: 'Series (DBAR in a row)', value: (r) => r.length, numeric: true },
  { label: 'Quantity (times it happened)', value: (r) => r.quantity, numeric: true, total: true },
  { label: 'DBAR rejections (series × quantity)', value: (r) => r.length * r.quantity, numeric: true, total: true },
];
const dbarDayColumns = seriesCountColumns(false);
const dbarHourColumns = seriesCountColumns(true);

/** The longest DBAR series of each day (the earliest one when several are equally long). */
interface DayMax {
  date: string;
  longest: DbarSeries;
  series: number;  // all series that day
}

function maxPerDay(series: DbarSeries[]): DayMax[] {
  const days = new Map<string, DayMax>();
  for (const s of series) {
    const d = days.get(s.date);
    if (!d) days.set(s.date, { date: s.date, longest: s, series: 1 });
    else {
      d.series += 1;
      if (s.length > d.longest.length || (s.length === d.longest.length && s.first < d.longest.first)) d.longest = s;
    }
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const dbarMaxColumns: Column<DayMax>[] = [
  { label: 'Date', value: (r) => dmy(r.date) },
  { label: 'Longest series (DBAR in a row)', value: (r) => r.longest.length, numeric: true },
  { label: 'Machine', value: (r) => r.longest.machine },
  { label: 'From', value: (r) => dmyHms(r.longest.first) },
  { label: 'To', value: (r) => dmyHms(r.longest.last) },
  { label: 'Series that day', value: (r) => r.series, numeric: true, total: true },
];

const dbarColumns: Column<DbarSeries>[] = [
  { label: 'Date', value: (r) => dmy(r.date) },
  { label: 'Hour', value: (r) => r.hour },
  { label: 'Machine', value: (r) => r.machine },
  { label: 'Series (DBAR in a row)', value: (r) => r.length, numeric: true },
  { label: 'From', value: (r) => dmyHms(r.first) },
  { label: 'To', value: (r) => dmyHms(r.last) },
];

const bagSealColumns: Column<MissingBagSeal>[] = [
  { label: 'Date', value: (r) => dmy(r.date) },
  { label: 'Inscan time', value: (r) => dmyHms(r.timestamp) },
  { label: 'Barcode', value: (r) => r.barcode },
  { label: 'Machine', value: (r) => r.machine },
  { label: 'Package status', value: (r) => r.status },
  { label: 'Chute', value: (r) => r.chute },
];

/** Duplicate parcels, DBAR rejections in series and parcels that were not rejected but have no bag seal. */
export default function AbnormalitiesPage() {
  const m = useMas();
  const { options, filters, dayStart } = m;
  const [view, setView] = useState(savedView);
  const [minSeries, setMinSeries] = useState(() => savedCount(MIN_SERIES_KEY, 5));
  const [draft, setDraft] = useState(String(minSeries));
  const [minScans, setMinScans] = useState(() => savedCount(MIN_SCANS_KEY, 2));
  const [scansDraft, setScansDraft] = useState(String(minScans));
  const [barcode, setBarcode] = useState('');

  const query = useMemo<AbnormalityQuery | null>(
    () => (options ? { site: options.site, machine: filters.machine, start: filters.start, end: filters.end, dayStart, minSeries, minScans } : null),
    [options, filters.machine, filters.start, filters.end, dayStart, minSeries, minScans],
  );
  const r = useAbnormalities(query);
  useAutoRefresh(r.reload, m.autoRefresh);
  const d = r.data;

  const show = (v: View) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  /** Apply a typed count once it is a whole number from 2 to 1000; until then only the box changes. */
  const changeCount = (v: string, setDraftValue: (v: string) => void, apply: (n: number) => void, key: string) => {
    setDraftValue(v);
    const n = Number(v);
    if (v !== '' && Number.isInteger(n) && n >= 2 && n <= 1000) {
      apply(n);
      localStorage.setItem(key, String(n));
    }
  };

  const q = barcode.trim().toLowerCase();
  const duplicates = (d?.duplicates ?? []).filter((p) => !q || p.barcode.toLowerCase().includes(q));
  const csv = (kind: string) => `${options?.site.toLowerCase()}_${kind}_${filters.start}_to_${filters.end}.csv`;
  const hh = `${String(dayStart).padStart(2, '0')}:00`;
  const dupScans = d?.duplicate_days.reduce((s, x) => s + x.scans, 0) ?? 0;
  const longest = d?.dbar_days.reduce((s, x) => Math.max(s, x.longest), 0) ?? 0;
  const dbarDays = useMemo(() => countSeries(d?.dbar_series ?? [], false, dayStart), [d, dayStart]);
  const dbarHours = useMemo(() => countSeries(d?.dbar_series ?? [], true, dayStart), [d, dayStart]);
  const dbarMax = useMemo(() => maxPerDay(d?.dbar_series ?? []), [d]);
  const bagSealCapped = !!d && d.missing_bagseal_total > d.missing_bagseal.length;

  // Rows shown in the badge, and the CSV download, of each table.
  const count: Record<View, number> = {
    duplicateDays: d?.duplicate_days.length ?? 0,
    duplicates: duplicates.length,
    dbarDays: dbarDays.length,
    dbarMax: dbarMax.length,
    dbarHours: dbarHours.length,
    dbarSeries: d?.dbar_series.length ?? 0,
    missingBagSeal: d?.missing_bagseal_total ?? 0,
  };
  const download: Record<View, () => void> = {
    duplicateDays: () => d && downloadCsv(csv('duplicate_days'), duplicateDayColumns, d.duplicate_days),
    duplicates: () => downloadCsv(csv('duplicate_parcels'), duplicateColumns, duplicates),
    dbarDays: () => downloadCsv(csv('dbar_series_day_wise'), dbarDayColumns, dbarDays),
    dbarMax: () => downloadCsv(csv('dbar_longest_series_per_day'), dbarMaxColumns, dbarMax),
    dbarHours: () => downloadCsv(csv('dbar_series_hour_wise'), dbarHourColumns, dbarHours),
    dbarSeries: () => d && downloadCsv(csv('dbar_series'), dbarColumns, d.dbar_series),
    missingBagSeal: () => d && downloadCsv(csv(bagSealCapped ? `missing_bagseal_latest_${d.missing_bagseal.length}_of_${d.missing_bagseal_total}` : 'missing_bagseal'),
                                           bagSealColumns, d.missing_bagseal),
  };
  const dbarNote = 'Series = DBAR rejections in a row on one machine. Quantity = how many times a series of that length happened. '
    + 'Example: series 6, quantity 2 means 6 DBARs in a row happened twice.';
  const dupNote = `Same barcode scanned ${d?.min_scans ?? minScans} or more times in a day. NoRead barcodes are left out.`;
  const notes: Partial<Record<View, string>> = {
    duplicateDays: dupNote,
    duplicates: dupNote,
    dbarDays: dbarNote,
    dbarMax: 'The longest series of DBAR rejections in a row on one machine each day, with when it happened. '
      + 'When two series are equally long, the earlier one is shown.',
    dbarHours: dbarNote,
    dbarSeries: 'One row per series, with the machine and the time of its first and last DBAR.',
  };
  const dbar = typeOf(view) === 1;
  const dup = typeOf(view) === 0;

  return (
    <MasPageFrame
      title="Abnormalities"
      subtitle={`Duplicate parcels, DBAR rejections in series and missing bag seals; days run ${hh} to ${hh} next day`}
      dayWise
      report={{ totals: undefined, error: r.error, loading: r.loading, updatedAt: r.updatedAt, reload: () => void r.reload() }}
    >
      <div className="abnormalities">
        {d && (
          <div className="kpi-grid">
            <InfoBox label={`Duplicate barcodes (${d.min_scans}+ scans)`} value={fmt(d.duplicates.length)} sub={`${fmt(dupScans)} scans of them`}
                     icon="fa-clone" color={d.duplicates.length ? 'bg-warning' : 'bg-success'} />
            <InfoBox label={`DBAR series (${d.min_series}+ in a row)`} value={fmt(d.dbar_series.length)}
                     sub={longest ? `longest: ${fmt(longest)} in a row` : 'none'}
                     icon="fa-barcode" color={d.dbar_series.length ? 'bg-danger' : 'bg-success'} />
            <InfoBox label="Not rejected, no bag seal" value={fmt(d.missing_bagseal_total)} sub="package status ≠ Rejected"
                     icon="fa-shopping-bag" color={d.missing_bagseal_total ? 'bg-danger' : 'bg-success'} />
          </div>
        )}

        <Card title={<>{VIEWS[view]} <span className="badge badge-secondary ml-1">{fmt(count[view])}</span></>}
              icon="fa-table" bodyClassName="p-0"
              tools={<CsvButton disabled={!count[view]} onClick={download[view]} />}
              footer={
                notes[view] ? <span className="small text-muted">{notes[view]}</span>
                  : view === 'missingBagSeal' && d && d.missing_bagseal_total > d.missing_bagseal.length ? (
                    <span className="small text-warning">
                      Showing the latest {fmt(d.missing_bagseal.length)} of {fmt(d.missing_bagseal_total)}. Narrow the dates to see the rest.
                    </span>
                  ) : undefined
              }>
          <div className="abn-toolbar">
            <span className="abn-toolbar-group abn-picker">
              <label htmlFor="abnType" className="mb-0 font-weight-bold">Type</label>
              <select id="abnType" className="form-control form-control-sm abn-view border-primary" value={typeOf(view)}
                      onChange={(e) => show(TYPES[Number(e.target.value)].views[0].view)}>
                {TYPES.map((t, i) => <option key={t.label} value={i}>{t.label}</option>)}
              </select>
            </span>
            <span className="abn-toolbar-group abn-picker">
              <label htmlFor="abnView" className="mb-0 font-weight-bold">View</label>
              <select id="abnView" className="form-control form-control-sm abn-view border-primary" value={view}
                      onChange={(e) => show(e.target.value as View)}>
                {TYPES[typeOf(view)].views.map((v) => <option key={v.view} value={v.view}>{v.label} ({fmt(count[v.view])})</option>)}
              </select>
            </span>
            {dup && (
              <span className="abn-toolbar-group small">
                <label htmlFor="minScans" className="mb-0">Duplicate count: scanned</label>
                <input type="number" id="minScans" className="form-control form-control-sm abn-number"
                       min={2} max={1000} value={scansDraft}
                       onChange={(e) => changeCount(e.target.value, setScansDraft, setMinScans, MIN_SCANS_KEY)}
                       onBlur={() => setScansDraft(String(minScans))} />
                <span className="text-muted">or more times in a day</span>
              </span>
            )}
            {view === 'duplicates' && (
              <input type="search" aria-label="Search barcode" className="form-control form-control-sm"
                     placeholder="Search barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            )}
            {dbar && (
              <span className="abn-toolbar-group small">
                <label htmlFor="minSeries" className="mb-0">A series is at least</label>
                <input type="number" id="minSeries" className="form-control form-control-sm abn-number"
                       min={2} max={1000} value={draft}
                       onChange={(e) => changeCount(e.target.value, setDraft, setMinSeries, MIN_SERIES_KEY)}
                       onBlur={() => setDraft(String(minSeries))} />
                <span className="text-muted">DBAR rejections in a row on one machine</span>
              </span>
            )}
          </div>

          {view === 'duplicateDays' && (
            <ReportTable columns={duplicateDayColumns} rows={d?.duplicate_days ?? []} rowKey={(x) => x.date}
                         emptyText="No duplicate parcels for these filters." />
          )}
          {view === 'duplicates' && (
            <ReportTable columns={duplicateColumns} rows={duplicates} rowKey={(x) => `${x.date}|${x.barcode}`}
                         emptyText={q ? 'No duplicate parcel matches this barcode.' : 'No duplicate parcels for these filters.'} />
          )}
          {view === 'dbarDays' && (
            <ReportTable columns={dbarDayColumns} rows={dbarDays} rowKey={(x) => `${x.date}|${x.length}`}
                         rowClassName={newDate} emptyText="No DBAR series for these filters." />
          )}
          {view === 'dbarMax' && (
            <ReportTable columns={dbarMaxColumns} rows={dbarMax} rowKey={(x) => x.date} emptyText="No DBAR series for these filters." />
          )}
          {view === 'dbarHours' && (
            <ReportTable columns={dbarHourColumns} rows={dbarHours} rowKey={(x) => `${x.date}|${x.hour}|${x.length}`}
                         rowClassName={newDate} emptyText="No DBAR series for these filters." />
          )}
          {view === 'dbarSeries' && (
            <ReportTable columns={dbarColumns} rows={d?.dbar_series ?? []} rowKey={(x) => `${x.machine}|${x.first}`}
                         emptyText="No DBAR series for these filters." />
          )}
          {view === 'missingBagSeal' && (
            <ReportTable columns={bagSealColumns} rows={d?.missing_bagseal ?? []}
                         rowKey={(x) => `${x.timestamp}|${x.barcode}|${x.machine}`}
                         emptyText="None: every parcel that was not rejected has a bag seal." />
          )}
        </Card>
      </div>
    </MasPageFrame>
  );
}

