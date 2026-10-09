from typing import Annotated

from fastapi import APIRouter, Depends
from pymongo.collection import Collection

from app.api.deps import site_collection
from app.core.config import DEFAULT_SITE
from app.schemas.machine_config import MachineConfig, MachineConfigUpdate, ShiftsUpdate
from app.services import machine_config

router = APIRouter(prefix="/machine-config", tags=["machine config"])
SiteCollection = Annotated[Collection, Depends(site_collection)]


@router.get("", response_model=MachineConfig)
def get_config(coll: SiteCollection, site: str = DEFAULT_SITE):
    return machine_config.get_config(site, coll)


@router.put("", response_model=MachineConfig)
def update_config(update: MachineConfigUpdate, coll: SiteCollection, site: str = DEFAULT_SITE):
    """Save the site default and per-machine targets; machines without a target use the default."""
    machine_config.save_config(site, update)
    return machine_config.get_config(site, coll)


@router.put("/shifts", response_model=MachineConfig)
def update_shifts(update: ShiftsUpdate, coll: SiteCollection, site: str = DEFAULT_SITE):
    """Replace the site's shifts (1 to 3, whole hours, no overlaps); every MAS report uses them from then on."""
    machine_config.save_shifts(site, update)
    return machine_config.get_config(site, coll)
