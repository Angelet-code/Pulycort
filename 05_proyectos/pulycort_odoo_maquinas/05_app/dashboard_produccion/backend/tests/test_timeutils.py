from __future__ import annotations

import unittest
from datetime import date, datetime

from app.timeutils import parse_compact_date_time, parse_shift_schedule, resolve_window


class TimeUtilsTests(unittest.TestCase):
    def test_parse_indasel_date_time(self) -> None:
        parsed = parse_compact_date_time(906, 1601, today=date(2026, 6, 10))
        self.assertEqual(parsed, datetime(2026, 6, 9, 16, 1))

    def test_parse_shift_schedule(self) -> None:
        shifts = parse_shift_schedule("manana=06:00-14:00,tarde=14:00-22:00")
        self.assertEqual(shifts[0].name, "manana")
        self.assertEqual(shifts[1].end.hour, 22)

    def test_resolve_current_shift(self) -> None:
        start, end = resolve_window(
            "shift",
            datetime(2026, 6, 10, 15, 30),
            "manana=06:00-14:00,tarde=14:00-22:00,noche=22:00-06:00",
        )
        self.assertEqual(start, datetime(2026, 6, 10, 14, 0))
        self.assertEqual(end, datetime(2026, 6, 10, 15, 30))

    def test_resolve_night_shift_after_midnight(self) -> None:
        start, end = resolve_window(
            "shift",
            datetime(2026, 6, 10, 2, 30),
            "manana=06:00-14:00,tarde=14:00-22:00,noche=22:00-06:00",
        )
        self.assertEqual(start, datetime(2026, 6, 9, 22, 0))
        self.assertEqual(end, datetime(2026, 6, 10, 2, 30))


if __name__ == "__main__":
    unittest.main()

