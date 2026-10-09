"""Employee master: the people who can be marked present on the attendance sheets."""
from datetime import date, datetime, timezone

from pymongo.errors import DuplicateKeyError

from app.core.config import SITES
from app.repositories import employees as repo
from app.schemas.employees import Employee, EmployeeIn, EmployeeList


class EmployeeError(ValueError):
    """The employee cannot be saved; the message is shown to the user."""


class DuplicateEmployee(EmployeeError):
    pass


def check(e: EmployeeIn, today: date) -> None:
    if e.site not in SITES:
        raise EmployeeError(f"Unknown site: {e.site}.")
    if e.registration_date > today:
        raise EmployeeError("Registration date cannot be in the future.")


def to_model(doc: dict) -> Employee:
    registered = doc.get("registration_date") or doc["joining_date"]  # employees saved before the rename
    return Employee(id=str(doc["_id"]), **{**doc, "registration_date": date.fromisoformat(registered)})


def _fields(e: EmployeeIn) -> dict:
    return {**e.model_dump(), "registration_date": e.registration_date.isoformat()}


def _taken(e: EmployeeIn) -> DuplicateEmployee:
    return DuplicateEmployee(f"Employee ID {e.employee_id} is already used by another employee.")


def list_employees(site: str | None = None) -> EmployeeList:
    docs = sorted(repo.find(site), key=lambda d: (d["site"], d["role"], d["name"].lower()))
    return EmployeeList(sites=list(SITES), clients=sorted(repo.clients(), key=str.lower),
                        employees=[to_model(d) for d in docs])


def add(e: EmployeeIn) -> Employee:
    check(e, date.today())
    now = datetime.now(timezone.utc)
    try:
        return to_model(repo.insert({**_fields(e), "created_at": now, "updated_at": now}))
    except DuplicateKeyError as err:
        raise _taken(e) from err


def update(employee: str, e: EmployeeIn) -> Employee | None:
    check(e, date.today())
    try:
        doc = repo.update(employee, {**_fields(e), "updated_at": datetime.now(timezone.utc)})
    except DuplicateKeyError as err:
        raise _taken(e) from err
    return to_model(doc) if doc else None


def delete(employee: str) -> bool:
    return repo.delete(employee)
