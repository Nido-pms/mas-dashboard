from datetime import date

import pytest
from pydantic import ValidationError

from app.domain.shifts import ShiftCalendar
from app.schemas.attendance import SheetIn
from app.schemas.employees import EmployeeIn
from app.services.attendance import SheetError, build_present, summarize
from app.services.employees import EmployeeError, check, to_model

TODAY = date(2026, 10, 8)


def person(name, role="Operator", client="Meesho", registered="2026-10-01", site="Bhiwandi"):
    return {"name": name, "employee_id": f"E-{name}", "role": role, "client": client, "registration_date": registered,
            "site": site}


STAFF = {"1": person("Ravi"), "2": person("Amit"), "3": person("Sunita", "Supervisor")}


def sheet(entries, day=TODAY, shift="Day"):
    return SheetIn(date=day, shift=shift, entries=[{"employee": e, "machines": m} for e, m in entries])


def build(s):
    return build_present(s, site="Bhiwandi", calendar=ShiftCalendar(), machines=["M1", "M2", "M3"], staff=STAFF,
                         today=TODAY)


def test_operator_can_run_several_machines_and_supervisor_gets_none():
    present = build(sheet([("1", ["M2", "M1"]), ("3", ["M3"])]))
    assert [(p["name"], p["machines"]) for p in present] == [("Ravi", ["M1", "M2"]), ("Sunita", [])]


def test_operators_can_share_machines():
    present = build(sheet([("1", ["M1", "M2"]), ("2", ["M1", "M2", "M3"])]))
    assert [(p["name"], p["machines"]) for p in present] == [("Amit", ["M1", "M2", "M3"]), ("Ravi", ["M1", "M2"])]


def test_attendance_can_be_marked_before_the_registration_date():
    present = build(sheet([("1", ["M1"])], day=date(2026, 1, 15)))  # Ravi was registered on 01-10-2026
    assert [p["name"] for p in present] == ["Ravi"]


@pytest.mark.parametrize("s", [
    sheet([("1", ["M1"])], shift="Evening"),        # unknown shift
    sheet([("1", ["M1"])], day=date(2026, 10, 9)),  # future date
    sheet([]),                                      # nobody checked in
    sheet([("9", ["M1"])]),                         # not an employee of the site
    sheet([("1", ["M1"]), ("1", ["M2"])]),          # same person twice
    sheet([("1", [])]),                             # operator without a machine
    sheet([("1", ["M9"])]),                         # unknown machine
])
def test_invalid_sheets_are_rejected(s):
    with pytest.raises(SheetError):
        build(s)


def test_summary_groups_by_client():
    sheets = [{"site": "Bhiwandi", "date": "2026-10-08", "shift": "Day", "present": [
        {**person("Ravi"), "employee": "1", "machines": ["M1"]},
        {**person("Sunita", "Supervisor"), "employee": "3", "machines": []},
        {**person("Om", client="Flipkart"), "employee": "5", "machines": ["M2"]},
    ]}, {"site": "Bhiwandi", "date": "2026-10-07", "shift": "Day", "present": [
        {**person("Ravi"), "employee": "1", "machines": ["M1"]}]}]
    rows = summarize(sheets, {"Bhiwandi": ["Day", "Night"]})
    assert [(r.date.day, r.client, len(r.operators), len(r.supervisors)) for r in rows] == [
        (8, "Flipkart", 1, 0), (8, "Meesho", 1, 1), (7, "Meesho", 1, 0)]


def employee(**kw):
    return EmployeeIn(**{"name": "  Ravi   Kumar ", "registration_date": TODAY, "employee_id": " E 01 ", "site": "Bhiwandi",
                         "client": "Meesho", "role": "Operator", **kw})


def test_employees_saved_before_the_rename_still_load():
    doc = {"_id": "abc", **person("Ravi"), "created_at": TODAY, "updated_at": TODAY}
    doc["joining_date"] = doc.pop("registration_date")
    assert to_model(doc).registration_date == date(2026, 10, 1)


def test_employee_fields_are_cleaned():
    e = employee()
    assert (e.name, e.employee_id) == ("Ravi Kumar", "E01")


def test_employee_must_be_valid():
    for kw in ({"name": "  "}, {"role": "Loader"}, {"client": ""}):
        with pytest.raises(ValidationError):
            employee(**kw)
    for kw in ({"site": "Pune"}, {"registration_date": date(2026, 10, 9)}):
        with pytest.raises(EmployeeError):
            check(employee(**kw), TODAY)
