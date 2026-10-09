from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.alarms import AlarmDefIn
from app.services.alarm_analysis import analyze
from app.services.alarm_config import DEFAULTS, name_key

OP1, K1, OP2 = "OP1 EMERGENCY ACTIVATED", "K1 CONTACTOR OFF", "OP2 LHS FENCING EMERGENCY ACTIVATED"
HOMING = "HORIZONTAL DRIVE HOMING REQUIRED"
CONFIG = [{"sn": 1, "name": OP1, "address": "Alarm1.X0", "machine_stops": True},
          {"sn": 2, "name": K1, "address": "Alarm1.X1", "machine_stops": True},
          {"sn": 3, "name": OP2, "address": "Alarm1.X2", "machine_stops": True},
          {"sn": 19, "name": HOMING, "address": "Alarm3.X1", "machine_stops": False}]


def alarm(raised, cleared, name, m="M1", day="2026-10-06", code="PA10"):
    return {"Raised Timestamp": f"{day}T{raised}", "Diffused Timestamp": f"{day}T{cleared}", "Alarm Name": name,
            "Machine": m, "Alarm Code": code, "Alarm Id": "PA-1001"}


def run(alarms, day_start=7):
    return analyze(alarms, CONFIG, start=None, end=None, day_start=day_start)


def test_overlapping_stop_alarms_are_one_stop_timed_from_first_raise_to_last_clear():
    # the example: 12:20:00-12:25:00 and 12:22:22-12:25:34 overlap -> one stop, 12:20:00-12:25:34
    r = run([alarm("12:20:00.000", "12:25:00.000", OP1), alarm("12:22:22.000", "12:25:34.000", K1)])
    [s] = r.stops
    assert (s.name, s.raised[11:19], s.cleared[11:19], s.duration_s, s.grouped) == (OP1, "12:20:00", "12:25:34", 334, [K1])
    assert r.stop_time_s == 334                       # not 300 + 192


def test_first_raised_is_the_main_alarm_and_ties_go_to_the_lowest_sn():
    later_sn_first = run([alarm("08:00:00.000", "08:00:10.000", OP2), alarm("08:00:01.000", "08:00:05.000", OP1)])
    assert later_sn_first.stops[0].name == OP2        # raised first, even with a higher SN
    same_time = run([alarm("08:00:00.000", "08:00:10.000", OP2), alarm("08:00:00.000", "08:00:10.000", OP1)])
    assert same_time.stops[0].name == OP1             # raised together: lowest SN


def test_only_machine_stop_alarms_count_and_machines_are_separate():
    r = run([alarm("08:00:00.000", "08:00:10.000", OP1), alarm("08:00:05.000", "09:00:00.000", HOMING),  # does not stop
             alarm("08:00:05.000", "08:00:20.000", OP1, m="M2"),                                       # other machine
             alarm("08:00:11.000", "08:00:12.000", K1)])                                               # after the gap
    # listed machine by machine, then in time order
    assert [(s.machine, s.name, s.duration_s) for s in r.stops] == [("M1", OP1, 10), ("M1", K1, 1), ("M2", OP1, 15)]
    assert (r.stop_alarms, r.stop_time_s) == (3, 26)
    assert [(t.machine, t.stops, t.stop_time_s) for t in r.machines] == [("M1", 2, 11), ("M2", 1, 15)]
    assert [(d.date.day, d.machine, d.stops, d.stop_time_s) for d in r.days] == [(6, "M1", 2, 11), (6, "M2", 1, 15)]


def test_port_alarms_raised_a_millisecond_apart_are_one_stop_per_machine():
    p3000, p3001 = "3000 PORT DISCONNNED", "3001 PORT DISCONNECTED"
    conf = CONFIG + [{"sn": 34, "name": p3000, "address": "Alarm5.X0", "machine_stops": True},
                     {"sn": 35, "name": p3001, "address": "Alarm5.X1", "machine_stops": True}]
    r = analyze([alarm("21:03:07.768", "21:03:16.914", p3000, m="M1"), alarm("21:03:07.769", "21:03:16.916", p3001, m="M1"),
                 alarm("21:03:15.247", "21:05:37.416", p3000, m="M2"), alarm("21:03:15.248", "21:05:37.417", p3001, m="M2")],
                conf, start=None, end=None, day_start=7)
    assert [(s.machine, s.name, s.grouped, s.duration_s) for s in r.stops] == [
        ("M1", p3000, [p3001], 9), ("M2", p3000, [p3001], 142)]


def test_millisecond_overlap_joins_and_missing_clear_uses_duration():
    a = alarm("08:00:00.000", "08:00:05.500", OP1)
    b = alarm("08:00:05.499", "08:00:07.000", K1)      # raised 1 ms before OP1 cleared
    c = {**alarm("09:00:00.000", "x", OP2), "Diffused Timestamp": None, "Duration (in Sec)": 42}
    r = run([a, b, c])
    assert [(s.name, s.duration_s) for s in r.stops] == [(OP1, 7), (OP2, 42)]


def test_days_follow_the_day_start_and_findings_name_the_main_cause():
    r = run([alarm("06:00:00.000", "06:00:30.000", OP1, day="2026-10-07"),    # still 6 Oct's day
             alarm("07:30:00.000", "07:31:00.000", OP1, day="2026-10-06"),
             alarm("09:00:00.000", "09:30:00.000", K1, day="2026-10-06")])
    assert [s.date for s in r.stops] == [date(2026, 10, 6)] * 3
    f = {c.key: c for c in r.findings}
    assert (f["stops"].value, f["top_cause"].value, f["time_lost"].value) == ("3", OP1, K1)
    assert [(c.key, c.value) for c in run([]).findings] == [("stops", "0")]


def test_config_rows_are_cleaned_and_defaults_are_valid():
    a = AlarmDefIn(sn=3, name="  OP2  lhs ", address=" Alarm1.X2 ", machine_stops=True)
    assert (a.name, a.address) == ("OP2 lhs", "Alarm1.X2")
    with pytest.raises(ValidationError):
        AlarmDefIn(sn=0, name="x", address="A", machine_stops=False)
    assert len({a.lower() for _, _, a, _ in DEFAULTS}) == len(DEFAULTS)
    assert len({name_key(n) for _, n, _, _ in DEFAULTS}) == len(DEFAULTS)
    for sn, n, a, s in DEFAULTS:
        AlarmDefIn(sn=sn, name=n, address=a, machine_stops=s)
