import math
import os
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pymongo import MongoClient
from pymongo.errors import PyMongoError

BASE_DIR = Path(__file__).resolve().parent
# Use this folder's .env if present, otherwise share the Meesho dashboard's connection settings.
load_dotenv(BASE_DIR / ".env" if (BASE_DIR / ".env").exists() else BASE_DIR.parent / "dashboard" / ".env")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "daily_reports")

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client[MONGO_DB]

SITES = {
    "Bhiwandi": {"collection": "Daily Report of CJ Darcel (Bhiwandi)"},
}

# Shifts in hours [start, end). A shift that crosses midnight is dated by the day it starts.
SHIFTS = [
    {"name": "Day", "label": "08:00 - 17:00", "start": 8, "end": 17},
    {"name": "Night", "label": "21:00 - 05:00", "start": 21, "end": 5},
]
OUTSIDE = "Outside shift"
DEFAULT_TARGET = 850       # parcels per machine per hour
DEFAULT_CALIBRATION = 0    # calibration parcels per shift
CLIENT_REJECT_CODES = None  # None = every rejection is billed as "rejected by client"
TS = "Inscan Timestamp"     # ISO string, e.g. 2026-10-07T02:15:22.348


@asynccontextmanager
async def lifespan(_app):
    for site, cfg in SITES.items():
        try:
            n = db[cfg["collection"]].estimated_document_count()
        except PyMongoError:
            n = "ERROR"
        print(f"{site:<10} {cfg['collection']:<50} docs: {n}")
    yield


