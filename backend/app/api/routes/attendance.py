from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pymongo.collection import Collection

from app.api.deps import site_collection
from app.core.config import DEFAULT_SITE, SITES
from app.schemas.attendance import AttendanceSummary, Sheet, SheetIn
from app.services import attendance

router = APIRouter(prefix="/attendance", tags=["attendance"])
SiteCollection = Annotated[Collection, Depends(site_collection)]


@router.get("/sheet", response_model=Sheet)
def get_sheet(date: date, shift: str, _coll: SiteCollection, site: str = DEFAULT_SITE):
    """The attendance marked for one site, date and shift (empty with updated_at null when not marked yet)."""
    return attendance.get_sheet(site, date, shift)


@router.put("/sheet", response_model=Sheet)
def save_sheet(sheet: SheetIn, coll: SiteCollection, site: str = DEFAULT_SITE):
    """Create or replace the attendance for the sheet's date and shift: the people checked in and their machines."""
    try:
        return attendance.save_sheet(site, coll, sheet)
    except attendance.SheetError as e:
        raise HTTPException(400, str(e)) from e


@router.delete("/sheet")
def delete_sheet(date: date, shift: str, _coll: SiteCollection, site: str = DEFAULT_SITE):
    if not attendance.delete_sheet(site, date, shift):
        raise HTTPException(404, "No attendance marked for this shift; it may already have been deleted.")
    return {"deleted": True}


@router.get("/summary", response_model=AttendanceSummary)
def summary(start_date: date, end_date: date, site: str | None = None):
    """People present per date, shift, site and client. Leave out site for every site."""
    if site and site not in SITES:
        raise HTTPException(400, f"Unknown site: {site}")
    if start_date > end_date:
        raise HTTPException(400, "Start date is after end date.")
    return attendance.summary(site, start_date, end_date)
