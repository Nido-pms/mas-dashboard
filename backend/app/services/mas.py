"""MAS report: filter options, hour-/shift-wise billing and day-wise induction against target."""
from collections import defaultdict
from collections.abc import Callable, Iterable
from datetime import date, datetime, time, timedelta

from pymongo.collection import Collection

from app.core.config import SITES
from app.core.utils import clean
from app.domain.shifts import (OUTSIDE, ShiftCalendar, display_name, hour_label, shift_hours, shift_label,
                               sort_hour)
from app.repositories import scans
from app.schemas.mas import (BillingConfig, BillingReport, BillingTotals, DayReport, DayRow, DayTotals, FilterOptions,
                             HourRow, ShiftOption, ShiftRow)

COUNTS = ("total", "rejected", "client", "nido")
REJECT_SPLIT = ("rejected_client", "rejected_nido", "rejected_undefined")


def reject_split(n: dict) -> dict:
    """Rejections by the scope of their code; codes not defined on the Rejection Code Definition page are "undefined"."""
    return {"rejected_client": n["client"], "rejected_nido": n["nido"],
            "rejected_undefined": n["rejected"] - n["client"] - n["nido"]}


def filter_options(site: str, coll: Collection, calendar: ShiftCalendar) -> FilterOptions:
    dates = []
    for v in scans.timestamp_bounds(coll) or ():
        try:
            dates.append(calendar.shift_of(date.fromisoformat(v[:10]), int(v[11:13]))[0])
        except ValueError:
            pass
    return FilterOptions(
        site=site,
        sites=list(SITES),
        machines=sorted({s for s in map(clean, scans.machine_names(coll)) if s}),
        shifts=[ShiftOption(name=s["name"], label=shift_label(s)) for s in calendar.shifts],
        min_date=dates[0] if dates else None,
        max_date=dates[-1] if dates else None,
    )


def billing_report(counts: Iterable[dict], *, start: date | None, end: date | None, shift: str, calendar: ShiftCalendar,
                   targets: dict[str, int], default_target: int, calibration: int,
                   target_machines: Iterable[str], total_machines: int) -> BillingReport:
    """Build hour-wise and shift-wise billing tables from hourly scan counts.

    Machine target   = its own target per hour, or `default_target` when it has none
    Target per hour  = sum of the targets of `target_machines`, whether they ran or not
    Target per shift = target per hour x shift hours
    Every shift of every date in the range is listed; shifts without scans show zeros.
    Calibration parcels are deducted once per shift (in its first hour on the hourly table).
    """
    by_name = calendar.by_name
    zero = lambda: dict.fromkeys(COUNTS, 0)
    hours = defaultdict(zero)        # (shift date, shift name, hour) -> counts
    machines = defaultdict(set)      # (shift date, shift name) -> machine names
    seen = set()                     # shift dates that have scans
    for r in counts:
        try:
            day, h = date.fromisoformat(r["_id"]["d"]), int(r["_id"]["h"])
        except (TypeError, ValueError):
            continue
        sd, s = calendar.shift_of(day, h)
        name = s["name"] if s else OUTSIDE
        if (start and sd < start) or (end and sd > end):
            continue
        seen.add(sd)
        if shift not in ("All", name):
            continue
        for k in COUNTS:
            hours[(sd, name, h)][k] += r[k]
        machines[(sd, name)].add(clean(r["_id"]["m"]) or "Unknown")

    # List every shift hour of every date in range; hours and shifts without scans stay at zero.
    lo, hi = start or min(seen, default=None), end or max(seen, default=None)
    if lo and hi:
        for i in range((hi - lo).days + 1):
            sd = lo + timedelta(days=i)
            for s in calendar.shifts:
                if shift in ("All", s["name"]):
                    machines[(sd, s["name"])]
                    for h in shift_hours(s):
                        hours[(sd, s["name"], h)]

    fleet_target = sum(targets.get(m, default_target) for m in target_machines)
    hourly_target = lambda name: fleet_target if name in by_name else 0   # nothing is targeted outside shifts

    hour_rows = []
    per_shift = defaultdict(zero)
    for (sd, name, h), n in sorted(hours.items(), key=lambda kv: (kv[0][0], sort_hour(by_name.get(kv[0][1]), kv[0][2]))):
        s = by_name.get(name)
        m = len(machines[(sd, name)])
        tgt = hourly_target(name)
        cal = calibration if s and h == s["start"] else 0
        bal = n["total"] - cal
        hour_rows.append(HourRow(date=sd, hour=hour_label(h), shift=display_name(name) if s else OUTSIDE, machines=m,
                                 target=tgt, induction=n["total"], calibration=cal, balance=bal, shortfall=tgt - bal,
                                 rejected=n["rejected"], **reject_split(n)))
        for k in COUNTS:
            per_shift[(sd, name)][k] += n[k]

    shift_rows = []
    for (sd, name), ms in sorted(machines.items(), key=lambda kv: (kv[0][0], calendar.order.index(kv[0][1]))):
        s = by_name.get(name)
        n = per_shift[(sd, name)]
        n_hours = len(shift_hours(s)) if s else 0
        per_hour = hourly_target(name)
        tgt = per_hour * n_hours
        cal = calibration if s else 0
        bal = n["total"] - cal
        shift_rows.append(ShiftRow(date=sd, shift=display_name(name) if s else OUTSIDE,
                                   total_machines=total_machines, machines=len(ms), hours=n_hours,
                                   target_per_hour=per_hour, target=tgt, induction=n["total"], rejected=n["rejected"], calibration=cal,
                                   balance=bal, shortfall=tgt - bal, **reject_split(n)))

    tot = {k: sum(getattr(r, k) for r in shift_rows) for k in
           ("target", "induction", "rejected", "calibration", "balance", "shortfall", *REJECT_SPLIT)}
    tot["achievement"] = round(tot["balance"] * 100 / tot["target"], 2) if tot["target"] else 0
    return BillingReport(config=BillingConfig(default_target=default_target, machine_targets=targets,
                                              calibration=calibration),
                         totals=BillingTotals(**tot), hour=hour_rows, shift=shift_rows)


