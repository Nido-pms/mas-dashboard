from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.api.routes.mas import check_range
from app.core.config import DEFAULT_SITE, SITES
from app.core.projects import site_db
from app.repositories import alarms as alarms_repo
from app.schemas.alarms import AlarmDef, AlarmDefIn, AlarmDefList, AlarmReport, StopsIn
from app.services import alarm_analysis, alarm_config, mas

router = APIRouter(tags=["alarms"])

NOT_FOUND = "Alarm not found; it may have been deleted."


def _site(site: str) -> str:
    if site not in SITES:
        raise HTTPException(400, f"Unknown site: {site}")
    return site


def _found(saved: AlarmDef | None) -> AlarmDef:
    if saved is None:
        raise HTTPException(404, NOT_FOUND)
    return saved


def _save(fn, *args):
    try:
        return fn(*args)
    except alarm_config.DuplicateAddress as e:
        raise HTTPException(409, str(e)) from e


# ---------------------------------------------------------------- configuration

@router.get("/alarm-config", response_model=AlarmDefList)
def list_alarms(site: str = DEFAULT_SITE):
    """The site's alarm configuration, by SN, with how often each alarm appears in its alarm reports."""
    return alarm_config.list_alarms(_site(site))


@router.post("/alarm-config", response_model=AlarmDef, status_code=201)
def add_alarm(alarm: AlarmDefIn, site: str = DEFAULT_SITE):
    return _save(alarm_config.add, _site(site), alarm)


@router.put("/alarm-config/{alarm_id}", response_model=AlarmDef)
def update_alarm(alarm_id: str, update: AlarmDefIn, site: str = DEFAULT_SITE):
    return _found(_save(alarm_config.update, _site(site), alarm_id, update))


@router.patch("/alarm-config/{alarm_id}/stops", response_model=AlarmDef)
def set_stops(alarm_id: str, update: StopsIn, site: str = DEFAULT_SITE):
    """Change only whether the alarm stops the machine."""
    return _found(alarm_config.set_stops(_site(site), alarm_id, update.machine_stops))


@router.delete("/alarm-config/{alarm_id}")
def delete_alarm(alarm_id: str, site: str = DEFAULT_SITE):
    if not alarm_config.delete(_site(site), alarm_id):
        raise HTTPException(404, NOT_FOUND)
    return {"deleted": alarm_id}


# ---------------------------------------------------------------- analysis

@router.get("/alarm-analysis", response_model=AlarmReport)
def alarm_report(site: str = DEFAULT_SITE, start_date: date | None = None, end_date: date | None = None,
                 machine: str = "All", day_start: int = Query(7, ge=0, le=23, description="Hour each day starts at")):
    """Machine stops: overlapping machine-stop alarms grouped under the first one raised, and key findings."""
    _site(site)
    check_range(start_date, end_date)
    rows = alarms_repo.alarms_between(site_db(site), machine, *mas.day_window(start_date, end_date, day_start))
    return alarm_analysis.analyze(rows, alarm_config.definitions(site), start=start_date, end=end_date, day_start=day_start)
