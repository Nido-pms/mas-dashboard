"""Where each site's data lives: its project's own MongoDB database (SITES[site]["database"]).

    <project database>      e.g. Daily_Report_of_CJ_Darcel_(Bhiwandi)
        infeed              scans, uploaded from the daily Excel reports
        alarm, calibration  uploaded reports
        machine_config, employees, attendance_sheets, rejection_codes   written by this dashboard
"""
from pymongo.database import Database

from app.core.config import SITES
from app.core.database import client

INFEED = "infeed"


def site_db(site: str) -> Database:
    """The database of a site's project. `site` must be a key of SITES."""
    return client[SITES[site]["database"]]
