from pymongo import MongoClient

from app.core.config import settings

# tz_aware: datetimes come back as UTC-aware, so the API sends "...+00:00" and browsers show local time.
# Each site has its own database; use app.core.projects.site_db(site).
client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=5000, tz_aware=True)
