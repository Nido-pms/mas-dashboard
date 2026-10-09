from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

from app.schemas.employees import Text

Scope = Literal["Client", "NIDO"]  # who the rejection is attributed to


def _code(s: str) -> str:
    s = "".join(s.split()).upper()
    if not s:
        raise ValueError("cannot be empty")
    return s


Code = Annotated[str, Field(max_length=10), AfterValidator(_code)]
Reasons = Annotated[str, Field(max_length=500), AfterValidator(lambda s: " ".join(s.split()))]


class RejectionCodeIn(BaseModel):
    code: Code  # e.g. "DBAR"; stored upper-case, unique
    name: Text
    reasons: Reasons = ""
    scope: Scope


class ScopeIn(BaseModel):
    scope: Scope


class RejectionCode(RejectionCodeIn):
    id: str
    created_at: datetime
    updated_at: datetime


class RejectionCodeList(BaseModel):
    site: str          # each site has its own list
    sites: list[str]
    codes: list[RejectionCode]
