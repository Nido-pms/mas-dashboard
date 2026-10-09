from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pymongo.collection import Collection

from app.api.deps import site_collection
from app.api.routes.mas import check_range
from app.core.config import DEFAULT_SITE
from app.repositories import scans
from app.schemas.abnormalities import AbnormalityReport
from app.services import abnormalities, mas

router = APIRouter(tags=["abnormalities"])


@router.get("/abnormalities", response_model=AbnormalityReport)
def abnormality_report(coll: Annotated[Collection, Depends(site_collection)], site: str = DEFAULT_SITE,
                       start_date: date | None = None, end_date: date | None = None, machine: str = "All",
                       day_start: int = Query(7, ge=0, le=23, description="Hour each day starts at"),
                       min_series: int = Query(5, ge=2, le=1000, description="DBAR rejections in a row that make a series"),
                       min_scans: int = Query(2, ge=2, le=1000, description="Scans in a day that make a barcode a duplicate")):
    """Duplicate parcels per day, DBAR rejections in series and non-rejected parcels without a bag seal."""
    check_range(start_date, end_date)
    rows = scans.scans_between(coll, machine, *mas.day_window(start_date, end_date, day_start))
    return abnormalities.abnormalities(rows, start=start_date, end=end_date, day_start=day_start, min_series=min_series,
                                       min_scans=min_scans)
