from fastapi import APIRouter, HTTPException

from app.core.config import SITES
from app.schemas.employees import Employee, EmployeeIn, EmployeeList
from app.services import employees

router = APIRouter(prefix="/employees", tags=["employees"])

NOT_FOUND = "Employee not found; it may have been deleted."


def _save(fn, *args):
    try:
        return fn(*args)
    except employees.DuplicateEmployee as e:
        raise HTTPException(409, str(e)) from e
    except employees.EmployeeError as e:
        raise HTTPException(400, str(e)) from e


@router.get("", response_model=EmployeeList)
def list_employees(site: str | None = None):
    """Employees (all sites, or one), with the site list and client names for the form."""
    if site and site not in SITES:
        raise HTTPException(400, f"Unknown site: {site}")
    return employees.list_employees(site)


@router.post("", response_model=Employee, status_code=201)
def add_employee(employee: EmployeeIn):
    return _save(employees.add, employee)


@router.put("/{employee}", response_model=Employee)
def update_employee(employee: str, update: EmployeeIn):
    saved = _save(employees.update, employee, update)
    if saved is None:
        raise HTTPException(404, NOT_FOUND)
    return saved


@router.delete("/{employee}")
def delete_employee(employee: str):
    """Delete an employee. Attendance already marked keeps their name."""
    if not employees.delete(employee):
        raise HTTPException(404, NOT_FOUND)
    return {"deleted": employee}
