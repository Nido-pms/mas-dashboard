# Central Dashboard

Operations dashboards for NIDO sites: a FastAPI backend over MongoDB with a React (TypeScript) frontend in the NIDO WORKZ (AdminLTE 3) theme.

## Structure

```
backend/                      FastAPI
  app/
    main.py                   app factory, error handlers, serves the built frontend
    core/config.py            settings (.env), SITES, targets
    core/database.py          MongoDB client
    domain/shifts.py          shift calendar (1-3 shifts per site, saved with machine config; overnight dating)
    repositories/scans.py     MongoDB aggregations
    services/mas.py           MAS report logic (filters, billing tables)
    schemas/mas.py            response models
    api/router.py             mounts all routes under /api
    api/routes/*.py           one module per feature
  tests/                      pytest
frontend/                     React + Vite + TypeScript
  public/theme/               NIDO WORKZ CSS, fonts, logos
  src/
    pages.tsx                 sidebar sections and pages (routes + links)
    layouts/                  AdminLTE shell (navbar, sidebar, footer)
    components/               shared UI: Card, InfoBox, ReportTable, ...
    features/mas/             MAS dashboard, shift-wise and hour-wise pages (shared filters via MasLayout)
    features/machine-config/  per-site configuration page: shifts, machine targets
    features/employee-master/ employees (CRUD), attendance sheets per site / date / shift, attendance summary
    api/client.ts             fetch wrapper and error messages
    hooks/, utils/            shared hooks and helpers
```

## Setup

Requires Python 3.12+ and Node.js 20+.

```powershell
# backend
cd backend
pip install -r requirements-dev.txt
copy .env.example .env        # optional; otherwise ../dashboard/.env is used

# frontend
cd ..\frontend
npm install
```

## Development

Run both, then open http://localhost:5173 (Vite forwards `/api` to the backend).

```powershell
cd backend;  uvicorn app.main:app --reload --port 8000
cd frontend; npm run dev
```

## Production

```powershell
cd frontend; npm run build
cd ..\backend; uvicorn app.main:app --host 0.0.0.0 --port 8000
```

FastAPI serves the built frontend from `frontend/dist` on the same port as the API. Restart the backend after rebuilding the frontend.

## Tests and checks

```powershell
cd backend;  python -m pytest
cd frontend; npm run typecheck
```

## Adding things

- **A site:** add it to `SITES` in `backend/app/core/config.py`.
- **A dashboard page:**
  1. Backend: add `services/<name>.py`, `schemas/<name>.py` and `api/routes/<name>.py`, then include the router in `api/router.py`.
  2. Frontend: add `src/features/<name>/` with its page, then register it in a section in `src/pages.tsx`.
     Pages in one section can share state through the section's `layout` (see `features/mas/MasLayout.tsx`).
