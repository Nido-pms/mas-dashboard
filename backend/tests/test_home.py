from datetime import date

from app.services.home import code_days, machine_days


def count(d, h, m, total, rejected=0, client=0, nido=0):
    return {"_id": {"d": d, "h": f"{h:02d}", "m": m}, "total": total, "rejected": rejected, "client": client, "nido": nido}


def test_counts_are_summed_per_day_and_machine_using_the_day_start():
    rows = machine_days([count("2026-10-06", 8, "M1", 100, 10, 7, 3),
                         count("2026-10-06", 9, "M1", 50, 5, 5, 0),
                         count("2026-10-07", 6, "M1", 20, 2, 1, 1),     # before 07:00: still 6 Oct
                         count("2026-10-06", 8, "M2", 30, 3, 0, 3),
                         count("2026-10-07", 8, "M2", 40, 4, 4, 0)],   # 7 Oct
                        start=None, end=None, day_start=7)
    assert [(r.date.day, r.machine, r.induction, r.rejected, r.rejected_client, r.rejected_nido) for r in rows] == [
        (6, "M1", 170, 17, 13, 4), (6, "M2", 30, 3, 0, 3), (7, "M2", 40, 4, 4, 0)]


def test_date_range_is_applied():
    rows = machine_days([count("2026-10-06", 8, "M1", 1), count("2026-10-08", 8, "M1", 1)],
                        start=date(2026, 10, 7), end=None, day_start=7)
    assert [r.date.day for r in rows] == [8]


def test_rejection_codes_are_counted_per_day_and_named():
    counts = [{"_id": {"d": "2026-10-01", "h": "08", "m": "M1", "c": "dbar"}, "count": 3},
              {"_id": {"d": "2026-10-02", "h": "06", "m": "M1", "c": "DBAR"}, "count": 2},     # before 07:00 -> 1 Oct
              {"_id": {"d": "2026-10-01", "h": "08", "m": "M2", "c": "DBAR"}, "count": 4},
              {"_id": {"d": "2026-10-02", "h": "09", "m": "M1", "c": None}, "count": 1}]       # no code
    rows, codes = code_days(counts, start=date(2026, 10, 1), end=date(2026, 10, 2), day_start=7,
                            definitions={"DBAR": ("Damage Barcode Rejection", "NIDO")})
    assert [(r.date.isoformat(), r.machine, r.code, r.count) for r in rows] == [
        ("2026-10-01", "M1", "DBAR", 5), ("2026-10-01", "M2", "DBAR", 4), ("2026-10-02", "M1", "", 1)]
    assert [(c.code, c.name, c.scope) for c in codes] == [("", "", ""), ("DBAR", "Damage Barcode Rejection", "NIDO")]
