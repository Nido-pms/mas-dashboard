// Mirrors backend/app/schemas/abnormalities.py
import type { DayQuery } from '../mas/types';

export interface AbnormalityQuery extends DayQuery {
  minSeries: number;  // DBAR rejections in a row that make a series
  minScans: number;   // scans in a day that make a barcode a duplicate (this many or more)
}

export interface DuplicateDay {
  date: string;
  barcodes: number;  // barcodes scanned more than once that day
  scans: number;     // scans of those barcodes
}

export interface DuplicateParcel {
  date: string;
  barcode: string;
  scans: number;
  confirmed: number;
  rejected: number;
  codes: string[];
  machines: string[];
  first: string;  // "2026-10-08T03:15:17.708"
  last: string;
}

export interface DbarDay {
  date: string;
  series: number;
  dbar: number;
  longest: number;
}

export interface DbarSeries {
  date: string;
  hour: string;  // hour the series started, e.g. "03:00 - 04:00"
  machine: string;
  length: number;
  first: string;
  last: string;
}

export interface MissingBagSeal {
  date: string;
  timestamp: string;
  barcode: string;
  machine: string;
  status: string;
  chute: string;
}

export interface AbnormalityReport {
  day_start: number;
  min_series: number;
  min_scans: number;   // a barcode is a duplicate when scanned this many times or more in a day
  duplicate_days: DuplicateDay[];
  duplicates: DuplicateParcel[];
  dbar_days: DbarDay[];
  dbar_series: DbarSeries[];
  missing_bagseal: MissingBagSeal[];  // newest first, capped
  missing_bagseal_total: number;
}
