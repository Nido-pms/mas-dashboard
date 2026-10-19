"""Home page: the day-wise production trend, rejections per machine per day and per rejection code per day."""
from collections import Counter, defaultdict
from collections.abc import Iterable
from datetime import date, timedelta

from app.core.utils import clean
from app.schemas.home import CodeDay, CodeInfo, MachineDay


def machine_days(counts: Iterable[dict], *, start: date | None, end: date | None, day_start: int) -> list[MachineDay]:
    """Hourly scan counts summed per day (days start at `day_start` o'clock, as on the Day-wise report) and machine."""
    keys = ("total", "rejected", "client", "nido")
    acc: dict[tuple[date, str], Counter] = defaultdict(Counter)
    for r in counts:
        try:
            cal_day, h = date.fromisoformat(r["_id"]["d"]), int(r["_id"]["h"])
        except (TypeError, ValueError):
            continue
        day = cal_day if h >= day_start else cal_day - timedelta(days=1)
        if (start and day < start) or (end and day > end):
            continue
        acc[(day, clean(r["_id"]["m"]) or "Unknown")].update({k: r[k] for k in keys})
    return [MachineDay(date=d, machine=m, induction=c["total"], rejected=c["rejected"], rejected_client=c["client"],
                       rejected_nido=c["nido"]) for (d, m), c in sorted(acc.items())]


def code_days(counts: Iterable[dict], *, start: date | None, end: date | None, day_start: int,
              definitions: dict[str, tuple[str, str]]) -> tuple[list[CodeDay], list[CodeInfo]]:
    """Rejections per day, machine and rejection code, from hourly counts; `definitions` maps code -> (name, scope)."""
    acc: Counter = Counter()
    for r in counts:
        try:
            cal_day, h = date.fromisoformat(r["_id"]["d"]), int(r["_id"]["h"])
        except (TypeError, ValueError):
            continue
        day = cal_day if h >= day_start else cal_day - timedelta(days=1)
        if (start and day < start) or (end and day > end):
            continue
        acc[(day, clean(r["_id"].get("m")) or "Unknown", (clean(r["_id"].get("c")) or "").upper())] += r["count"]
    rows = [CodeDay(date=d, machine=m, code=c, count=n) for (d, m, c), n in sorted(acc.items())]
    codes = sorted({c for _, _, c in acc})
    return rows, [CodeInfo(code=c, name=definitions.get(c, ("", ""))[0], scope=definitions.get(c, ("", ""))[1]) for c in codes]
