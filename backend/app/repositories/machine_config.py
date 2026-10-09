"""Saved site settings: one document in the site's project database,
{_id: site, default_target, machines: [{name, target}], shifts}."""
from datetime import datetime, timezone

from pymongo.collection import Collection

from app.core.config import settings
from app.core.projects import site_db


def _coll(site: str) -> Collection:
    return site_db(site)[settings.machine_config_collection]


def get(site: str) -> dict | None:
    return _coll(site).find_one({"_id": site})


def save(site: str, machines: list[dict], default_target: int | None = None) -> None:
    """Replace the site's machine targets; the default target is only changed when given."""
    fields = {"machines": machines, "updated_at": datetime.now(timezone.utc)}
    if default_target is not None:
        fields["default_target"] = default_target
    _coll(site).update_one({"_id": site}, {"$set": fields}, upsert=True)


def _set(site: str, field: str, value) -> None:
    _coll(site).update_one({"_id": site}, {"$set": {field: value, "updated_at": datetime.now(timezone.utc)}}, upsert=True)


def save_shifts(site: str, shifts: list[dict]) -> None:
    """Replace the site's shifts."""
    _set(site, "shifts", shifts)
