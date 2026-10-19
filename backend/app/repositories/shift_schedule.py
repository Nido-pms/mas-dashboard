"""Shift activation of one site, in its project database: one "weekly" document plus one document per date change."""
from datetime import datetime, timezone

from pymongo.collection import Collection

from app.core.config import settings
from app.core.projects import site_db

WEEKLY_ID = "weekly"


def _coll(site: str) -> Collection:
    return site_db(site)[settings.shift_schedule_collection]


def weekly_off(site: str) -> list[dict]:
    doc = _coll(site).find_one({"_id": WEEKLY_ID})
    return doc.get("weekly_off", []) if doc else []


def save_weekly(site: str, rules: list[dict]) -> None:
    _coll(site).update_one({"_id": WEEKLY_ID}, {"$set": {"weekly_off": rules, "updated_at": datetime.now(timezone.utc)}},
                           upsert=True)


def overrides(site: str) -> list[dict]:
    return list(_coll(site).find({"_id": {"$ne": WEEKLY_ID}}, {"_id": 0}).sort([("date", 1), ("shift", 1), ("machine", 1)]))


def _key(day: str, shift: str, machine: str) -> str:
    return f"{day}|{shift}|{machine}"


def set_override(site: str, day: str, shift: str, machine: str, active: bool) -> None:
    _coll(site).update_one({"_id": _key(day, shift, machine)},
                           {"$set": {"date": day, "shift": shift, "machine": machine, "active": active,
                                     "updated_at": datetime.now(timezone.utc)}}, upsert=True)


def remove_override(site: str, day: str, shift: str, machine: str) -> None:
    _coll(site).delete_one({"_id": _key(day, shift, machine)})
