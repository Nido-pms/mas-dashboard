from datetime import date

from app.domain.schedule import ALL, ShiftSchedule
from app.domain.shifts import ShiftCalendar
from app.services.mas import billing_report, day_report
from app.services.shift_schedule import heatmap, inactive_scans

MON, SUN = date(2026, 10, 5), date(2026, 10, 4)          # 5 Oct 2026 is a Monday
CAL = ShiftCalendar()                                     # Day 08-17 (9 h), Night 21-05 (8 h)


def count(d, h, m="M1", total=10, rejected=0):
    return {"_id": {"d": d, "h": f"{h:02d}", "m": m}, "total": total, "rejected": rejected, "client": 0, "nido": 0}


def test_precedence_date_machine_then_date_all_then_weekly():
    s = ShiftSchedule(weekly_off={(6, "Night", ALL), (0, "Day", "M2")},
                      overrides={(date(2026, 10, 11), "Night", ALL): True, (date(2026, 10, 11), "Night", "M2"): False})
    assert not s.is_active(SUN, "Night", "M1")                       # weekly: Sunday night off for all
    assert s.is_active(date(2026, 10, 11), "Night", "M1")            # next Sunday switched on by date
    assert not s.is_active(date(2026, 10, 11), "Night", "M2")        # ... except M2 on that date
    assert not s.is_active(MON, "Day", "M2") and s.is_active(MON, "Day", "M1")
    assert s.is_active(MON, "Night", "M2")                           # default: active


def billing(counts, schedule, day=MON):
    return billing_report(counts, start=day, end=day, shift="All", calendar=CAL, targets={}, default_target=100,
                          calibration=0, target_machines=["M1", "M2"], total_machines=2, schedule=schedule)


def test_target_counts_only_active_machines_and_off_shifts_without_parcels_are_hidden():
    r = billing([count("2026-10-05", 9)], ShiftSchedule(weekly_off={(0, "Day", "M2"), (0, "Night", ALL)}))
    assert [(s.shift, s.target_per_hour, s.target) for s in r.shift] == [("Day shift", 100, 900)]   # M2 off; night hidden
    assert len(r.hour) == 9


def test_off_shift_with_parcels_stays_visible_with_zero_target():
    r = billing([count("2026-10-05", 22, total=40)], ShiftSchedule(weekly_off={(0, "Night", ALL)}))
    night = next(s for s in r.shift if s.shift == "Night shift")
    assert (night.target, night.induction) == (0, 40)
    assert [h.hour for h in r.hour if h.shift == "Night shift"] == ["22:00 - 23:00"]   # only hours with parcels
    assert r.totals.induction == 40


def test_day_target_scales_with_active_shift_hours_and_empty_off_days_are_hidden():
    sched = ShiftSchedule(weekly_off={(0, "Night", ALL), (6, "Day", ALL), (6, "Night", ALL)})
    r = day_report([count("2026-10-05", 9)], start=SUN, end=MON, day_start=7, hour_target=lambda m: 100,
                   target_machines=["M1", "M2"], total_machines=2, schedule=sched, calendar=CAL)
    assert [(d.date, d.target) for d in r.days] == [(MON, 2 * 100 * 9)]   # Monday: Day shift only; Sunday all off, no scans


def test_inactive_scans_lists_off_shifts_that_scanned():
    sched = ShiftSchedule(weekly_off={(0, "Night", "M2")}, overrides={(MON, "Day", ALL): False})
    rows = inactive_scans([count("2026-10-05", 9, "M1", 5, 1), count("2026-10-05", 10, "M1", 7),
                           count("2026-10-05", 22, "M2", 3), count("2026-10-05", 22, "M1", 9)],   # M1 night is active
                          calendar=CAL, schedule=sched, start=None, end=None).rows
    assert [(r.shift, r.machine, r.induction, r.rejected, r.first_hour, r.last_hour, r.reason) for r in rows] == [
        ("Day", "M1", 12, 1, "09:00 - 10:00", "10:00 - 11:00", "date change"),
        ("Night", "M2", 3, 0, "22:00 - 23:00", "22:00 - 23:00", "weekly pattern")]


def test_heatmap_counts_active_slots_and_parcels_per_shift_date():
    s = ShiftSchedule(weekly_off={(6, "Night", ALL)})                # Sunday night off
    counts = [count("2026-10-04", 9, total=5), count("2026-10-05", 2, total=7, m="M2"),   # Mon 02:00 is Sunday night
              count("2026-10-05", 9, total=3, m="Other")]                                # not a counted machine
    h = heatmap(counts, calendar=CAL, schedule=s, machines=["M1", "M2"], start=SUN, end=MON)
    sun, mon = h.days
    assert (sun.active, sun.slots, sun.induction, sun.off_induction) == (2, 4, 12, 7)
    assert (mon.active, mon.slots, mon.induction, mon.off_induction) == (4, 4, 0, 0)


def test_heatmap_for_one_shift():
    counts = [count("2026-10-05", 9, total=5), count("2026-10-05", 22, total=7)]
    day = heatmap(counts, calendar=CAL, schedule=ShiftSchedule(), machines=["M1"], start=MON, end=MON, shift="Day").days[0]
    night = heatmap(counts, calendar=CAL, schedule=ShiftSchedule(), machines=["M1"], start=MON, end=MON, shift="Night").days[0]
    assert (day.induction, day.slots, night.induction, night.slots) == (5, 1, 7, 1)
    h = heatmap(counts, calendar=CAL, schedule=ShiftSchedule(), machines=["M1"], start=MON, end=MON, shift="Day")
    assert h.by_shift == {"Day": 5, "Night": 7}
