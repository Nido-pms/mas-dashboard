from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pymongo.collection import Collection

from app.api.deps import site_collection
from app.api.routes.mas import check_range
from app.core.config import DEFAULT_SITE
from app.core.utils import clean
from app.repositories import scans
from app.schemas.shift_schedule import DateOverrideIn, Heatmap, InactiveScans, ScheduleConfig, WeeklyUpdate
from app.services import machine_config, rejection_codes, shift_schedule

router = APIRouter(prefix="/shift-schedule", tags=["shift activation"])
SiteCollection = Annotated[Collection, Depends(site_collection)]


def _save(fn, *args):
    try:
        fn(*args)
    except shift_schedule.ScheduleError as e:
        raise HTTPException(400, str(e)) from e


@router.get("", response_model=ScheduleConfig)
def get_schedule(coll: SiteCollection, site: str = DEFAULT_SITE):
    """The site's weekly pattern of switched-off shifts and its date changes."""
    return shift_schedule.get_config(site, coll)


@router.put("/weekly", response_model=ScheduleConfig)
def save_weekly(update: WeeklyUpdate, coll: SiteCollection, site: str = DEFAULT_SITE):
    """Replace the weekly pattern: the (weekday, shift, machine) combinations that do not run."""
    _save(shift_schedule.save_weekly, site, coll, update)
    return shift_schedule.get_config(site, coll)


@router.put("/override", response_model=ScheduleConfig)
def set_override(change: DateOverrideIn, coll: SiteCollection, site: str = DEFAULT_SITE):
    """Switch a shift on or off for a date (all machines or one); active=null goes back to the weekly pattern."""
    _save(shift_schedule.set_override, site, coll, change)
    return shift_schedule.get_config(site, coll)


@router.get("/inactive-scans", response_model=InactiveScans)
def inactive_scans(coll: SiteCollection, site: str = DEFAULT_SITE, start_date: date | None = None,
                   end_date: date | None = None):
    """Switched-off shifts in which a machine still scanned parcels."""
    check_range(start_date, end_date)
    t = machine_config.targets(site)
    counts = scans.hourly_counts(coll, "All", start_date, end_date, t.calendar.last_overnight_hour(),
                                 rejection_codes.codes_by_scope(site))
    return shift_schedule.inactive_scans(counts, calendar=t.calendar, schedule=shift_schedule.load(site),
                                         start=start_date, end=end_date)


@router.get("/heatmap", response_model=Heatmap)
def heatmap(coll: SiteCollection, start_date: date, end_date: date, site: str = DEFAULT_SITE, machine: str = "All",
            shift: str = "All"):
    """Per day: parcels scanned (and shifts that run), for the activity heatmap (at most about a year)."""
    check_range(start_date, end_date)
    if (end_date - start_date) > timedelta(days=371):
        raise HTTPException(400, "Pick at most one year.")
    t = machine_config.targets(site)
    if shift != "All" and shift not in t.calendar.by_name:
        raise HTTPException(400, f"Unknown shift: {shift}.")
    names = machine_config.site_machines(coll, t)
    if machine != "All":
        if clean(machine) not in names:
            raise HTTPException(400, f"Unknown machine: {machine}.")
        names = [clean(machine)]
    counts = scans.hourly_counts(coll, machine, start_date, end_date, t.calendar.last_overnight_hour(),
                                 rejection_codes.codes_by_scope(site))
    return shift_schedule.heatmap(counts, calendar=t.calendar, schedule=shift_schedule.load(site), machines=names,
                                  start=start_date, end=end_date, shift=shift)
