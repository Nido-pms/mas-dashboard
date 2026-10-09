import type { ReactNode } from 'react';
import { fmt } from '../utils/format';

export interface Column<R> {
  label: string;                      // CSV header, and table header unless `header` is set
  header?: ReactNode;
  value: (row: R) => string | number; // raw value, also used for CSV export
  numeric?: boolean;                  // right-aligned, thousands separators
  variance?: boolean;                 // red when positive (short), green otherwise
  total?: boolean;                    // summed in the footer
  title?: (row: R) => string;
}

interface Props<R> {
  columns: Column<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  rowClassName?: (row: R, index: number, rows: R[]) => string | undefined;
  emptyText?: string;
}

function Cell<R>({ column, value, title }: { column: Column<R>; value: string | number; title?: string }) {
  const cls = [
    column.variance && `font-weight-bold ${Number(value) > 0 ? 'text-danger' : 'text-success'}`,
  ].filter(Boolean).join(' ');
  return <td className={cls || undefined} title={title}>{column.numeric ? fmt(Number(value)) : value}</td>;
}

/** Scrollable report table with sticky header and a totals footer. */
export default function ReportTable<R>({ columns, rows, rowKey, rowClassName, emptyText = 'No data.' }: Props<R>) {
  const totals = columns.map((c) => (c.total ? rows.reduce((sum, r) => sum + Number(c.value(r)), 0) : null));
  return (
    <div className="report-wrap">
      <table className="table table-sm table-striped table-hover report mb-0">
        <thead>
          <tr>{columns.map((c) => <th key={c.label}>{c.header ?? c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((r, i) => (
            <tr key={rowKey(r)} className={rowClassName?.(r, i, rows)}>
              {columns.map((c) => <Cell key={c.label} column={c} value={c.value(r)} title={c.title?.(r)} />)}
            </tr>
          )) : (
            <tr><td colSpan={columns.length} className="text-center text-muted">{emptyText}</td></tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              {columns.map((c, i) => {
                const t = totals[i];
                if (i === 0) return <td key={c.label}>Total</td>;
                return t === null ? <td key={c.label} /> : <Cell key={c.label} column={c} value={t} />;
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
