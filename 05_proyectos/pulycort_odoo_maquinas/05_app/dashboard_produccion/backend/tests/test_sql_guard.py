from __future__ import annotations

import unittest

from app.sql_guard import assert_safe_identifier, assert_select_only


class SqlGuardTests(unittest.TestCase):
    def test_accepts_simple_identifiers(self) -> None:
        self.assertEqual(assert_safe_identifier("registro_telar_1"), "registro_telar_1")

    def test_rejects_identifier_injection(self) -> None:
        with self.assertRaises(ValueError):
            assert_safe_identifier("registro; DROP TABLE partes")

    def test_accepts_select_query(self) -> None:
        self.assertEqual(assert_select_only("SELECT a FROM tabla"), "SELECT a FROM tabla")

    def test_rejects_mutating_query(self) -> None:
        with self.assertRaises(ValueError):
            assert_select_only("DELETE FROM tabla")


if __name__ == "__main__":
    unittest.main()

