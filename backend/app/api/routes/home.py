from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pymongo.collection import Collection

from app.api.deps import site_collection
from app.api.routes.mas import check_range, fleet
from app.core.config import DEFAULT_SITE
from app.repositories import scans
from app.schemas.home import HomeReport
from app.services import home, machine_config, mas, rejection_codes, shift_schedule

router = APIRouter(tags=["home"])


@router.get("/home", response_model=HomeReport)
def home_report(coll: Annotated[Collection, Depends(site_collection)], site: str = DEFAULT_SITE,
                start_date: date | None = None, end_date: date | None = None, machine: str = "All",
                day_start: int = Query(7, ge=0, le=23, description="Hour each day starts at")):
    """The Home page charts, with the same numbers as the Day-wise report."""
    check_range(start_date, end_date)
    window = mas.day_window(start_date, end_date, day_start)
    t = machine_config.targets(site)
    counts = list(scans.hourly_counts_between(coll, machine, *window, rejection_codes.codes_by_scope(site)))
    day = mas.day_report(counts, start=start_date, end=end_date, day_start=day_start, hour_target=t.hour_target,
                         schedule=shift_schedule.load(site), calendar=t.calendar, **fleet(coll, t, machine))
    definitions = {c.code: (c.name, c.scope) for c in rejection_codes.list_codes(site).codes}
    code_days, codes = home.code_days(scans.rejection_code_counts_between(coll, machine, *window), start=start_date,
                                      end=end_date, day_start=day_start, definitions=definitions)
    return HomeReport(day_start=day_start, days=day.days, totals=day.totals,
                      machine_days=home.machine_days(counts, start=start_date, end=end_date, day_start=day_start),
                      code_days=code_days, codes=codes)
