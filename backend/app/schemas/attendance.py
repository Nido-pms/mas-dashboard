from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.employees import Role

MAX_ENTRIES = 1000


class SheetEntryIn(BaseModel):
    employee: str                                            # Employee.id
    machines: list[str] = Field(default=[], max_length=100)  # operators only


class SheetIn(BaseModel):
    date: date
    shift: str
    entries: list[SheetEntryIn] = Field(max_length=MAX_ENTRIES)  # the people checked in


class Present(BaseModel):
    """A person checked in, with their details as they were when the sheet was saved."""
    employee: str
    employee_id: str
    name: str
    role: Role
    client: str
    machines: list[str]


class Sheet(BaseModel):
    site: str
    date: date
    shift: str
    present: list[Present]
    updated_at: datetime | None  # None = not marked yet


class PersonRef(BaseModel):
    employee_id: str
    name: str


class SummaryRow(BaseModel):
    date: date
    shift: str
    site: str
    client: str
    operators: list[PersonRef]
    supervisors: list[PersonRef]


class AttendanceSummary(BaseModel):
    rows: list[SummaryRow]
