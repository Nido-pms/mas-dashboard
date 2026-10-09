"""Alarm analysis: how long alarms stopped the machine.

Only alarms set to stop the machine on the Alarm Configuration page are used. Per machine, alarms whose times
overlap are one machine stop: it starts when the first of them is raised and ends when the last of them clears,
so overlapping time is counted once and the stops add up to the exact time the machine was stopped. The first
alarm raised is the main alarm of the stop (lowest SN when several are raised at the same moment).
"""
import math
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.core.utils import clean
from app.repositories.alarms import CLEARED, RAISED
from app.schemas.alarms import AlarmReport, DayMachineStop, KeyFinding, MachineStop, MachineTotal
from app.services.alarm_config import name_key

STOP_LIMIT = 5000


def _day(ts: str, day_start: int) -> date:
    """Days run from `day_start` o'clock to the same time next day, named after the date they start on."""
    d = date.fromisoformat(ts[:10])
    return d if int(ts[11:13]) >= day_start else d - timedelta(days=1)


def _cleared(a: dict, raised: datetime) -> datetime:
    """When the alarm cleared: the report's diffused time (exact to the millisecond), else raised + its duration."""
    try:
        cleared = datetime.fromisoformat(a[CLEARED])
        if cleared >= raised:
            return cleared
    except (KeyError, TypeError, ValueError):
        pass
    v = a.get("Duration (in Sec)")
    ok = isinstance(v, (int, float)) and not (isinstance(v, float) and math.isnan(v)) and v >= 0
    return raised + timedelta(seconds=v if ok else 0)


def readable(secs: int) -> str:
    """45 -> "45s", 754 -> "12m 34s", 7810 -> "2h 10m"."""
    if secs < 60:
        return f"{secs}s"
    if secs < 3600:
        return f"{secs // 60}m {secs % 60:02d}s"
    return f"{secs // 3600:,}h {secs % 3600 // 60:02d}m"


@dataclass
class _Alarm:
    raised: datetime
    cleared: datetime
    ts: str
    sn: int
    name: str
    alarm_code: str
    alarm_id: str


def group_stops(alarms: list[_Alarm]) -> list[list[_Alarm]]:
    """Group one machine's alarms whose [raised, cleared] times overlap (or touch); the first of each group is its
    main alarm."""
    groups: list[list[_Alarm]] = []
    end: datetime | None = None
    for a in sorted(alarms, key=lambda a: (a.raised, a.sn)):
        if end is not None and a.raised <= end:
            groups[-1].append(a)
            end = max(end, a.cleared)
        else:
            groups.append([a])
            end = a.cleared
    return groups


def key_findings(stops: list[MachineStop], stop_alarms: int) -> list[KeyFinding]:
    """The major findings as short cards; a card is left out when there is no data for it."""
    if not stops:
        return [KeyFinding(key="stops", title="Machine stops", value="0", detail="no machine-stop alarms for these filters")]
    total = sum(s.duration_s for s in stops)
    out = [KeyFinding(key="stops", title="Machine stops", value=f"{len(stops):,}",
                      detail=f"from {stop_alarms:,} stop alarms · overlaps grouped")]

    per_day = defaultdict(int)
    for s in stops:
        per_day[s.date] += s.duration_s
    worst, worst_s = max(per_day.items(), key=lambda kv: kv[1])
    out.append(KeyFinding(key="stopped", title="Machine stopped", value=readable(total),
                          detail=f"worst day {worst:%d-%m} · {readable(worst_s)}"))

    by_alarm = defaultdict(lambda: [0, 0])   # main alarm -> [stops, seconds]
    for s in stops:
        by_alarm[s.name][0] += 1
        by_alarm[s.name][1] += s.duration_s
    top, (n, _) = max(by_alarm.items(), key=lambda kv: (kv[1][0], kv[1][1]))
    out.append(KeyFinding(key="top_cause", title="Top cause", value=top, detail=f"{n:,} stops · {n * 100 // len(stops)}%"))
    lost, (n, secs) = max(by_alarm.items(), key=lambda kv: (kv[1][1], kv[1][0]))
    out.append(KeyFinding(key="time_lost", title="Most time lost", value=lost,
                          detail=f"{readable(secs)} · {secs * 100 // max(total, 1)}% of stop time"))
    return out


def analyze(alarms: Iterable[dict], definitions: list[dict], *, start: date | None, end: date | None,
            day_start: int) -> AlarmReport:
    """Machine stops from alarms sorted oldest first (see the module docstring)."""
    stop_conf = {name_key(d["name"]): d for d in definitions if d["machine_stops"]}
    per_machine: dict[str, list[_Alarm]] = defaultdict(list)
    for a in alarms:
        ts = a.get(RAISED)
        try:
            day, raised = _day(ts, day_start), datetime.fromisoformat(ts)
        except (TypeError, ValueError):
            continue
        if (start and day < start) or (end and day > end):
            continue
        conf = stop_conf.get(name_key(clean(a.get("Alarm Name")) or ""))
        if not conf:
            continue
        machine = clean(a.get("Machine")) or clean(a.get("Machine Name")) or "-"
        per_machine[machine].append(_Alarm(
            raised=raised, cleared=_cleared(a, raised), ts=ts, sn=conf.get("sn", 0),
            name=conf["name"], alarm_code=clean(a.get("Alarm Code")) or "", alarm_id=clean(a.get("Alarm Id")) or ""))

    stops: list[MachineStop] = []
    for machine, machine_alarms in per_machine.items():
        for group in group_stops(machine_alarms):
            main = group[0]
            cleared = max(a.cleared for a in group)
            stops.append(MachineStop(
                date=_day(main.ts, day_start), machine=machine, alarm_code=main.alarm_code, alarm_id=main.alarm_id,
                name=main.name, raised=main.ts, cleared=cleared.isoformat(timespec="milliseconds"),
                duration_s=round((cleared - main.raised).total_seconds()),
                grouped=[n for n in dict.fromkeys(a.name for a in group) if n != main.name]))
    stops.sort(key=lambda s: (s.machine, s.raised))   # machine by machine, then in time order

    totals = defaultdict(lambda: [0, 0])
    per_day = defaultdict(lambda: [0, 0])     # (date, machine) -> [stops, seconds]
    for s in stops:
        totals[s.machine][0] += 1
        totals[s.machine][1] += s.duration_s
        per_day[(s.date, s.machine)][0] += 1
        per_day[(s.date, s.machine)][1] += s.duration_s
    stop_alarms = sum(len(v) for v in per_machine.values())
    return AlarmReport(day_start=day_start, stop_alarms=stop_alarms, stop_time_s=sum(s.duration_s for s in stops),
                       findings=key_findings(stops, stop_alarms),
                       machines=[MachineTotal(machine=m, stops=n, stop_time_s=t) for m, (n, t) in sorted(totals.items())],
                       days=[DayMachineStop(date=d, machine=m, stops=n, stop_time_s=t)
                             for (d, m), (n, t) in sorted(per_day.items())],
                       stops=stops[:STOP_LIMIT], stops_total=len(stops))
