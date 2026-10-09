"""Attendance: who checked in for each site, date and shift, and which machines each operator ran."""
from collections import defaultdict
from datetime import date, datetime, timezone

from pymongo.collection import Collection

from app.core.config import SITES
from app.domain.shifts import ShiftCalendar
from app.repositories import attendance as repo
from app.repositories import employees as employees_repo
from app.schemas.attendance import AttendanceSummary, PersonRef, Present, Sheet, SheetIn, SummaryRow
from app.services import machine_config


class SheetError(ValueError):
    """The sheet cannot be saved; the message is shown to the user."""


def build_present(sheet: SheetIn, *, site: str, calendar: ShiftCalendar, machines: list[str], staff: dict[str, dict],
                  today: date) -> list[dict]:
    """Validate a sheet against the site's shifts, machines and employees; return the people present."""
    if sheet.shift not in calendar.by_name:
        raise SheetError(f"Unknown shift: {sheet.shift}. Shifts are set on the Machine Configuration page.")
    if sheet.date > today:
        raise SheetError("Attendance cannot be marked for a future date.")
    if not sheet.entries:
        raise SheetError("Check in at least one person, or delete this attendance instead.")
    present, seen = [], set()
    for entry in sheet.entries:
        e = staff.get(entry.employee)
        if e is None:
            raise SheetError(f"An employee on the sheet is not in the Employee Master for {site}; reload the page.")
        if entry.employee in seen:
            raise SheetError(f"{e['name']} is on the sheet twice.")
        seen.add(entry.employee)
        assigned = list(dict.fromkeys(m.strip() for m in entry.machines)) if e["role"] == "Operator" else []
        if e["role"] == "Operator" and not assigned:
            raise SheetError(f"Assign at least one machine to {e['name']}.")
        for m in assigned:  # an operator can run several machines, and a machine can have several operators
            if m not in machines:
                raise SheetError(f"Unknown machine: {m}.")
        present.append({"employee": entry.employee, **{k: e[k] for k in ("employee_id", "name", "role", "client")},
                        "machines": sorted(assigned)})
    return sorted(present, key=lambda p: (p["role"], p["name"].lower()))


def _to_model(site: str, day: date, shift: str, doc: dict | None) -> Sheet:
    doc = doc or {}
    return Sheet(site=site, date=day, shift=shift, present=[Present(**p) for p in doc.get("present", [])],
                 updated_at=doc.get("updated_at"))


def get_sheet(site: str, day: date, shift: str) -> Sheet:
    return _to_model(site, day, shift, repo.get(site, day, shift))


def save_sheet(site: str, coll: Collection, sheet: SheetIn) -> Sheet:
    t = machine_config.targets(site)
    staff = {str(d["_id"]): d for d in employees_repo.find(site)}
    present = build_present(sheet, site=site, calendar=t.calendar, machines=machine_config.site_machines(coll, t),
                            staff=staff, today=date.today())
    doc = {"site": site, "date": sheet.date.isoformat(), "shift": sheet.shift, "present": present,
           "updated_at": datetime.now(timezone.utc)}
    repo.save(doc)
    return _to_model(site, sheet.date, sheet.shift, doc)


def delete_sheet(site: str, day: date, shift: str) -> bool:
    return repo.delete(site, day, shift)


def summarize(sheets: list[dict], orders: dict[str, list[str]]) -> list[SummaryRow]:
    """One row per sheet and client, newest date first, then by site, shift order and client."""
    rows = []
    for s in sheets:
        by_client = defaultdict(lambda: {"Operator": [], "Supervisor": []})
        for p in s["present"]:
            by_client[p["client"]][p["role"]].append(PersonRef(employee_id=p["employee_id"], name=p["name"]))
        for client, people in by_client.items():
            rows.append(SummaryRow(date=date.fromisoformat(s["date"]), shift=s["shift"], site=s["site"], client=client,
                                   operators=people["Operator"], supervisors=people["Supervisor"]))

    def rank(r: SummaryRow):
        order = orders.get(r.site, [])
        return order.index(r.shift) if r.shift in order else len(order)

    rows.sort(key=lambda r: r.client.lower())
    rows.sort(key=rank)
    rows.sort(key=lambda r: r.site)
    rows.sort(key=lambda r: r.date, reverse=True)
    return rows


def summary(site: str | None, start: date, end: date) -> AttendanceSummary:
    sites = [site] if site else list(SITES)
    orders = {s: machine_config.targets(s).calendar.order for s in sites}
    return AttendanceSummary(rows=summarize(repo.find(site, start, end), orders))
