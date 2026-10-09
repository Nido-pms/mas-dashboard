"""Abnormalities: duplicate parcels, DBAR rejections in series and confirmed parcels without a bag seal."""
from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta

from app.core.config import TS
from app.core.utils import clean
from app.domain.shifts import hour_label
from app.schemas.abnormalities import (AbnormalityReport, DbarDay, DbarSeries, DuplicateDay, DuplicateParcel,
                                       MissingBagSeal)

DBAR = "DBAR"
MISSING_BAGSEAL_LIMIT = 5000


def _day(ts: str, day_start: int) -> date:
    """The day a scan belongs to: days run from `day_start` o'clock to the same time next day."""
    d = date.fromisoformat(ts[:10])
    return d if int(ts[11:13]) >= day_start else d - timedelta(days=1)


def _no_read(barcode: str) -> bool:
    return barcode.lower().startswith("noread")


def abnormalities(scans: Iterable[dict], *, start: date | None, end: date | None, day_start: int,
                  min_series: int, min_scans: int = 2) -> AbnormalityReport:
    """Run the three checks over scans sorted oldest first.

    Duplicate parcel  = same barcode scanned `min_scans` or more times in a day (NoRead barcodes are left out).
    DBAR series       = `min_series` or more DBAR rejections in a row on one machine, dated by the scan that starts it.
    Missing bag seal  = a parcel whose status is not Rejected but has no BagSeal.
    """
    by_barcode = defaultdict(list)     # (day, barcode) -> scans
    runs: dict[str, list] = {}         # machine -> current DBAR run
    series: list[DbarSeries] = []
    missing: list[MissingBagSeal] = []

    def close(machine: str) -> None:
        run = runs.pop(machine, None)
        if run and len(run) >= min_series:
            first = run[0]
            series.append(DbarSeries(date=first["day"], hour=hour_label(int(first[TS][11:13])), machine=machine,
                                     length=len(run), first=first[TS], last=run[-1][TS]))

    for s in scans:
        ts = s.get(TS)
        try:
            day = _day(ts, day_start)
        except (TypeError, ValueError):
            continue
        if (start and day < start) or (end and day > end):
            continue
        s = {**s, "day": day}
        machine = clean(s.get("Machine Name")) or "Unknown"
        barcode = clean(s.get("Scanned Barcode"))
        rejected = s.get("Package Status") == "Rejected"

        if barcode and not _no_read(barcode):
            by_barcode[(day, barcode)].append({**s, "machine": machine, "rejected": rejected})

        if rejected and clean(s.get("Rejection Code")) == DBAR:
            runs.setdefault(machine, []).append(s)
        else:
            close(machine)

        if not rejected and not clean(s.get("BagSeal")):
            missing.append(MissingBagSeal(date=day, timestamp=ts, barcode=barcode or "", machine=machine,
                                          status=clean(s.get("Package Status")) or "", chute=clean(s.get("Chute ID")) or ""))
    for machine in list(runs):
        close(machine)

    duplicates = []
    for (day, barcode), group in by_barcode.items():
        if len(group) >= min_scans:
            rejected = sum(g["rejected"] for g in group)
            duplicates.append(DuplicateParcel(
                date=day, barcode=barcode, scans=len(group), confirmed=len(group) - rejected, rejected=rejected,
                codes=sorted({c for g in group if (c := clean(g.get("Rejection Code")))}),
                machines=sorted({g["machine"] for g in group}), first=group[0][TS], last=group[-1][TS]))
    duplicates.sort(key=lambda d: (d.date, -d.scans, d.barcode))

    dup_days = defaultdict(lambda: [0, 0])
    for d in duplicates:
        dup_days[d.date][0] += 1
        dup_days[d.date][1] += d.scans

    dbar_days = defaultdict(list)
    for s in series:
        dbar_days[s.date].append(s.length)
    series.sort(key=lambda s: s.first)

    return AbnormalityReport(
        day_start=day_start, min_series=min_series, min_scans=min_scans,
        duplicate_days=[DuplicateDay(date=d, barcodes=b, scans=n) for d, (b, n) in sorted(dup_days.items())],
        duplicates=duplicates,
        dbar_days=[DbarDay(date=d, series=len(ls), dbar=sum(ls), longest=max(ls)) for d, ls in sorted(dbar_days.items())],
        dbar_series=series,
        missing_bagseal=missing[::-1][:MISSING_BAGSEAL_LIMIT],
        missing_bagseal_total=len(missing),
    )
