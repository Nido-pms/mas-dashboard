from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.collection import Collection

from app.api.deps import site_collection
from app.core.config import DEFAULT_CALIBRATION, DEFAULT_SITE
from app.core.utils import clean
from app.domain.shifts import OUTSIDE
from app.repositories import scans
from app.schemas.mas import BillingReport, DayReport, FilterOptions
from app.services import machine_config, mas, rejection_codes

router = APIRouter(tags=["mas"])
SiteCollection = Annotated[Collection, Depends(site_collection)]


def check_range(start: date | None, end: date | None):
    if start and end and start > end:
        raise HTTPException(400, "Start date is after end date.")


def fleet(coll: Collection, t: machine_config.SiteTargets, machine: str) -> dict:
    """Machines the target is set for (all at the site, or the selected one) and how many the site has."""
    names = machine_config.site_machines(coll, t)
    return {"target_machines": names if machine == "All" else [clean(machine)], "total_machines": len(names)}


@router.get("/filters", response_model=FilterOptions)
def filters(coll: SiteCollection, site: str = DEFAULT_SITE):
    return mas.filter_options(site, coll, machine_config.targets(site).calendar)


@router.get("/billing", response_model=BillingReport)
def billing(coll: SiteCollection, site: str = DEFAULT_SITE, start_date: date | None = None,
            end_date: date | None = None, machine: str = "All", shift: str = "All"):
    """Hour-wise and shift-wise billing tables for one site, using the saved targets of every machine."""
    check_range(start_date, end_date)
    t = machine_config.targets(site)
    if shift not in ("All", OUTSIDE) and shift not in t.calendar.by_name:
        raise HTTPException(400, f"Unknown shift: {shift}")
    counts = scans.hourly_counts(coll, machine, start_date, end_date, t.calendar.last_overnight_hour(),
                                 rejection_codes.codes_by_scope(site))
    return mas.billing_report(counts, start=start_date, end=end_date, shift=shift, calendar=t.calendar, targets=t.hourly,
                              default_target=t.default_target, calibration=DEFAULT_CALIBRATION,
                              **fleet(coll, t, machine))


@router.get("/day-wise", response_model=DayReport)
def day_wise(coll: SiteCollection, site: str = DEFAULT_SITE, start_date: date | None = None,
             end_date: date | None = None, machine: str = "All",
             day_start: int = Query(7, ge=0, le=23, description="Hour each day starts at")):
    """Day-wise induction against every machine's day target; each day runs day_start to day_start next day."""
    check_range(start_date, end_date)
    t = machine_config.targets(site)
    counts = scans.hourly_counts_between(coll, machine, *mas.day_window(start_date, end_date, day_start),
                                         rejection_codes.codes_by_scope(site))
    return mas.day_report(counts, start=start_date, end=end_date, day_start=day_start, day_target=t.day_target,
                          **fleet(coll, t, machine))
