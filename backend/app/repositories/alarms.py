"""Alarm reports uploaded into the site's project database ("alarm" collection, one document per alarm raised).

Column names differ between report versions: "Alarm Category (Severity)" or "Alarm Category", and
"Machine" or "Machine Name" (some sites have no machine column at all).
"""
from collections import Counter

from pymongo.database import Database

ALARMS = "alarm"
RAISED = "Raised Timestamp"   # ISO string, e.g. 2026-10-09T12:21:09.773
CLEARED = "Diffused Timestamp"
FIELDS = ("Alarm Id", "Alarm Code", "Alarm Name", "Alarm Category (Severity)", "Alarm Category",
          "Duration (in Sec)", "Machine", "Machine Name", RAISED, CLEARED)


def alarms_between(db: Database, machine: str, ts_from: str | None, ts_to: str | None):
    """Alarms raised in [ts_from, ts_to) (ISO prefixes such as "2026-10-01T07"), oldest first."""
    ts = {"$type": "string"}
    if ts_from:
        ts["$gte"] = ts_from
    if ts_to:
        ts["$lt"] = ts_to
    match: dict = {RAISED: ts}
    if machine != "All":
        match["$or"] = [{"Machine": machine}, {"Machine Name": machine}]
    return db[ALARMS].find(match, {"_id": 0, **dict.fromkeys(FIELDS, 1)}).sort(RAISED, 1).allow_disk_use(True)


def name_counts(db: Database) -> Counter:
    """How often each "Alarm Name" occurs, over all uploaded reports."""
    return Counter({r["_id"]: r["n"] for r in db[ALARMS].aggregate(
        [{"$group": {"_id": "$Alarm Name", "n": {"$sum": 1}}}], allowDiskUse=True) if isinstance(r["_id"], str)})
