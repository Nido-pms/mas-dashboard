from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pymongo.errors import PyMongoError

from app.api.router import api_router
from app.core.config import SITES, settings
from app.core.projects import INFEED, site_db


@asynccontextmanager
async def lifespan(_app):
    for site in SITES:
        db = site_db(site)
        try:
            n = db[INFEED].estimated_document_count()
        except PyMongoError:
            n = "ERROR"
        print(f"{site:<10} {db.name}.{INFEED:<20} docs: {n}")
    yield


async def mongo_error(_req: Request, _exc: PyMongoError):
    return JSONResponse(status_code=503, content={"detail": "Database unavailable. Check MongoDB and try again."})


def mount_frontend(app: FastAPI, dist: Path):
    """Serve the built React app (frontend/dist). In development, Vite serves it instead."""
    index = dist / "index.html"
    if not index.exists():
        print(f"Frontend build not found at {dist} - run `npm run build` in frontend/, or use `npm run dev`.")
        return
    root = dist.resolve()
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        f = (dist / path).resolve()
        if path and f.is_file() and f.is_relative_to(root):
            return FileResponse(f)
        return FileResponse(index)  # client-side routes


def create_app() -> FastAPI:
    app = FastAPI(title="Central Dashboard", version="2.0.0", lifespan=lifespan)
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_exception_handler(PyMongoError, mongo_error)
    app.include_router(api_router)
    mount_frontend(app, settings.frontend_dist)
    return app


app = create_app()
