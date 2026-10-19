"""Site settings: shifts and machine targets per hour (with a site default). Day and shift targets follow from them."""
from dataclasses import dataclass, field

from pymongo.collection import Collection

from app.core.config import DEFAULT_TARGET, SITES
from app.core.utils import clean
from app.domain.shifts import DEFAULT_SHIFTS, ShiftCalendar, shift_hours, shift_label
from app.repositories import machine_config as repo
from app.repositories import scans
from app.schemas.machine_config import MachineConfig, MachineConfigUpdate, MachineTarget, ShiftInfo, ShiftsUpdate


@dataclass
class SiteTargets:
    default_target: int = DEFAULT_TARGET
    hourly: dict[str, int] = field(default_factory=dict)
    calendar: ShiftCalendar = field(default_factory=ShiftCalendar)

    def hour_target(self, machine: str) -> int:
        return self.hourly.get(machine, self.default_target)


def _parse(doc: dict) -> SiteTargets:
    machines = doc.get("machines", [])
    return SiteTargets(
        default_target=doc.get("default_target", DEFAULT_TARGET),
        hourly={m["name"]: m["target"] for m in machines if m.get("target") is not None},
        calendar=ShiftCalendar(doc.get("shifts") or DEFAULT_SHIFTS),
    )


def targets(site: str) -> SiteTargets:
    """Targets and shifts as currently saved for the site."""
    return _parse(repo.get(site) or {})


def site_machines(coll: Collection, t: SiteTargets) -> list[str]:
    """Machines available at the site: those seen in scans plus any saved ones that no longer appear."""
    return sorted({n for n in map(clean, scans.machine_names(coll)) if n} | t.hourly.keys())


def get_config(site: str, coll: Collection) -> MachineConfig:
    doc = repo.get(site) or {}
    t = _parse(doc)
    names = site_machines(coll, t)
    return MachineConfig(site=site, sites=list(SITES), default_target=t.default_target,
                         shift_hours_per_day=t.calendar.hours_per_day(),
                         shifts=[ShiftInfo(**s, label=shift_label(s), hours=len(shift_hours(s))) for s in t.calendar.shifts],
                         machines=[MachineTarget(name=n, target=t.hourly.get(n)) for n in names],
                         updated_at=doc.get("updated_at"))


def save_config(site: str, update: MachineConfigUpdate) -> None:
    repo.save(site, [m.model_dump() for m in update.machines if m.target is not None],
              default_target=update.default_target)


def save_shifts(site: str, update: ShiftsUpdate) -> None:
    repo.save_shifts(site, [s.model_dump() for s in update.shifts])
