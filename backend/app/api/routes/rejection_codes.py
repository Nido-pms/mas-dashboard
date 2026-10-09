from fastapi import APIRouter, HTTPException

from app.core.config import DEFAULT_SITE, SITES
from app.schemas.rejection_codes import RejectionCode, RejectionCodeIn, RejectionCodeList, ScopeIn
from app.services import rejection_codes

router = APIRouter(prefix="/rejection-codes", tags=["rejection-codes"])

NOT_FOUND = "Rejection code not found; it may have been deleted."


def _site(site: str) -> str:
    if site not in SITES:
        raise HTTPException(400, f"Unknown site: {site}")
    return site


def _found(saved: RejectionCode | None) -> RejectionCode:
    if saved is None:
        raise HTTPException(404, NOT_FOUND)
    return saved


def _save(fn, *args):
    try:
        return fn(*args)
    except rejection_codes.DuplicateCode as e:
        raise HTTPException(409, str(e)) from e


@router.get("", response_model=RejectionCodeList)
def list_codes(site: str = DEFAULT_SITE):
    """The site's rejection code definitions, sorted by code. The standard list is loaded the first time."""
    return rejection_codes.list_codes(_site(site))


@router.post("", response_model=RejectionCode, status_code=201)
def add_code(code: RejectionCodeIn, site: str = DEFAULT_SITE):
    return _save(rejection_codes.add, _site(site), code)


@router.put("/{code_id}", response_model=RejectionCode)
def update_code(code_id: str, update: RejectionCodeIn, site: str = DEFAULT_SITE):
    return _found(_save(rejection_codes.update, _site(site), code_id, update))


@router.patch("/{code_id}/scope", response_model=RejectionCode)
def set_scope(code_id: str, update: ScopeIn, site: str = DEFAULT_SITE):
    """Change only who the rejection is attributed to (Client or NIDO)."""
    return _found(rejection_codes.set_scope(_site(site), code_id, update.scope))


@router.delete("/{code_id}")
def delete_code(code_id: str, site: str = DEFAULT_SITE):
    if not rejection_codes.delete(_site(site), code_id):
        raise HTTPException(404, NOT_FOUND)
    return {"deleted": code_id}
