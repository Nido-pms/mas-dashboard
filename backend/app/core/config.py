"""Application settings (from environment / .env) and site configuration."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    # Later files win: backend/.env overrides the project .env, which overrides the Meesho dashboard's settings.
    model_config = SettingsConfigDict(
        env_file=(PROJECT_DIR.parent / "dashboard" / ".env", PROJECT_DIR / ".env", BACKEND_DIR / ".env"),
        extra="ignore",
    )

    mongo_uri: str = "mongodb://localhost:27017"
    # Collections this dashboard writes, inside each site's project database (see app/core/projects.py)
    machine_config_collection: str = "machine_config"
    employees_collection: str = "employees"
    attendance_collection: str = "attendance_sheets"
    rejection_codes_collection: str = "rejection_codes"
    alarm_config_collection: str = "alarm_config"
    dashboard_meta_collection: str = "dashboard_meta"  # small flags, e.g. "standard rejection codes loaded"
    frontend_dist: Path = PROJECT_DIR / "frontend" / "dist"


settings = Settings()

# Site name -> the project's MongoDB database, which holds all of the site's data and settings
# (see app/core/projects.py). Add a site here to show it in the dashboard.
SITES = {
    "Bhiwandi": {"database": "Daily_Report_of_CJ_Darcel_(Bhiwandi)"},
}
DEFAULT_SITE = next(iter(SITES))

DEFAULT_TARGET = 850        # parcels per machine per hour, until set on the Machine Configuration page
DEFAULT_CALIBRATION = 0     # calibration parcels per shift
TS = "Inscan Timestamp"     # ISO string, e.g. 2026-10-07T02:15:22.348
