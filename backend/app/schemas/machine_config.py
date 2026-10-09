from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.domain.shifts import MAX_SHIFTS, OUTSIDE, display_name, shift_hours

Target = Annotated[int, Field(ge=0, le=1_000_000)]
DayTarget = Annotated[int, Field(ge=0, le=100_000_000)]
Hour = Annotated[int, Field(ge=0, le=23)]


class Shift(BaseModel):
    name: str = Field(max_length=30)
    start: Hour   # first hour, e.g. 8 = 08:00
    end: Hour     # hour it ends, e.g. 17 = 17:00; earlier than start = ends next day


class ShiftInfo(Shift):
    label: str    # "08:00 - 17:00"
    hours: int


class ShiftsUpdate(BaseModel):
    shifts: list[Shift]

    @field_validator("shifts")
    @classmethod
    def valid_calendar(cls, shifts: list[Shift]):
        if not 1 <= len(shifts) <= MAX_SHIFTS:
            raise ValueError(f"Set between 1 and {MAX_SHIFTS} shifts.")
        shifts = [s.model_copy(update={"name": s.name.strip()}) for s in shifts]
        names = [s.name.lower() for s in shifts]
        if any(not n for n in names):
            raise ValueError("Shift name cannot be empty.")
        shown = [display_name(n) for n in names]   # "Day" and "Day shift" would both show as "Day shift"
        if any(n == "all" or d == OUTSIDE.lower() for n, d in zip(names, shown)):  # "Outside" would show as "Outside shift"
            raise ValueError(f'Shift name cannot be "All" or "{OUTSIDE}".')
        if len(set(shown)) != len(shown):
            raise ValueError("Shift names must be unique.")
        taken = {}
        for s in shifts:
            if s.start == s.end:
                raise ValueError(f"{s.name}: start and end cannot be the same hour.")
            for h in shift_hours(s.model_dump()):
                if h in taken:
                    raise ValueError(f"{s.name} overlaps {taken[h]} at {h:02d}:00.")
                taken[h] = s.name
        return sorted(shifts, key=lambda s: s.start)


class MachineTarget(BaseModel):
    name: str
    target: Target | None = None          # per hour; None = use the site default
    day_target: DayTarget | None = None   # per day; None = hourly target x shift hours per day


class MachineConfig(BaseModel):
    site: str
    sites: list[str]
    default_target: int
    shift_hours_per_day: int  # used for day targets that are not set
    shifts: list[ShiftInfo]
    machines: list[MachineTarget]
    updated_at: datetime | None


class MachineConfigUpdate(BaseModel):
    default_target: Target | None = None  # fallback for machines without a target; None = keep the saved one
    machines: list[MachineTarget]

    @field_validator("machines")
    @classmethod
    def unique_names(cls, machines: list[MachineTarget]):
        names = [m.name.strip() for m in machines]
        if any(not n for n in names):
            raise ValueError("Machine name cannot be empty.")
        if len(set(names)) != len(names):
            raise ValueError("Machine names must be unique.")
        return [m.model_copy(update={"name": n}) for n, m in zip(names, machines)]
