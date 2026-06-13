from __future__ import annotations

import unittest

from app.sql_guard import assert_safe_identifier, assert_safe_table_name, assert_select_only


class SqlGuardTests(unittest.TestCase):
    def test_accepts_simple_identifiers(self) -> None:
        self.assertEqual(assert_safe_identifier("registro_telar_1"), "registro_telar_1")

    def test_rejects_identifier_injection(self) -> None:
        with self.assertRaises(ValueError):
            assert_safe_identifier("registro; DROP TABLE partes")

    def test_accepts_schema_qualified_table(self) -> None:
        self.assertEqual(assert_safe_table_name("dbo.registro_telar_1"), "dbo.registro_telar_1")

    def test_rejects_unsafe_table_names(self) -> None:
        for table in ["dbo.registro; DROP", "a.b.c", "registro telar"]:
            with self.assertRaises(ValueError):
                assert_safe_table_name(table)

    def test_columns_do_not_accept_schema_prefix(self) -> None:
        with self.assertRaises(ValueError):
            assert_safe_identifier("dbo.columna")

    def test_accepts_select_query(self) -> None:
        self.assertEqual(assert_select_only("SELECT a FROM tabla"), "SELECT a FROM tabla")

    def test_rejects_mutating_query(self) -> None:
        with self.assertRaises(ValueError):
            assert_select_only("DELETE FROM tabla")


if __name__ == "__main__":
    unittest.main()

