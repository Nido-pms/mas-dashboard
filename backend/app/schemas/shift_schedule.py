from datetime import date

from pydantic import BaseModel, Field


class WeeklyOff(BaseModel):
    weekday: int = Field(ge=0, le=6)   # 0 = Monday
    shift: str
    machine: str                        # a machine name, or "*" for all machines


class WeeklyUpdate(BaseModel):
    weekly_off: list[WeeklyOff]


class DateOverride(BaseModel):
    date: date
    shift: str
    machine: str                        # a machine name, or "*" for all machines
    active: bool


class DateOverrideIn(BaseModel):
    date: date
    shift: str
    machine: str
    active: bool | None                 # None removes the change, so the weekly pattern applies again


class ScheduleConfig(BaseModel):
    site: str
    sites: list[str]
    shifts: list[str]
    machines: list[str]
    weekly_off: list[WeeklyOff]
    overrides: list[DateOverride]       # by date


class InactiveScan(BaseModel):
    """Parcels scanned in a shift that was switched off for the machine."""
    date: date                          # shift date (an overnight shift is dated by the day it starts)
    shift: str
    machine: str
    induction: int
    rejected: int
    first_hour: str                     # e.g. "21:00 - 22:00"
    last_hour: str
    reason: str                         # "weekly pattern" or "date change"


class InactiveScans(BaseModel):
    rows: list[InactiveScan]


class HeatDay(BaseModel):
    """One shift date of the activity heatmap."""
    date: date
    active: int                         # shift x machine slots that run that day
    slots: int                          # all shift x machine slots
    induction: int                      # parcels scanned in the day's shifts
    off_induction: int                  # of which in switched-off shifts


class Heatmap(BaseModel):
    machines: list[str]                 # machines counted (all at the site, or the selected one)
    days: list[HeatDay]
    by_shift: dict[str, int]            # parcels per shift over the whole range, whatever shift is selected
