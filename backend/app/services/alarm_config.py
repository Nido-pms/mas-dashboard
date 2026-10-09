"""Alarm configuration: the PLC alarms of a site, their PLC address and whether they stop the machine."""
from datetime import datetime, timezone

from pymongo.errors import BulkWriteError, DuplicateKeyError

from app.core.config import SITES
from app.core.projects import site_db
from app.repositories import alarm_config as repo
from app.repositories import alarms as alarms_repo
from app.schemas.alarms import AlarmDef, AlarmDefIn, AlarmDefList

# PA: PLC alarms. Loaded the first time a site's list is opened; edit them on the page afterwards.
# (sn, alarm name, PLC address, stops the machine)
DEFAULTS: list[tuple[int, str, str, bool]] = [
    (1, "OP1 EMERGENCY ACTIVATED", "Alarm1.X0", True),
    (2, "K1 CONTACTOR OFF", "Alarm1.X1", True),
    (3, "OP2 LHS FENCING EMERGENCY ACTIVATED", "Alarm1.X2", True),
    (4, "OP3 RHS FENCING EMERGENCY ACTIVATED", "Alarm1.X3", True),
    (5, "LEFT LIMIT SWITCH ACTIVATED", "Alarm1.X4", True),
    (6, "RIGHT LIMIT SWITCH ACTIVATED", "Alarm1.X5", True),
    (7, "UP LIMIT SWITCH ACTIVATED", "Alarm1.X6", True),
    (8, "DOWN LIMIT SWITCH ACTIVATED", "Alarm1.X7", True),
    (9, "LHS DOOR LIMIT SWITCH ACTIVATED", "Alarm2.X0", True),
    (11, "RHS DOOR LIMIT SWITCH ACTIVATED", "Alarm2.X1", True),
    (12, "CV01 CRG IN FAULT", "Alarm2.X2", True),
    (13, "CV02 CRG IN FAULT", "Alarm2.X3", True),
    (14, "CV03 CRG IN FAULT", "Alarm2.X4", True),
    (15, "CV04 CRG IN FAULT", "Alarm2.X5", True),
    (16, "CV05 ASTRO-CART DRIVE FAULT", "Alarm2.X6", True),
    (17, "HORIZONTAL DRIVE FAULT", "Alarm2.X7", False),
    (18, "VERTICAL DRIVE FAULT", "Alarm3.X0", False),
    (19, "HORIZONTAL DRIVE HOMING REQUIRED", "Alarm3.X1", False),
    (20, "VERTICAL DRIVE HOMING REQUIRED", "Alarm3.X2", False),
    (21, "CRG BASE SENSOR NOT ACTIVATED", "Alarm3.X3", True),
    (22, "CV02 ENTRY SENSOR JAM", "Alarm3.X4", True),
    (23, "CV02 EXIT SENSOR JAM", "Alarm3.X5", True),
    (24, "CV03 EXIT SENSOR JAM", "Alarm3.X6", True),
    (25, "CV04 EXIT SENSOR JAM", "Alarm3.X7", True),
    (26, "CV05 ENTRY SENSOR JAM", "Alarm4.X0", True),
    (27, "CV05 EXIT SENSOR JAM", "Alarm4.X1", True),
    (28, "DIMENSION CAMERA DISCONNECTED", "Alarm4.X2", True),
    (29, "DIMENSION CAMERA NOT READY", "Alarm4.X3", True),
    (30, "START PB LONG ACTIVATED", "Alarm4.X4", True),
    (31, "STOP PB LONG ACTIVATED", "Alarm4.X5", True),
    (32, "RESET PB LONG ACTIVATED", "Alarm4.X6", True),
    (33, "ACK PB LONG ACTIVATED", "Alarm4.X7", True),
    (34, "3000 PORT DISCONNNED", "Alarm5.X0", True),
    (35, "3001 PORT DISCONNECTED", "Alarm5.X1", True),
    (36, "SPARE (NOT USED)", "Alarm5.X2", False),
    (37, "HAND HELD SCANNER DISCONNECTED", "Alarm5.X3", True),
    (38, "BARCODE CAMERA DISCONNECTED", "Alarm5.X4", True),
    (39, "BARCODE CAMERA NOT READY", "Alarm5.X5", True),
    (40, "ARIO MODUL1 DISCONNECTED", "Alarm5.X6", True),
    (41, "ARIO MODUL2 DISCONNECTED", "Alarm5.X7", True),
    (42, "ARIO MODUL3 DISCONNECTED", "Alarm6.X0", True),
    (43, "ARIO MODUL4 DISCONNECTED", "Alarm6.X1", True),
    (44, "PARCEL PICKED FROM CV01", "Alarm6.X2", True),
    (45, "PARCEL PICKED FROM CV02", "Alarm6.X3", True),
    (46, "PARCEL PICKED FROM CV03", "Alarm6.X4", True),
    (47, "PARCEL PICKED FROM CV04", "Alarm6.X5", True),
    (48, "SL1 TO 10- SENSOR JAM (PARCEL STUCK)", "Alarm6.X6", False),
    (49, "SL2 TO 11- SENSOR JAM (PARCEL STUCK)", "Alarm6.X7", False),
    (50, "SL3 TO 12 - SENSOR JAM (PARCEL STUCK)", "Alarm7.X0", False),
    (51, "SL13 TO 22- SENSOR JAM (PARCEL STUCK)", "Alarm7.X1", False),
    (52, "SL14 TO 23- SENSOR JAM (PARCEL STUCK)", "Alarm7.X2", False),
    (53, "SL15 TO 24- SENSOR JAM (PARCEL STUCK)", "Alarm7.X3", False),
    (54, "SL25 TO 46- SENSOR JAM (PARCEL STUCK)", "Alarm7.X4", False),
    (55, "SL26 TO 47-SENSOR JAM (PARCEL STUCK)", "Alarm7.X5", False),
    (56, "SL27 TO 48-SENSOR JAM (PARCEL STUCK)", "Alarm7.X6", False),
    (57, "CV04 OVER LENGTH ALARM", "Alarm7.X7", False),
    (58, "CV05 OVER LENGTH ALARM", "Alarm8.X0", False),
    (59, "H-AXIS BLOCK FAULT", "Alarm8.X1", True),
    (60, "V-AXIS BLOCK FAULT", "Alarm8.X2", True),
    (61, "PARCEL PICKED FROM CV05", "Alarm8.X3", True),
    (62, "SECOND VALIDATION NOT RECEIVED", "Alarm8.X4", False),
    (63, "CV01 OVERLENGTH SENSOR 1 JAM", "Alarm8.X5", False),
    (64, "CV01 OVERLENGTH SENSOR 2 JAM", "Alarm8.X6", False),
    (65, "SURGE ARRESTOR FAULT", "Alarm8.X7", True),
]



