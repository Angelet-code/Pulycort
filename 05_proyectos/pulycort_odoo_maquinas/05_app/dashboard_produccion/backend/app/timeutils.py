from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta


@dataclass(frozen=True)
class Shift:
    name: str
    start: time
    end: time


def parse_compact_date_time(date_value: object, time_value: object, *, today: date | None = None) -> datetime:
    """Parse Indasel-style compact date/hour values such as 906 + 1601."""
    anchor = today or datetime.now().date()
    raw_date = str(date_value).strip().replace(".", "").replace("/", "")
    raw_time = str(time_value).strip().replace(".", "").replace(":", "")

    if not raw_date:
        parsed_date = anchor
    elif len(raw_date) in (3, 4):
        padded = raw_date.zfill(4)
        day = int(padded[:2])
        month = int(padded[2:])
        parsed_date = date(anchor.year, month, day)
    elif len(raw_date) == 6:
        parsed_date = date(2000 + int(raw_date[:2]), int(raw_date[2:4]), int(raw_date[4:6]))
    elif len(raw_date) == 8:
        parsed_date = date(int(raw_date[:4]), int(raw_date[4:6]), int(raw_date[6:8]))
    else:
        raise ValueError(f"Unsupported compact date: {date_value!r}")

    padded_time = raw_time.zfill(4) if raw_time else "0000"
    hour = int(padded_time[:2])
    minute = int(padded_time[2:4])
    return datetime.combine(parsed_date, time(hour=hour, minute=minute))


def parse_shift_schedule(value: str) -> list[Shift]:
    shifts: list[Shift] = []
    if not value.strip():
        return shifts
    for part in value.split(","):
        if not part.strip():
            continue
        name, hours = part.split("=", 1)
        start_s, end_s = hours.split("-", 1)
        shifts.append(Shift(name=name.strip(), start=_parse_time(start_s), end=_parse_time(end_s)))
    return shifts


def resolve_window(window: str, now: datetime, shift_schedule: str) -> tuple[datetime, datetime]:
    start_of_day = datetime.combine(now.date(), time.min)
    if window != "shift":
        return start_of_day, now

    for shift in parse_shift_schedule(shift_schedule):
        start_dt = datetime.combine(now.date(), shift.start)
        end_dt = datetime.combine(now.date(), shift.end)
        if shift.end <= shift.start:
            end_dt += timedelta(days=1)
            if now.time() < shift.end:
                start_dt -= timedelta(days=1)
                end_dt -= timedelta(days=1)
        if start_dt <= now <= end_dt:
            return start_dt, now
    return start_of_day, now


def _parse_time(value: str) -> time:
    hour_s, minute_s = value.strip().split(":", 1)
    return time(hour=int(hour_s), minute=int(minute_s))

