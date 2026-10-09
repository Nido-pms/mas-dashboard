"""Rejection code definitions of one site, in its project database: {code, name, reasons, scope: "Client" | "NIDO"}."""
from bson import ObjectId
from bson.errors import InvalidId
from pymongo.collection import Collection

from app.core.config import settings
from app.core.projects import site_db

_indexed: set[str] = set()


def _coll(site: str) -> Collection:
    coll = site_db(site)[settings.rejection_codes_collection]
    if site not in _indexed:
        coll.create_index("code", unique=True, name="code_unique")
        _indexed.add(site)
    return coll


def _oid(code_id: str) -> ObjectId | None:
    try:
        return ObjectId(code_id)
    except InvalidId:
        return None


def find(site: str) -> list[dict]:
    return list(_coll(site).find())


def is_empty(site: str) -> bool:
    return _coll(site).estimated_document_count() == 0


# Whether the standard list was ever loaded for the site, kept in a small per-site settings collection.
_SEED_MARK = {"_id": "rejection_codes_seeded"}


def seeded(site: str) -> bool:
    return site_db(site)[settings.dashboard_meta_collection].find_one(_SEED_MARK) is not None


def mark_seeded(site: str) -> None:
    site_db(site)[settings.dashboard_meta_collection].update_one(_SEED_MARK, {"$set": _SEED_MARK}, upsert=True)


def insert_many(site: str, docs: list[dict]) -> None:
    _coll(site).insert_many(docs)


def insert(site: str, doc: dict) -> dict:
    """Insert a code; raises pymongo DuplicateKeyError when the code is taken."""
    _coll(site).insert_one(doc)  # sets doc["_id"]
    return doc


def update(site: str, code_id: str, fields: dict) -> dict | None:
    """Update a code; None when it does not exist. Raises DuplicateKeyError when the new code is taken."""
    oid = _oid(code_id)
    return _coll(site).find_one_and_update({"_id": oid}, {"$set": fields}, return_document=True) if oid else None


def delete(site: str, code_id: str) -> bool:
    oid = _oid(code_id)
    return bool(oid) and _coll(site).delete_one({"_id": oid}).deleted_count == 1
