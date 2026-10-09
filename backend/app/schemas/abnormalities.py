from datetime import date

from pydantic import BaseModel


class DuplicateDay(BaseModel):
    date: date
    barcodes: int  # barcodes scanned more than once that day
    scans: int     # scans of those barcodes


class DuplicateParcel(BaseModel):
    date: date
    barcode: str
    scans: int
    confirmed: int
    rejected: int
    codes: list[str]     # rejection codes seen, e.g. ["DUPR", "CFGR"]
    machines: list[str]
    first: str           # first and last scan timestamp that day
    last: str


class DbarDay(BaseModel):
    date: date
    series: int    # DBAR series that started that day
    dbar: int      # DBAR rejections in those series
    longest: int


class DbarSeries(BaseModel):
    date: date
    hour: str      # hour the series started, e.g. "03:00 - 04:00"
    machine: str
    length: int    # DBAR rejections in a row on this machine
    first: str     # first and last scan timestamp of the series
    last: str


class MissingBagSeal(BaseModel):
    date: date
    timestamp: str
    barcode: str
    machine: str
    status: str
    chute: str


class AbnormalityReport(BaseModel):
    day_start: int
    min_series: int
    min_scans: int         # a barcode is a duplicate when scanned this many times or more in a day
    duplicate_days: list[DuplicateDay]
    duplicates: list[DuplicateParcel]
    dbar_days: list[DbarDay]
    dbar_series: list[DbarSeries]
    missing_bagseal: list[MissingBagSeal]  # newest first, at most MISSING_BAGSEAL_LIMIT
    missing_bagseal_total: int
