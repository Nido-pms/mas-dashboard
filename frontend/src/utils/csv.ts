import type { Column } from '../components/ReportTable';

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv<R>(filename: string, columns: Column<R>[], rows: R[]) {
  const lines = [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(','))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }); // BOM so Excel reads UTF-8
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);  // some browsers start the download after click() returns
}