app = FastAPI(title="MAS", version="1.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
# NIDO WORKZ theme (AdminLTE 3) assets, copied from the standard portal.
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.exception_handler(PyMongoError)
async def mongo_error(_req: Request, exc: PyMongoError):
    return JSONResponse(status_code=503, content={"detail": "Database unavailable. Check MongoDB and try again."})


# ---------------------------------------------------------------- helpers

def coll(site: str):
    if site not in SITES:
        raise HTTPException(400, f"Unknown site: {site}")
    return db[SITES[site]["collection"]]


def clean(value):
    """Return a trimmed string, or None for null / NaN / empty values."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    s = str(value).strip()
    return None if s.lower() in ("", "nan", "none", "null") else s


def parse_date(s):
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        raise HTTPException(400, f"Invalid date '{s}'. Use YYYY-MM-DD.")


def shift_hours(s):
    return [(s["start"] + i) % 24 for i in range((s["end"] - s["start"]) % 24)]


def shift_of(day: date, hour: int):
    """Map a calendar day + hour to (shift date, shift or None)."""
    for s in SHIFTS:
        if hour in shift_hours(s):
            crosses = s["start"] > s["end"]
            return (day - timedelta(days=1) if crosses and hour < s["end"] else day), s
    return day, None


def sort_hour(s, hour):
    """Order hours inside a shift date: post-midnight night hours come after 23:00."""
    return hour + 24 if s and s["start"] > s["end"] and hour < s["end"] else hour


def hour_label(h):
    return f"{h:02d}:00 - {(h + 1) % 24:02d}:00"


def is_client_reject():
    if CLIENT_REJECT_CODES is None:
        return {"$eq": ["$Package Status", "Rejected"]}
    return {"$and": [{"$eq": ["$Package Status", "Rejected"]}, {"$in": ["$Rejection Code", CLIENT_REJECT_CODES]}]}


def hourly_counts(site, machine, start, end):
    """Scan counts grouped by calendar day, hour and machine."""
    ts = {"$type": "string"}
    if start:
        ts["$gte"] = start.isoformat()
    if end:  # include the night shift that starts on the end date
        last_end = max(s["end"] for s in SHIFTS if s["start"] > s["end"])
        ts["$lt"] = f"{(end + timedelta(days=1)).isoformat()}T{last_end:02d}"
    match = {TS: ts}
    if machine != "All":
        match["Machine Name"] = machine
    pipe = [{"$match": match},
            {"$group": {"_id": {"d": {"$substrCP": [f"${TS}", 0, 10]},
                                "h": {"$substrCP": [f"${TS}", 11, 2]},
                                "m": "$Machine Name"},
                        "total": {"$sum": 1},
                        "rejected": {"$sum": {"$cond": [{"$eq": ["$Package Status", "Rejected"]}, 1, 0]}},
                        "client": {"$sum": {"$cond": [is_client_reject(), 1, 0]}}}}]
    return coll(site).aggregate(pipe, allowDiskUse=True)


# ---------------------------------------------------------------- routes

@app.get("/")
def home():
    f = BASE_DIR / "dashboard.html"
    if not f.exists():
        raise HTTPException(404, "dashboard.html not found")
    return FileResponse(f)


@app.get("/api/health")
def health():
    try:
        client.admin.command("ping")
        names = set(db.list_collection_names())
        return {"status": "ok", "database": MONGO_DB,
                "sites": {s: {"exists": c["collection"] in names,
                              "documents": db[c["collection"]].estimated_document_count()}
                          for s, c in SITES.items()}}
    except PyMongoError as e:
        return JSONResponse(status_code=503, content={"status": "error", "error": str(e)})


@app.get("/api/filters")
def filters(site: str = "Bhiwandi"):
    c = coll(site)
    r = next(c.aggregate([{"$match": {TS: {"$type": "string"}}},
                          {"$group": {"_id": None, "min": {"$min": f"${TS}"}, "max": {"$max": f"${TS}"}}}]), None)
    dates = []
    for v in (r["min"], r["max"]) if r else ():
        try:
            dates.append(shift_of(date.fromisoformat(v[:10]), int(v[11:13]))[0].isoformat())
        except ValueError:
            pass
    return {
        "site": site,
        "sites": list(SITES),
        "machines": sorted({s for s in map(clean, c.distinct("Machine Name")) if s}),
        "shifts": [{"name": s["name"], "label": s["label"]} for s in SHIFTS],
        "min_date": dates[0] if dates else None,
        "max_date": dates[-1] if dates else None,
        "default_target": DEFAULT_TARGET,
    }


@app.get("/api/billing")
def billing(site: str = "Bhiwandi", start_date: str | None = None, end_date: str | None = None,
            machine: str = "All", shift: str = "All",
            target: int = Query(DEFAULT_TARGET, ge=0, le=1_000_000)):
    """Hour-wise and shift-wise billing tables.

    Target per hour  = target x machines that ran in the shift
    Target per shift = target x machines x shift hours
    Every shift of every date in the range is listed; shifts without scans show zeros.
    Calibration parcels are deducted once per shift (in its first hour on the hourly table).
    """
    calibration = DEFAULT_CALIBRATION
    start, end = parse_date(start_date), parse_date(end_date)
    if start and end and start > end:
        raise HTTPException(400, "Start date is after end date.")
    if shift not in ("All", OUTSIDE) and shift not in {s["name"] for s in SHIFTS}:
        raise HTTPException(400, f"Unknown shift: {shift}")

    zero = lambda: {"total": 0, "rejected": 0, "client": 0}
    hours = defaultdict(zero)        # (shift date, shift name, hour) -> counts
    machines = defaultdict(set)      # (shift date, shift name) -> machine names
    seen = set()                     # shift dates that have scans
    for r in hourly_counts(site, machine, start, end):
        try:
            day, h = date.fromisoformat(r["_id"]["d"]), int(r["_id"]["h"])
        except (TypeError, ValueError):
            continue
        sd, s = shift_of(day, h)
        name = s["name"] if s else OUTSIDE
        if (start and sd < start) or (end and sd > end):
            continue
        seen.add(sd)
        if shift not in ("All", name):
            continue
        for k in ("total", "rejected", "client"):
            hours[(sd, name, h)][k] += r[k]
        machines[(sd, name)].add(clean(r["_id"]["m"]) or "Unknown")

    by_name = {s["name"]: s for s in SHIFTS}
    # List every shift hour of every date in range; hours and shifts without scans stay at zero.
    lo, hi = start or min(seen, default=None), end or max(seen, default=None)
    if lo and hi:
        for i in range((hi - lo).days + 1):
            sd = lo + timedelta(days=i)
            for s in SHIFTS:
                if shift in ("All", s["name"]):
                    machines[(sd, s["name"])]
                    for h in shift_hours(s):
                        hours[(sd, s["name"], h)]

    hour_rows = []
    for (sd, name, h), n in sorted(hours.items(), key=lambda kv: (kv[0][0], sort_hour(by_name.get(kv[0][1]), kv[0][2]))):
        s = by_name.get(name)
        m = len(machines[(sd, name)])
        tgt = target * m if s else 0
        cal = calibration if s and h == s["start"] else 0
        bal = n["total"] - cal
        hour_rows.append({"date": sd.isoformat(), "hour": hour_label(h), "shift": s["label"] if s else OUTSIDE,
                          "machines": m, "target": tgt, "induction": n["total"], "calibration": cal,
                          "balance": bal, "shortfall": tgt - bal})

    shift_rows = []
    for (sd, name), ms in sorted(machines.items(), key=lambda kv: (kv[0][0], [*by_name, OUTSIDE].index(kv[0][1]))):
        s = by_name.get(name)
        n = zero()
        for (d2, n2, _h), c in hours.items():
            if d2 == sd and n2 == name:
                for k in n:
                    n[k] += c[k]
        tgt = target * len(ms) * len(shift_hours(s)) if s else 0
        cal = calibration if s else 0
        bal = n["total"] - cal
        shift_rows.append({"date": sd.isoformat(), "shift": s["label"] if s else OUTSIDE, "machines": len(ms),
                           "hours": len(shift_hours(s)) if s else 0, "target": tgt, "induction": n["total"],
                           "rejected": n["rejected"], "calibration": cal, "balance": bal, "shortfall": tgt - bal,
                           "rejected_client": n["client"], "rejected_machine": n["rejected"] - n["client"]})

    tot = {k: sum(r[k] for r in shift_rows) for k in
           ("target", "induction", "rejected", "calibration", "balance", "shortfall", "rejected_client", "rejected_machine")}
    tot["achievement"] = round(tot["balance"] * 100 / tot["target"], 2) if tot["target"] else 0
    return {"config": {"target": target, "calibration": calibration},
            "totals": tot, "hour": hour_rows, "shift": shift_rows}
