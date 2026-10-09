from datetime import date

import pytest
from pydantic import ValidationError

from app.domain.shifts import ShiftCalendar
from app.schemas.machine_config import MachineConfigUpdate, ShiftsUpdate
from app.services.machine_config import SiteTargets
from app.services.mas import billing_report, day_report, day_window

THREE_SHIFTS = [{"name": "A", "start": 6, "end": 14}, {"name": "B", "start": 14, "end": 22},
                {"name": "C", "start": 22, "end": 6}]


def count(d, h, m="M1", total=10, rejected=0, client=0, nido=0):
    return {"_id": {"d": d, "h": f"{h:02d}", "m": m}, "total": total, "rejected": rejected, "client": client, "nido": nido}


def report(counts, day=date(2026, 10, 6), shift="All", targets=None, default_target=850, calibration=0,
           fleet=("M1", "M2"), shifts=None):
    calendar = ShiftCalendar(shifts) if shifts else ShiftCalendar()
    return billing_report(counts, start=day, end=day, shift=shift, calendar=calendar, targets=targets or {}, default_target=default_target, calibration=calibration,
                          target_machines=fleet, total_machines=len(fleet))


def test_post_midnight_hour_belongs_to_previous_nights_shift():
    sd, s = ShiftCalendar().shift_of(date(2026, 10, 7), 2)
    assert sd == date(2026, 10, 6) and s["name"] == "Night"


def test_hour_outside_any_shift():
    assert ShiftCalendar().shift_of(date(2026, 10, 7), 18)[1] is None


def test_configured_three_shifts_drive_the_report():
    cal = ShiftCalendar(THREE_SHIFTS)
    assert cal.hours_per_day() == 24 and cal.last_overnight_hour() == 6
    r = report([count("2026-10-06", 7), count("2026-10-07", 3, total=5)], shifts=THREE_SHIFTS, default_target=100)
    assert [s.shift for s in r.shift] == ["A shift", "B shift", "C shift"]
    assert [s.target for s in r.shift] == [100 * 2 * 8] * 3
    assert r.shift[2].induction == 5                 # 03:00 next day belongs to C, dated the day it starts
    assert len(r.hour) == 24 and r.hour[-1].hour == "05:00 - 06:00"


def test_shift_config_validation():
    ok = ShiftsUpdate(shifts=[{"name": " Night ", "start": 21, "end": 5}, {"name": "Day", "start": 8, "end": 17}])
    assert [(s.name, s.start) for s in ok.shifts] == [("Day", 8), ("Night", 21)]   # trimmed, ordered by start
    for bad in ([],                                                                   # none
                [{"name": n, "start": i, "end": i + 1} for i, n in enumerate("ABCD")],  # more than 3
                [{"name": "A", "start": 8, "end": 17}, {"name": "B", "start": 16, "end": 20}],  # overlap
                [{"name": "A", "start": 8, "end": 8}],                                   # zero length
                [{"name": "Day", "start": 8, "end": 9}, {"name": "day shift", "start": 9, "end": 10}],  # same name
                [{"name": "All", "start": 8, "end": 9}],
                [{"name": "A", "start": 8, "end": 24}]):
        with pytest.raises(ValidationError):
            ShiftsUpdate(shifts=bad)


def test_billing_targets_and_empty_shifts():
    r = report([count("2026-10-06", 8, total=900, rejected=5, client=5),
                count("2026-10-06", 9, m="M2", total=800)], fleet=("M1", "M2", "M3"))
    day_shift, night_shift = r.shift
    # Target covers every machine at the site, including M3 which did not run.
    assert day_shift.machines == 2 and day_shift.target_per_hour == 850 * 3 and day_shift.target == 850 * 3 * 9
    assert day_shift.induction == 1700 and day_shift.rejected_client == 5
    assert night_shift.machines == 0 and night_shift.induction == 0
    assert night_shift.target == 850 * 3 * 8          # a shift with no scans still carries the full target
    assert day_shift.total_machines == night_shift.total_machines == 3
    assert len(r.hour) == 9 + 8                       # every hour of both shifts is listed
    assert r.hour[0].target == 850 * 3
    assert r.totals.induction == 1700


