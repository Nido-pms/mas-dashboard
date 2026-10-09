from datetime import date, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field


def _squash(s: str) -> str:
    s = " ".join(s.split())
    if not s:
        raise ValueError("cannot be empty")
    return s


def _address(s: str) -> str:
    s = "".join(s.split())
    if not s:
        raise ValueError("cannot be empty")
    return s


AlarmName = Annotated[str, Field(max_length=80), AfterValidator(_squash)]
Address = Annotated[str, Field(max_length=20), AfterValidator(_address)]  # PLC bit, e.g. "Alarm1.X0"


# ---------------------------------------------------------------- configuration

class AlarmDefIn(BaseModel):
    sn: int = Field(ge=1, le=9999)
    name: AlarmName        # matched to "Alarm Name" in the alarm reports, ignoring case and extra spaces
    address: Address       # unique per site
    machine_stops: bool


class StopsIn(BaseModel):
    machine_stops: bool


class AlarmDef(AlarmDefIn):
    id: str
    occurrences: int = 0   # times this alarm appears in the site's alarm reports
    created_at: datetime
    updated_at: datetime


class AlarmDefList(BaseModel):
    site: str              # each site has its own list
    sites: list[str]
    alarms: list[AlarmDef]


# ---------------------------------------------------------------- analysis

class MachineStop(BaseModel):
    """One machine stop: the machine-stop alarms of one machine whose times overlap, counted once."""
    date: date             # the day it started (days start at the report's day_start hour)
    machine: str
    alarm_code: str        # of the main alarm: the first one raised (lowest SN when raised at the same moment)
    alarm_id: str
    name: str
    raised: str            # first alarm raised
    cleared: str           # last alarm of the group cleared
    duration_s: int        # cleared - raised: the time the machine was stopped, no overlap counted twice
    grouped: list[str]     # the other alarms in the group, in the order first raised


class KeyFinding(BaseModel):
    key: str               # "stops", "stopped", "top_cause", "time_lost"
    title: str             # e.g. "Top cause"
    value: str             # the headline, e.g. "PARCEL PICKED FROM CV02"
    detail: str            # one short line, e.g. "255 stops · 26%"


class MachineTotal(BaseModel):
    machine: str
    stops: int
    stop_time_s: int       # time this machine was stopped by alarms


class DayMachineStop(BaseModel):
    date: date
    machine: str
    stops: int
    stop_time_s: int       # time this machine was stopped by alarms that day


class AlarmReport(BaseModel):
    day_start: int
    stop_alarms: int       # machine-stop alarms raised
    stop_time_s: int       # sum of the stops' durations: exact time the machines were stopped
    findings: list[KeyFinding]
    machines: list[MachineTotal]  # by machine name
    days: list[DayMachineStop]    # per day and machine, for the chart; every stop counted (not capped)
    stops: list[MachineStop]  # machine by machine, oldest first within each; at most STOP_LIMIT
    stops_total: int
