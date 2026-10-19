from datetime import date

from pydantic import BaseModel

from app.schemas.mas import DayRow, DayTotals


class MachineDay(BaseModel):
    """Induction and rejections of one machine on one day."""
    date: date
    machine: str
    induction: int
    rejected: int
    rejected_client: int
    rejected_nido: int


class CodeDay(BaseModel):
    """Rejections of one machine with one rejection code on one day."""
    date: date
    machine: str
    code: str              # "" = no code on the scan
    count: int


class CodeInfo(BaseModel):
    code: str
    name: str              # from the Rejection Code Definition page; "" when the code is not defined
    scope: str             # "Client", "NIDO" or "" when not defined


class HomeReport(BaseModel):
    day_start: int
    days: list[DayRow]            # per day: target, induction, rejections (as on the Day-wise report)
    totals: DayTotals
    machine_days: list[MachineDay]
    code_days: list[CodeDay]      # rejections per day and rejection code
    codes: list[CodeInfo]         # the codes in code_days
