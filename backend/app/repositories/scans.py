"""MongoDB queries over a site's scan collection."""
from datetime import date, timedelta

from pymongo.collection import Collection

from app.core.config import TS

REJECTED = {"$eq": ["$Package Status", "Rejected"]}


def _count_if(cond) -> dict:
    return {"$sum": {"$cond": [cond, 1, 0]}}


def _rejected_with(codes: list[str]) -> dict:
    return {"$and": [REJECTED, {"$in": ["$Rejection Code", codes]}]}


def hourly_counts(coll: Collection, machine: str, start: date | None, end: date | None, overnight_end: int,
                  scopes: dict[str, list[str]]):
    """Scan counts per calendar day, hour and machine for shift dates start..end.

    `overnight_end` is the hour the next day at which the latest overnight shift ends (0 if none).
    """
    # include the overnight shift that starts on the end date
    to = f"{(end + timedelta(days=1)).isoformat()}T{overnight_end:02d}" if end else None
    return hourly_counts_between(coll, machine, start.isoformat() if start else None, to, scopes)


def hourly_counts_between(coll: Collection, machine: str, ts_from: str | None, ts_to: str | None,
                          scopes: dict[str, list[str]]):
    """Scan counts per calendar day, hour and machine for timestamps in [ts_from, ts_to).

    Bounds are ISO prefixes such as "2026-10-01T07"; timestamps are ISO strings, so they compare as text.
    `scopes` maps "Client" / "NIDO" to their rejection codes; rejections are counted per scope as "client" / "nido".
    """
    ts = {"$type": "string"}
    if ts_from:
        ts["$gte"] = ts_from
    if ts_to:
        ts["$lt"] = ts_to
    match = {TS: ts}
    if machine != "All":
        match["Machine Name"] = machine
    pipe = [{"$match": match},
            {"$group": {"_id": {"d": {"$substrCP": [f"${TS}", 0, 10]},
                                "h": {"$substrCP": [f"${TS}", 11, 2]},
                                "m": "$Machine Name"},
                        "total": {"$sum": 1},
                        "rejected": _count_if(REJECTED),
                        "client": _count_if(_rejected_with(scopes.get("Client", []))),
                        "nido": _count_if(_rejected_with(scopes.get("NIDO", [])))}}]
    return coll.aggregate(pipe, allowDiskUse=True)


SCAN_FIELDS = ("Scanned Barcode", "Machine Name", "Package Status", "Rejection Code", "BagSeal", "Chute ID")


def scans_between(coll: Collection, machine: str, ts_from: str | None, ts_to: str | None):
    """Scans with timestamps in [ts_from, ts_to), oldest first, with only the fields the abnormality checks use."""
    ts = {"$type": "string"}
    if ts_from:
        ts["$gte"] = ts_from
    if ts_to:
        ts["$lt"] = ts_to
    match = {TS: ts}
    if machine != "All":
        match["Machine Name"] = machine
    return coll.find(match, {"_id": 0, TS: 1, **dict.fromkeys(SCAN_FIELDS, 1)}).sort(TS, 1).allow_disk_use(True)


def timestamp_bounds(coll: Collection) -> tuple[str, str] | None:
    """Earliest and latest well-formed scan timestamps, or None when the collection has no scans."""
    r = next(coll.aggregate([{"$match": {TS: {"$regex": r"^\d{4}-\d{2}-\d{2}T\d{2}"}}},
                             {"$group": {"_id": None, "min": {"$min": f"${TS}"}, "max": {"$max": f"${TS}"}}}]), None)
    return (r["min"], r["max"]) if r else None


def machine_names(coll: Collection) -> list:
    return coll.distinct("Machine Name")
