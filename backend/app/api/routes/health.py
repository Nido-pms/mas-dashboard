from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError

from app.core.config import SITES
from app.core.database import client
from app.core.projects import INFEED, site_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    try:
        client.admin.command("ping")
        databases = set(client.list_database_names())
        return {"status": "ok",
                "sites": {s: {"database": site_db(s).name, "exists": site_db(s).name in databases,
                              "documents": site_db(s)[INFEED].estimated_document_count()}
                          for s in SITES}}
    except PyMongoError as e:
        return JSONResponse(status_code=503, content={"status": "error", "error": str(e)})
