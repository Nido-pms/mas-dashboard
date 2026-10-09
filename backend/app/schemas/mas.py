from datetime import date, datetime

from pydantic import BaseModel


class ShiftOption(BaseModel):
    name: str
    label: str


class FilterOptions(BaseModel):
    site: str
    sites: list[str]
    machines: list[str]
    shifts: list[ShiftOption]
    min_date: date | None
    max_date: date | None


class BillingConfig(BaseModel):
    default_target: int                # per machine per hour, for machines without their own target
    machine_targets: dict[str, int]    # per-machine overrides
    calibration: int


class HourRow(BaseModel):
    date: date
    hour: str
    shift: str
    machines: int
    target: int
    induction: int
    calibration: int
    balance: int
    shortfall: int
    rejected: int
    rejected_client: int     # rejection code scoped to Client
    rejected_nido: int       # rejection code scoped to NIDO
    rejected_undefined: int  # rejection code not on the Rejection Code Definition page


class ShiftRow(BaseModel):
    date: date
    shift: str
    total_machines: int    # machines available at the site
    machines: int          # machines that ran
    hours: int
    target_per_hour: int   # sum of the targets of all machines (or the selected one), ran or not
    target: int
    induction: int
    rejected: int
    calibration: int
    balance: int
    shortfall: int
    rejected_client: int     # rejection code scoped to Client
    rejected_nido: int       # rejection code scoped to NIDO
    rejected_undefined: int  # rejection code not on the Rejection Code Definition page


class BillingTotals(BaseModel):
    target: int
    induction: int
    rejected: int
    calibration: int
    balance: int
    shortfall: int
    rejected_client: int     # rejection code scoped to Client
    rejected_nido: int       # rejection code scoped to NIDO
    rejected_undefined: int  # rejection code not on the Rejection Code Definition page
    achievement: float


class DayRow(BaseModel):
    date: date          # the day is named after the date it starts on
    start: datetime     # e.g. 2026-10-01T07:00
    end: datetime       # e.g. 2026-10-02T07:00
    total_machines: int # machines available at the site
    machines: int       # machines that ran
    target: int
    induction: int
    rejected: int
    shortfall: int
    rejected_client: int     # rejection code scoped to Client
    rejected_nido: int       # rejection code scoped to NIDO
    rejected_undefined: int  # rejection code not on the Rejection Code Definition page


class DayTotals(BaseModel):
    target: int
    induction: int
    rejected: int
    shortfall: int
    rejected_client: int     # rejection code scoped to Client
    rejected_nido: int       # rejection code scoped to NIDO
    rejected_undefined: int  # rejection code not on the Rejection Code Definition page
    achievement: float


class DayReport(BaseModel):
    day_start: int      # hour each day starts at
    totals: DayTotals
    days: list[DayRow]


class BillingReport(BaseModel):
    config: BillingConfig
    totals: BillingTotals
    hour: list[HourRow]
    shift: list[ShiftRow]
