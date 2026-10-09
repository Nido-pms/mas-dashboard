import pytest
from pydantic import ValidationError

from app.schemas.rejection_codes import RejectionCodeIn
from app.services.rejection_codes import DEFAULTS


def code(**kw):
    return RejectionCodeIn(**{"code": " sp fr ", "name": " Shipment  Flush Rejection", "reasons": " a \n b ", "scope": "NIDO",
                              **kw})


def test_code_fields_are_cleaned():
    c = code()
    assert (c.code, c.name, c.reasons) == ("SPFR", "Shipment Flush Rejection", "a b")


def test_code_must_be_valid():
    for kw in ({"code": "  "}, {"name": ""}, {"scope": "Machine"}, {"code": "TOOLONGCODE1"}):
        with pytest.raises(ValidationError):
            code(**kw)


def test_defaults_are_unique_and_valid():
    assert len({c for c, *_ in DEFAULTS}) == len(DEFAULTS)
    for c, n, r, s in DEFAULTS:
        RejectionCodeIn(code=c, name=n, reasons=r, scope=s)
