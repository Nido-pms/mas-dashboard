"""Shift activation: which shifts each machine runs, by weekly pattern and by date.

Every shift is active unless switched off. The weekly pattern switches a shift off on a weekday (for all machines or
one machine); a change for a date overrides the pattern, switching on or off. Most specific wins: a date change for
the machine, then a date change for all machines, then the weekly pattern for the machine or for all machines.
"""
from dataclasses import dataclass, field
from datetime import date

from app.domain.shifts import ShiftCalendar, shift_hours

ALL = "*"   # "all machines" in a rule
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]   # index = date.weekday()


@dataclass
class ShiftSchedule:
    weekly_off: set[tuple[int, str, str]] = field(default_factory=set)        # (weekday, shift, machine or ALL)
    overrides: dict[tuple[date, str, str], bool] = field(default_factory=dict)  # (date, shift, machine or ALL) -> active

    def is_active(self, day: date, shift: str, machine: str) -> bool:
        for key in ((day, shift, machine), (day, shift, ALL)):
            if key in self.overrides:
                return self.overrides[key]
        wd = day.weekday()
        return (wd, shift, machine) not in self.weekly_off and (wd, shift, ALL) not in self.weekly_off

    def active_hours(self, calendar: ShiftCalendar, day: date, machine: str) -> int:
        """Hours of the machine's shifts that run on the shift date `day`."""
        return sum(len(shift_hours(s)) for s in calendar.shifts if self.is_active(day, s["name"], machine))


ALWAYS = ShiftSchedule()   # nothing switched off: every shift of every machine counts
