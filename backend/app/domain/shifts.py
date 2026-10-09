"""Shift calendar: which shift, and which shift date, an hour of the day belongs to."""
from collections.abc import Iterable
from datetime import date, timedelta

# Shifts in whole hours [start, end). A shift that crosses midnight is dated by the day it starts.
# Each site can save its own shifts; these apply until it does.
DEFAULT_SHIFTS = [
    {"name": "Day", "start": 8, "end": 17},
    {"name": "Night", "start": 21, "end": 5},
]
MAX_SHIFTS = 3
OUTSIDE = "Outside shift"


def crosses_midnight(s):
    return s["start"] > s["end"]


def shift_hours(s):
    return [(s["start"] + i) % 24 for i in range((s["end"] - s["start"]) % 24)]


def shift_label(s):
    return f"{s['start']:02d}:00 - {s['end']:02d}:00"


def display_name(name: str) -> str:
    """"Day" -> "Day shift"; names that already end in "shift" are kept as they are."""
    return name if name.lower().endswith("shift") else f"{name} shift"


def sort_hour(s, hour):
    """Order hours inside a shift date: post-midnight hours of an overnight shift come after 23:00."""
    return hour + 24 if s and crosses_midnight(s) and hour < s["end"] else hour


def hour_label(h):
    return f"{h:02d}:00 - {(h + 1) % 24:02d}:00"


class ShiftCalendar:
    """One site's shifts."""

    def __init__(self, shifts: Iterable[dict] = DEFAULT_SHIFTS):
        self.shifts = [{"name": s["name"], "start": s["start"], "end": s["end"]} for s in shifts]
        self.by_name = {s["name"]: s for s in self.shifts}
        self.order = [*self.by_name, OUTSIDE]

    def shift_of(self, day: date, hour: int):
        """Map a calendar day + hour to (shift date, shift or None)."""
        for s in self.shifts:
            if hour in shift_hours(s):
                return (day - timedelta(days=1) if crosses_midnight(s) and hour < s["end"] else day), s
        return day, None

    def hours_per_day(self):
        """Working hours in one day across all shifts (Day 9 h + Night 8 h = 17)."""
        return sum(len(shift_hours(s)) for s in self.shifts)

    def last_overnight_hour(self):
        """Hour (next calendar day) at which the latest overnight shift ends; 0 if none cross midnight."""
        return max((s["end"] for s in self.shifts if crosses_midnight(s)), default=0)
