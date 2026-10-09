"""Alarm configuration of one site, in its project database: {sn, name, address, machine_stops}."""
from bson import ObjectId
from bson.errors import InvalidId
from pymongo.collection import Collection

from app.core.config import settings
from app.core.projects import site_db

_indexed: set[str] = set()
_SEED_MARK = {"_id": "alarm_config_seeded"}


def _coll(site: str) -> Collection:
    coll = site_db(site)[settings.alarm_config_collection]
    if site not in _indexed:
        coll.create_index("address", unique=True, name="address_unique", collation={"locale": "en", "strength": 2})
        _indexed.add(site)
    return coll


def _oid(alarm_id: str) -> ObjectId | None:
    try:
        return ObjectId(alarm_id)
    except InvalidId:
        return None


def find(site: str) -> list[dict]:
    return list(_coll(site).find())


def is_empty(site: str) -> bool:
    return _coll(site).estimated_document_count() == 0


def seeded(site: str) -> bool:
    return site_db(site)[settings.dashboard_meta_collection].find_one(_SEED_MARK) is not None


def mark_seeded(site: str) -> None:
    site_db(site)[settings.dashboard_meta_collection].update_one(_SEED_MARK, {"$set": _SEED_MARK}, upsert=True)


def insert_many(site: str, docs: list[dict]) -> None:
    _coll(site).insert_many(docs)


def insert(site: str, doc: dict) -> dict:
    """Insert an alarm; raises pymongo DuplicateKeyError when the address is taken."""
    _coll(site).insert_one(doc)
    return doc


def update(site: str, alarm_id: str, fields: dict) -> dict | None:
    """Update an alarm; None when it does not exist. Raises DuplicateKeyError when the new address is taken."""
    oid = _oid(alarm_id)
    return _coll(site).find_one_and_update({"_id": oid}, {"$set": fields}, return_document=True) if oid else None


def delete(site: str, alarm_id: str) -> bool:
    oid = _oid(alarm_id)
    return bool(oid) and _coll(site).delete_one({"_id": oid}).deleted_count == 1