class AlarmConfigError(ValueError):
    """The alarm cannot be saved; the message is shown to the user."""


class DuplicateAddress(AlarmConfigError):
    pass


def name_key(name) -> str:
    """How configured names are matched to "Alarm Name" in the reports: case and extra spaces ignored."""
    return " ".join(str(name).split()).upper() if isinstance(name, str) else ""


def to_model(doc: dict, occurrences: int = 0) -> AlarmDef:
    return AlarmDef(id=str(doc["_id"]), occurrences=occurrences, **doc)


def _taken(a: AlarmDefIn) -> DuplicateAddress:
    return DuplicateAddress(f"Address {a.address} is already used by another alarm.")


def _seed(site: str) -> None:
    now = datetime.now(timezone.utc)
    try:
        repo.insert_many(site, [{"sn": sn, "name": n, "address": a, "machine_stops": s, "created_at": now, "updated_at": now}
                                for sn, n, a, s in DEFAULTS])
    except BulkWriteError:
        pass  # another request seeded them first


def definitions(site: str) -> list[dict]:
    """The site's alarm configuration; the standard list is loaded once, the first time."""
    if not repo.seeded(site):
        if repo.is_empty(site):
            _seed(site)
        repo.mark_seeded(site)
    return repo.find(site)


def list_alarms(site: str) -> AlarmDefList:
    counts = {}
    for name, n in alarms_repo.name_counts(site_db(site)).items():
        counts[name_key(name)] = counts.get(name_key(name), 0) + n
    docs = sorted(definitions(site), key=lambda d: (d["sn"], d["address"]))
    return AlarmDefList(site=site, sites=list(SITES), alarms=[to_model(d, counts.get(name_key(d["name"]), 0)) for d in docs])


def add(site: str, a: AlarmDefIn) -> AlarmDef:
    now = datetime.now(timezone.utc)
    try:
        return to_model(repo.insert(site, {**a.model_dump(), "created_at": now, "updated_at": now}))
    except DuplicateKeyError as err:
        raise _taken(a) from err


def update(site: str, alarm_id: str, a: AlarmDefIn) -> AlarmDef | None:
    try:
        doc = repo.update(site, alarm_id, {**a.model_dump(), "updated_at": datetime.now(timezone.utc)})
    except DuplicateKeyError as err:
        raise _taken(a) from err
    return to_model(doc) if doc else None


def set_stops(site: str, alarm_id: str, machine_stops: bool) -> AlarmDef | None:
    doc = repo.update(site, alarm_id, {"machine_stops": machine_stops, "updated_at": datetime.now(timezone.utc)})
    return to_model(doc) if doc else None


def delete(site: str, alarm_id: str) -> bool:
    return repo.delete(site, alarm_id)
