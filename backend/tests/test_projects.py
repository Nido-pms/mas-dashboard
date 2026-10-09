import pytest

from app.core.config import SITES
from app.core.projects import site_db


@pytest.mark.parametrize("site", SITES)
def test_each_site_names_a_valid_database(site):
    """Database names come straight from SITES; MongoDB rejects these characters and names of 64+ bytes."""
    name = SITES[site]["database"]
    assert name and not set(name) & set('/\\. "$*<>:|?\x00') and len(name.encode()) < 64
    assert site_db(site).name == name


def test_bhiwandi_uses_its_project_database():
    assert SITES["Bhiwandi"]["database"] == "Daily_Report_of_CJ_Darcel_(Bhiwandi)"
