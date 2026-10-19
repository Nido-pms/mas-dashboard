"""Shift activation: load and change a site's schedule, and find parcels scanned in shifts that were switched off."""
from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta

from pymongo.collection import Collection

from app.core.config import SITES
from app.core.utils import clean
from app.domain.schedule import ALL, ShiftSchedule
from app.domain.shifts import ShiftCalendar, hour_label, sort_hour
from app.repositories import shift_schedule as repo
from app.schemas.shift_schedule import (DateOverride, DateOverrideIn, HeatDay, Heatmap, InactiveScan, InactiveScans,
                                        ScheduleConfig, WeeklyOff, WeeklyUpdate)
from app.services import machine_config


class ScheduleError(ValueError):
    """The change cannot be saved; the message is shown to the user."""


def load(site: str) -> ShiftSchedule:
    """The site's schedule as used by the reports."""
    return ShiftSchedule(
        weekly_off={(r["weekday"], r["shift"], r["machine"]) for r in repo.weekly_off(site)},
        overrides={(date.fromisoformat(o["date"]), o["shift"], o["machine"]): o["active"] for o in repo.overrides(site)},
    )


def _names(site: str, coll: Collection) -> tuple[list[str], list[str]]:
    t = machine_config.targets(site)
    return [s["name"] for s in t.calendar.shifts], machine_config.site_machines(coll, t)


def get_config(site: str, coll: Collection) -> ScheduleConfig:
    shifts, machines = _names(site, coll)
    return ScheduleConfig(site=site, sites=list(SITES), shifts=shifts, machines=machines,
                          weekly_off=[WeeklyOff(**r) for r in repo.weekly_off(site)],
                          overrides=[DateOverride(**o) for o in repo.overrides(site)])


def _check(site: str, coll: Collection, shift: str, machine: str) -> None:
    shifts, machines = _names(site, coll)
    if shift not in shifts:
        raise ScheduleError(f"Unknown shift: {shift}. Shifts are set on the Machine Configuration page.")
    if machine != ALL and machine not in machines:
        raise ScheduleError(f"Unknown machine: {machine}.")


def save_weekly(site: str, coll: Collection, update: WeeklyUpdate) -> None:
    for r in update.weekly_off:
        _check(site, coll, r.shift, r.machine)
    rules = sorted({(r.weekday, r.shift, r.machine) for r in update.weekly_off})
    repo.save_weekly(site, [{"weekday": w, "shift": s, "machine": m} for w, s, m in rules])


def set_override(site: str, coll: Collection, change: DateOverrideIn) -> None:
    _check(site, coll, change.shift, change.machine)
    day = change.date.isoformat()
    if change.active is None:
        repo.remove_override(site, day, change.shift, change.machine)
    else:
        repo.set_override(site, day, change.shift, change.machine, change.active)


def inactive_scans(counts: Iterable[dict], *, calendar: ShiftCalendar, schedule: ShiftSchedule,
                   start: date | None, end: date | None) -> InactiveScans:
    """Shifts switched off for a machine that still scanned parcels, from hourly counts per machine."""
    acc = defaultdict(lambda: {"induction": 0, "rejected": 0, "hours": set()})
    for r in counts:
        try:
            day, h = date.fromisoformat(r["_id"]["d"]), int(r["_id"]["h"])
        except (TypeError, ValueError):
            continue
        sd, s = calendar.shift_of(day, h)
        if s is None or (start and sd < start) or (end and sd > end) or not r["total"]:
            continue
        machine = clean(r["_id"]["m"]) or "Unknown"
        if schedule.is_active(sd, s["name"], machine):
            continue
        a = acc[(sd, s["name"], machine)]
        a["induction"] += r["total"]
        a["rejected"] += r["rejected"]
        a["hours"].add(h)

    rows = []
    for (sd, name, machine), a in sorted(acc.items()):
        s = calendar.by_name[name]
        hours = sorted(a["hours"], key=lambda h: sort_hour(s, h))
        by_date = (sd, name, machine) in schedule.overrides or (sd, name, ALL) in schedule.overrides
        rows.append(InactiveScan(date=sd, shift=name, machine=machine, induction=a["induction"], rejected=a["rejected"],
                                 first_hour=hour_label(hours[0]), last_hour=hour_label(hours[-1]),
                                 reason="date change" if by_date else "weekly pattern"))
    return InactiveScans(rows=rows)


def heatmap(counts: Iterable[dict], *, calendar: ShiftCalendar, schedule: ShiftSchedule, machines: list[str],
            start: date, end: date, shift: str = "All") -> Heatmap:
    """Per shift date start..end: how many shift x machine slots run, and the parcels scanned (in switched-off shifts too).

    `shift` limits both to one shift ("All" = every shift).
    """
    shifts = [s for s in calendar.shifts if shift == "All" or s["name"] == shift]
    parcels = defaultdict(lambda: [0, 0])   # shift date -> [all, in switched-off shifts]
    by_shift = {s["name"]: 0 for s in calendar.shifts}
    wanted = set(machines)
    for r in counts:
        try:
            day, h = date.fromisoformat(r["_id"]["d"]), int(r["_id"]["h"])
        except (TypeError, ValueError):
            continue
        sd, s = calendar.shift_of(day, h)
        machine = clean(r["_id"]["m"]) or "Unknown"
        if s is None or sd < start or sd > end or machine not in wanted:
            continue
        by_shift[s["name"]] += r["total"]
        if shift != "All" and s["name"] != shift:
            continue
        p = parcels[sd]
        p[0] += r["total"]
        if not schedule.is_active(sd, s["name"], machine):
            p[1] += r["total"]

    days, sd = [], start
    while sd <= end:
        active = sum(schedule.is_active(sd, s["name"], m) for s in shifts for m in machines)
        days.append(HeatDay(date=sd, active=active, slots=len(shifts) * len(machines),
                            induction=parcels[sd][0], off_induction=parcels[sd][1]))
        sd += timedelta(days=1)
    return Heatmap(machines=machines, days=days, by_shift=by_shift)