def test_per_machine_targets_override_the_default():
    r = report([count("2026-10-06", 8, m="M1")], shift="Day", targets={"M1": 1000}, default_target=500)
    assert r.shift[0].target_per_hour == 1000 + 500
    assert r.shift[0].target == 1500 * 9
    assert r.hour[0].target == 1500


def test_shift_filter_and_calibration():
    r = report([count("2026-10-06", 8), count("2026-10-06", 22)], shift="Night", default_target=100, calibration=3)
    assert [s.shift for s in r.shift] == ["Night shift"]
    assert r.hour[0].hour == "21:00 - 22:00" and r.hour[0].calibration == 3
    assert r.shift[0].balance == 10 - 3


def test_config_update_rejects_duplicate_and_negative():
    with pytest.raises(ValidationError):
        MachineConfigUpdate(default_target=850, machines=[{"name": "M1"}, {"name": " M1 "}])
    with pytest.raises(ValidationError):
        MachineConfigUpdate(default_target=850, machines=[{"name": "M1", "target": -1}])
    ok = MachineConfigUpdate(default_target=850, machines=[{"name": " M1 ", "target": 900}, {"name": "M2"}])
    assert [(m.name, m.target) for m in ok.machines] == [("M1", 900), ("M2", None)]
    assert MachineConfigUpdate(machines=[]).default_target is None  # machine-only update keeps the saved default


def test_day_runs_from_day_start_to_next_day():
    counts = [count("2026-10-01", 6, total=1),    # before 07:00 -> belongs to 30 Sep
              count("2026-10-01", 7, total=10),   # 1 Oct
              count("2026-10-01", 18, total=20),  # 1 Oct, outside shift hours but still counted
              count("2026-10-02", 6, total=30),   # 1 Oct (before 07:00 next morning)
              count("2026-10-02", 7, total=40)]   # 2 Oct
    r = day_report(counts, start=date(2026, 10, 1), end=date(2026, 10, 2), day_start=7, day_target=lambda m: 100,
                   target_machines=["M1"], total_machines=1)
    assert [(d.date.isoformat(), d.induction) for d in r.days] == [("2026-10-01", 60), ("2026-10-02", 40)]
    assert r.days[0].start.isoformat() == "2026-10-01T07:00:00" and r.days[0].end.isoformat() == "2026-10-02T07:00:00"
    assert r.totals.induction == 100


def test_day_target_sums_all_machines():
    t = SiteTargets(default_target=850, hourly={"M2": 1000}, daily={"M1": 12_000})
    assert t.day_target("M1") == 12_000
    assert t.day_target("M2") == 1000 * 17       # no day target: hourly x shift hours per day
    assert t.day_target("M3") == 850 * 17
    r = day_report([count("2026-10-01", 9, m="M1"), count("2026-10-01", 9, m="M2")],
                   start=date(2026, 10, 1), end=date(2026, 10, 2), day_start=7, day_target=t.day_target,
                   target_machines=["M1", "M2", "M3"], total_machines=3)
    full = 12_000 + 17_000 + 850 * 17            # M3 did not run but still counts
    assert r.days[0].target == full and r.days[0].machines == 2 and r.days[0].total_machines == 3
    assert r.days[1].target == full and r.days[1].induction == 0   # day with no scans still carries the target


def test_rejections_split_by_code_scope():
    counts = [count("2026-10-06", 8, total=100, rejected=10, client=6, nido=3),  # 1 rejection has an undefined code
              count("2026-10-06", 9, total=50, rejected=4, client=4)]
    s = report(counts, shift="Day").shift[0]
    assert (s.rejected, s.rejected_client, s.rejected_nido, s.rejected_undefined) == (14, 10, 3, 1)
    h = report(counts, shift="Day").hour[0]           # 08:00 - 09:00
    assert (h.rejected, h.rejected_client, h.rejected_nido, h.rejected_undefined) == (10, 6, 3, 1)
    d = day_report(counts, start=date(2026, 10, 6), end=date(2026, 10, 6), day_start=7, day_target=lambda m: 0,
                   target_machines=["M1"], total_machines=1)
    assert (d.totals.rejected_client, d.totals.rejected_nido, d.totals.rejected_undefined) == (10, 3, 1)


def test_day_window_bounds():
    assert day_window(date(2026, 10, 1), date(2026, 10, 2), 7) == ("2026-10-01T07", "2026-10-03T07")
