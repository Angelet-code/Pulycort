from __future__ import annotations

import unittest
from datetime import date, datetime

from app.timeutils import is_within_working_hours, parse_compact_date_time, parse_shift_schedule, resolve_window


class TimeUtilsTests(unittest.TestCase):
    def test_parse_indasel_date_time(self) -> None:
        parsed = parse_compact_date_time(906, 1601, today=date(2026, 6, 10))
        self.assertEqual(parsed, datetime(2026, 6, 9, 16, 1))

    def test_compact_date_rolls_back_year_at_new_year(self) -> None:
        # Un parte del 31/12 leido el 01/01 no puede ser del ano nuevo.
        parsed = parse_compact_date_time(3112, 2330, today=date(2027, 1, 2))
        self.assertEqual(parsed, datetime(2026, 12, 31, 23, 30))

    def test_compact_time_with_seconds(self) -> None:
        parsed = parse_compact_date_time(906, 160159, today=date(2026, 6, 10))
        self.assertEqual(parsed, datetime(2026, 6, 9, 16, 1, 59))

    def test_working_hours_detection(self) -> None:
        schedule = "manana=06:00-14:00,tarde=14:00-22:00"
        self.assertTrue(is_within_working_hours(schedule, datetime(2026, 6, 10, 10, 0)))
        self.assertFalse(is_within_working_hours(schedule, datetime(2026, 6, 10, 23, 0)))
        self.assertIsNone(is_within_working_hours("", datetime(2026, 6, 10, 10, 0)))

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

