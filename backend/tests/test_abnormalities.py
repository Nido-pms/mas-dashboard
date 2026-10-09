from datetime import date

from app.services.abnormalities import abnormalities

NAN = float("nan")


def scan(ts, barcode="B1", m="M1", status="Confirmed", code=NAN, seal="S1"):
    return {"Inscan Timestamp": f"2026-10-06T{ts}", "Scanned Barcode": barcode, "Machine Name": m, "Package Status": status,
            "Rejection Code": code, "BagSeal": seal, "Chute ID": 1001}


def dbar(ts, m="M1", n=0):
    return scan(ts, barcode=f"NoRead,{ts}{m}{n}", m=m, status="Rejected", code="DBAR", seal=NAN)


def run(scans, min_series=3, day_start=7):
    return abnormalities(scans, start=None, end=None, day_start=day_start, min_series=min_series)


def test_duplicates_per_day_skip_noread():
    r = run([scan("08:00:00", "A"), scan("08:05:00", "A", status="Rejected", code="DUPR", seal=NAN),
             scan("09:00:00", "A", m="M2"), scan("08:00:01", "B"),
             dbar("08:10:00"), dbar("08:10:00")])  # same NoRead text twice is not a duplicate
    assert [(d.barcode, d.scans, d.confirmed, d.rejected, d.codes, d.machines) for d in r.duplicates] == [
        ("A", 3, 2, 1, ["DUPR"], ["M1", "M2"])]
    assert [(d.barcodes, d.scans) for d in r.duplicate_days] == [(1, 3)]


def test_duplicate_threshold_counts_barcodes_scanned_that_many_times_or_more():
    scans = [scan(f"08:0{i}:00", "A") for i in range(4)] + [scan(f"09:0{i}:00", "B") for i in range(3)]
    found = lambda n: [(d.barcode, d.scans) for d in abnormalities(scans, start=None, end=None, day_start=7, min_series=5,
                                                                    min_scans=n).duplicates]
    assert found(2) == [("A", 4), ("B", 3)]
    assert found(4) == [("A", 4)]          # 4 or more
    assert found(5) == []


def test_duplicates_follow_the_day_start():
    r = run([scan("06:00:00", "A"), scan("08:00:00", "A")])  # 06:00 belongs to the previous day
    assert r.duplicates == []
    assert len(run([scan("06:00:00", "A"), scan("08:00:00", "A")], day_start=0).duplicates) == 1


def test_dbar_series_per_machine():
    scans = [dbar("08:00:00"), dbar("08:00:01", m="M2"), dbar("08:00:02"), dbar("08:59:59"),  # M2 does not break M1's run
             scan("09:00:00", "X"),                                                          # breaks M1's run (3)
             dbar("09:30:00"), dbar("09:30:01"),                                             # 2: too short
             scan("09:31:00", "Y"),
             dbar("10:00:00", n=1), dbar("10:00:01", n=2), dbar("10:00:02", n=3), dbar("10:00:03", n=4)]  # 4, still open
    r = run(scans)
    assert [(s.machine, s.hour, s.length) for s in r.dbar_series] == [("M1", "08:00 - 09:00", 3), ("M1", "10:00 - 11:00", 4)]
    assert [(d.series, d.dbar, d.longest) for d in r.dbar_days] == [(2, 7, 4)]
    assert run(scans, min_series=5).dbar_series == []


def test_missing_bagseal_only_for_parcels_not_rejected():
    r = run([scan("08:00:00", "A", seal=NAN), scan("08:00:01", "B", seal=""), scan("08:00:02", "C"),
             scan("08:00:03", "D", status="Rejected", code="CFGR", seal=NAN)])
    assert [p.barcode for p in r.missing_bagseal] == ["B", "A"]  # newest first
    assert r.missing_bagseal_total == 2 and r.missing_bagseal[0].chute == "1001"


def test_date_range_uses_the_day_start():
    r = abnormalities([scan("06:00:00", "A"), scan("06:30:00", "A")], start=date(2026, 10, 6), end=None, day_start=7,
                      min_series=5)
    assert r.duplicates == []  # both scans belong to 5 Oct