def day_window(start: date | None, end: date | None, day_start: int) -> tuple[str | None, str | None]:
    """Timestamp bounds [from, to) covering the days that start on start..end at `day_start` o'clock."""
    return (f"{start.isoformat()}T{day_start:02d}" if start else None,
            f"{(end + timedelta(days=1)).isoformat()}T{day_start:02d}" if end else None)


def day_report(counts: Iterable[dict], *, start: date | None, end: date | None, day_start: int,
               day_target: Callable[[str], int], target_machines: Iterable[str], total_machines: int) -> DayReport:
    """Day-wise induction against target.

    A day runs from `day_start` o'clock to the same time next day and is named after the date it starts on.
    Every scan in that window counts, including those outside shift hours.
    Day target = sum of the day targets of `target_machines`, whether they ran or not.
    Every date in the range is listed; days without scans show zeros.
    """
    n = defaultdict(lambda: dict.fromkeys(COUNTS, 0))   # day -> counts
    machines = defaultdict(set)                          # day -> machine names
    for r in counts:
        try:
            cal_day, h = date.fromisoformat(r["_id"]["d"]), int(r["_id"]["h"])
        except (TypeError, ValueError):
            continue
        day = cal_day if h >= day_start else cal_day - timedelta(days=1)
        if (start and day < start) or (end and day > end):
            continue
        for k in COUNTS:
            n[day][k] += r[k]
        machines[day].add(clean(r["_id"]["m"]) or "Unknown")

    lo, hi = start or min(n, default=None), end or max(n, default=None)
    days = [lo + timedelta(days=i) for i in range((hi - lo).days + 1)] if lo and hi else []

    tgt = sum(day_target(m) for m in target_machines)
    rows = []
    for day in days:
        c = n[day]
        begin = datetime.combine(day, time(day_start))
        rows.append(DayRow(date=day, start=begin, end=begin + timedelta(days=1),
                           total_machines=total_machines, machines=len(machines[day]),
                           target=tgt, induction=c["total"], rejected=c["rejected"], shortfall=tgt - c["total"],
                           **reject_split(c)))

    tot = {k: sum(getattr(r, k) for r in rows) for k in ("target", "induction", "rejected", "shortfall", *REJECT_SPLIT)}
    tot["achievement"] = round(tot["induction"] * 100 / tot["target"], 2) if tot["target"] else 0
    return DayReport(day_start=day_start, totals=DayTotals(**tot), days=rows)
