"""Employee master: one document per person in their site's project database,
{name, registration_date: "YYYY-MM-DD", employee_id, site, client, role}.

Employee IDs are unique across all sites, ignoring case ("e01" clashes with "E01"). A unique index guards
each site's database; other sites are checked before saving.
"""
from bson import ObjectId
from bson.errors import InvalidId
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError

from app.core.config import SITES, settings
from app.core.projects import site_db

CASE_INSENSITIVE = {"locale": "en", "strength": 2}
_indexed: set[str] = set()


def _coll(site: str) -> Collection:
    coll = site_db(site)[settings.employees_collection]
    if site not in _indexed:
        coll.create_index("employee_id", unique=True, name="employee_id_unique", collation=CASE_INSENSITIVE)
        _indexed.add(site)
    return coll


def _oid(employee: str) -> ObjectId | None:
    try:
        return ObjectId(employee)
    except InvalidId:
        return None


def _locate(oid: ObjectId) -> str | None:
    """The site whose database holds this employee."""
    return next((s for s in SITES if _coll(s).count_documents({"_id": oid}, limit=1)), None)


def _check_unique(employee_id: str, oid: ObjectId | None = None) -> None:
    """Raise DuplicateKeyError when another employee, at any site, has this employee ID."""
    q = {"employee_id": employee_id, "_id": {"$ne": oid}}
    if any(_coll(s).find_one(q, {"_id": 1}, collation=CASE_INSENSITIVE) for s in SITES):
        raise DuplicateKeyError(f"Employee ID {employee_id} is taken")


def find(site: str | None = None) -> list[dict]:
    return [d for s in ([site] if site else SITES) for d in _coll(s).find()]


def clients() -> list[str]:
    return sorted({c for s in SITES for c in _coll(s).distinct("client") if c})


def insert(doc: dict) -> dict:
    """Insert an employee; raises pymongo DuplicateKeyError when the employee ID is taken."""
    _check_unique(doc["employee_id"])
    _coll(doc["site"]).insert_one(doc)  # sets doc["_id"]
    return doc


def update(employee: str, fields: dict) -> dict | None:
    """Update an employee; None when it does not exist. Raises DuplicateKeyError when the new ID is taken.

    Changing the site moves the employee to that site's database, keeping its id.
    """
    oid = _oid(employee)
    current = _locate(oid) if oid else None
    if current is None:
        return None
    _check_unique(fields["employee_id"], oid)
    change = {"$set": fields, "$unset": {"joining_date": ""}}  # drop the field's name from before the rename
    if fields["site"] == current:
        return _coll(current).find_one_and_update({"_id": oid}, change, return_document=True)
    found = _coll(current).find_one({"_id": oid})
    if found is None:  # deleted meanwhile
        return None
    doc = {k: v for k, v in found.items() if k != "joining_date"}
    doc.update(fields)
    _coll(fields["site"]).insert_one(doc)
    _coll(current).delete_one({"_id": oid})
    return doc


def delete(employee: str) -> bool:
    oid = _oid(employee)
    site = _locate(oid) if oid else None
    return bool(site) and _coll(site).delete_one({"_id": oid}).deleted_count == 1
