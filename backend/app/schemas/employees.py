from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

Role = Literal["Operator", "Supervisor"]


def _squash(s: str) -> str:
    """Trim and collapse inner spaces; reject blanks."""
    s = " ".join(s.split())
    if not s:
        raise ValueError("cannot be empty")
    return s


Text = Annotated[str, Field(max_length=60), AfterValidator(_squash)]
Code = Annotated[str, Field(max_length=30), AfterValidator(lambda s: _squash(s).replace(" ", ""))]


class EmployeeIn(BaseModel):
    name: Text
    registration_date: date  # when the employee was registered; does not limit attendance
    employee_id: Code
    site: str
    client: Text
    role: Role


class Employee(EmployeeIn):
    id: str
    created_at: datetime
    updated_at: datetime


class EmployeeList(BaseModel):
    sites: list[str]
    clients: list[str]  # every client name in use, for suggestions
    employees: list[Employee]
