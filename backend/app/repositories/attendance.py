"""Attendance sheets: one document per date and shift, in the site's project database,
{site, date: "YYYY-MM-DD", shift, present: [{employee, employee_id, name, role, client, machines}], updated_at}."""
from datetime import date

from pymongo.collection import Collection

from app.core.config import SITES, settings
from app.core.projects import site_db

_indexed: set[str] = set()


def _coll(site: str) -> Collection:
    coll = site_db(site)[settings.attendance_collection]
    if site not in _indexed:
        coll.create_index([("site", 1), ("date", 1), ("shift", 1)], unique=True, name="one_sheet_per_shift")
        _indexed.add(site)
    return coll


def _key(site: str, day: date, shift: str) -> dict:
    return {"site": site, "date": day.isoformat(), "shift": shift}


def get(site: str, day: date, shift: str) -> dict | None:
    return _coll(site).find_one(_key(site, day, shift))


def save(doc: dict) -> None:
    """Create or replace the sheet for doc's site, date and shift."""
    _coll(doc["site"]).replace_one({k: doc[k] for k in ("site", "date", "shift")}, doc, upsert=True)


def delete(site: str, day: date, shift: str) -> bool:
    return _coll(site).delete_one(_key(site, day, shift)).deleted_count == 1


def find(site: str | None, start: date, end: date) -> list[dict]:
    """Sheets of one site, or of every site."""
    q = {"date": {"$gte": start.isoformat(), "$lte": end.isoformat()}}
    return [d for s in ([site] if site else SITES) for d in _coll(s).find(q)]
