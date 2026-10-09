"""Rejection code definitions: what each machine rejection code means and whether the client or NIDO owns it."""
from datetime import datetime, timezone

from pymongo.errors import BulkWriteError, DuplicateKeyError

from app.core.config import SITES
from app.repositories import rejection_codes as repo
from app.schemas.rejection_codes import RejectionCode, RejectionCodeIn, RejectionCodeList, Scope

# Loaded into the database the first time the list is opened while it is empty; edit them on the page afterwards.
DEFAULTS: list[tuple[str, str, str, Scope]] = [
    ("DBAR", "Damage Barcode Rejection", "When camera is unable to locate the barcode on the shipment due to damage or missing of the barcode", "Client"),
    ("IBAR", "Invalid Barcode Rejection", "If the barcode does not match the defined REGEX pattern due to invalid characters, incorrect length, unsupported prefix/suffix, or other format structure.", "Client"),
    ("DNFR", "Data Not Found Rejection", "If the data of the processed shipment is not available into the incoming data (Shared by the client), these shipments will be rejected under the DNFR", "Client"),
    ("CLBR", "Calibration Required Rejection", "A shipment was mistakenly processed in place of the calibration box when calibration was required (Calibration check is active due to count/time/Interval)", "Client"),
    ("DNRR", "Dimension Not Received Rejection", "", "NIDO"),
    ("WNRR", "Weight Not Received Rejection", "Due to the uneven shape of the shipment, the weight may not be evenly distributed across the load cells. This uneven pressure can lead to inaccurate or failed weight capture by the system.", "NIDO"),
    ("LOLR", "Length Over Limit Rejection", "Parcel length exceeds the maximum limit supported by the profiler.", "Client"),
    ("BOLR", "Breadth Over Limit Rejection", "Parcel width exceeds the maximum limit supported by the profiler.", "Client"),
    ("HOLR", "Height Over Limit Rejection", "Parcel height exceeds the maximum limit supported by the profiler.", "Client"),
    ("WOLR", "Weight Over Limit Rejection", "The parcel's weight is too high for the system to recognize it as a valid item", "Client"),
    ("LULR", "Length Under Limit Rejection", "Parcel length is below the machine’s minimum measurable limit", "Client"),
    ("BULR", "Breadth Under Limit Rejection", "Parcel width is below the machine’s minimum measurable limit", "Client"),
    ("HULR", "Height Under Limit Rejection", "Parcel height is below the machine’s minimum measurable limit", "Client"),
    ("WULR", "Weight Under Limit Rejection", "The parcel's weight is too low for the system to recognize it as a valid item", "Client"),
    ("NWRR", "Negative Weight Received Rejection", "Residual weight from the previous shipment was not reset to zero before new induction, leading to negative weight capture", "Client"),
    ("ZLRR", "Zero Length Received Rejection", "Usually when the length of the shipment is below than tha threshold limit of the dimensioning camera, then it captures the length of the shipment is 0.", "Client"),
    ("ZBRR", "Zero Breadth Received Rejection", "Usually when the breadth of the shipment is below than tha threshold limit of the dimensioning camera, then it captures the breadth of the shipment is 0.", "Client"),
    ("ZHRR", "Zero Height Received Rejection", "Usually when the height of the shipment is below than tha threshold limit of the dimensioning camera, then it captures the height of the shipment is 0.", "Client"),
    ("ZWRR", "Zero Weight Received Rejection", "Usually when the weight of the shipment is below than tha threshold limit of the dimensioning camera, then it captures the weight of the shipment is 0.", "Client"),
    ("NLRR", "Negative Length Received Rejection", "When the negative length of the shipment is recorded", "NIDO"),
    ("NBRR", "Negative Width Received Rejection", "When the negative width of the shipment is recorded", "NIDO"),
    ("NHRR", "Negative Height Received Rejection", "When the negative height of the shipment is recorded", "NIDO"),
    ("SLRR", "Same Length Received Rejection", "When the camera captures the consecutive (Defined Number) of the shipments length as same value", "Client"),
    ("SBRR", "Same Breadth Received Rejection", "When the camera captures the consecutive (Defined Number) of the shipments breadth as same value", "Client"),
    ("SHRR", "Same Height Received Rejection", "When the camera captures the consecutive (Defined Number) of the shipments height as same value", "Client"),
    ("SWRR", "Same Weight Received Rejection", "When the camera captures the consecutive (Defined Number) of the shipments weight as same value", "Client"),
    ("CMMR", "Cutoff Mis Match Rejection", "When the cut off limit reaches into the sorting chute/bin (Can be Quantity based, Weight Based, Volume Based)", "Client"),
    ("SBCR", "Same Barcode Rejection", "When the camera captures the consecutive (Defined Number) of the shipments height as same value", "Client"),
    ("MPCR", "Multiple Shipment Count Rejection", "When multiple shipments are inducted at the same time on the infeed cariage", "Client"),
    ("DUPR", "Duplicate Parcel Rejection", "If a barcode is scanned more than once and the corresponding shipment is already part of a opened bag ( Shipment is Rejected in this case)", "Client"),
    ("APBR", "Already Part of Bag Rejection", "If a barcode is scanned more than once and the shipment is already part of a closed bag.", "Client"),
    ("CFGR", "Configuration Rejection", "If system is unable to find the data required to run the sorting logic for the scanned shipment.", "Client"),
    ("BGFR", "Bag Full Rejection", "If bag of a particular chute is already full and during this time the shipment for this particular chute/bag is scanned.", "Client"),
    ("SPLR", "Shipment lost Rejection", "Shipment is already sorted but Confirmation is not received to system from PLC side.", "NIDO"),
    ("SPFR", "Shipment Flush Rejection", "At the time of starting of machine, machine starts to flush the previous shipments kept on the machine", "NIDO"),
    ("CIPR", "Close Bag In Process Rejection", "In case, a bag of a particular chute is in closing process and during this time the shipment of this chute is processed.", "Client"),
]


