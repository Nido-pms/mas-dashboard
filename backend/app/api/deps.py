from fastapi import HTTPException
from pymongo.collection import Collection

from app.core.config import DEFAULT_SITE, SITES
from app.core.projects import INFEED, site_db


def site_collection(site: str = DEFAULT_SITE) -> Collection:
    """Resolve the `site` query parameter to its scan collection."""
    if site not in SITES:
        raise HTTPException(400, f"Unknown site: {site}")
    return site_db(site)[INFEED]