class RejectionCodeError(ValueError):
    """The code cannot be saved; the message is shown to the user."""


class DuplicateCode(RejectionCodeError):
    pass


def to_model(doc: dict) -> RejectionCode:
    return RejectionCode(id=str(doc["_id"]), **doc)


def _taken(c: RejectionCodeIn) -> DuplicateCode:
    return DuplicateCode(f"Rejection code {c.code} already exists.")


def _seed(site: str) -> None:
    now = datetime.now(timezone.utc)
    docs = [{"code": c, "name": n, "reasons": r, "scope": s, "created_at": now, "updated_at": now} for c, n, r, s in DEFAULTS]
    try:
        repo.insert_many(site, docs)
    except BulkWriteError:
        pass  # another request seeded them first


def _docs(site: str) -> list[dict]:
    # Load the standard list once per site. Only once: a site that deleted every code stays empty.
    # A site that already has codes (saved before this mark existed) is simply marked.
    if not repo.seeded(site):
        if repo.is_empty(site):
            _seed(site)
        repo.mark_seeded(site)
    return repo.find(site)


def list_codes(site: str) -> RejectionCodeList:
    return RejectionCodeList(site=site, sites=list(SITES),
                             codes=[to_model(d) for d in sorted(_docs(site), key=lambda d: d["code"])])


def codes_by_scope(site: str) -> dict[str, list[str]]:
    """{"Client": [...codes], "NIDO": [...codes]} of one site, for splitting rejections in the MAS reports."""
    scopes: dict[str, list[str]] = {"Client": [], "NIDO": []}
    for d in _docs(site):
        scopes[d["scope"]].append(d["code"])
    return scopes


def add(site: str, c: RejectionCodeIn) -> RejectionCode:
    now = datetime.now(timezone.utc)
    try:
        return to_model(repo.insert(site, {**c.model_dump(), "created_at": now, "updated_at": now}))
    except DuplicateKeyError as err:
        raise _taken(c) from err


def update(site: str, code_id: str, c: RejectionCodeIn) -> RejectionCode | None:
    try:
        doc = repo.update(site, code_id, {**c.model_dump(), "updated_at": datetime.now(timezone.utc)})
    except DuplicateKeyError as err:
        raise _taken(c) from err
    return to_model(doc) if doc else None


def set_scope(site: str, code_id: str, scope: Scope) -> RejectionCode | None:
    doc = repo.update(site, code_id, {"scope": scope, "updated_at": datetime.now(timezone.utc)})
    return to_model(doc) if doc else None


def delete(site: str, code_id: str) -> bool:
    return repo.delete(site, code_id)