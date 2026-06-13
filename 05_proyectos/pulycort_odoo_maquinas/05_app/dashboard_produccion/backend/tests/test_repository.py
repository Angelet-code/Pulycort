from __future__ import annotations

import unittest
from datetime import datetime

from app.models import ProductionRecord
from app.repository import RecordFilters, _build_machine_query, _row_to_record, filter_records


MACHINE_CONFIG = {
    "machine_id": "telar_1",
    "machine_name": "Telar 1",
    "unit": "M3",
    "table": "registro_telar_1",
    "timestamp": {"date": "fecha", "time": "hora"},
    "columns": {
        "operator_1": "operario_1",
        "lot_id": "n_bloque",
        "quantity": "n_tablas",
        "order_committed_date": "pedido_fecha_compromiso",
        "consumption_kwh_total": "consumo",
    },
}


class BuildMachineQueryTests(unittest.TestCase):
    def test_sqlserver_uses_top(self) -> None:
        sql = _build_machine_query(MACHINE_CONFIG, "mssql", 100)
        self.assertTrue(sql.startswith("SELECT TOP 100 "))
        self.assertIn("FROM registro_telar_1", sql)
        self.assertIn("ORDER BY fecha DESC, hora DESC", sql)

    def test_other_dialects_use_limit(self) -> None:
        sql = _build_machine_query(MACHINE_CONFIG, "postgresql", 50)
        self.assertIn("LIMIT 50", sql)
        self.assertNotIn("TOP", sql)

    def test_accepts_schema_qualified_table(self) -> None:
        config = {**MACHINE_CONFIG, "table": "dbo.registro_telar_1"}
        sql = _build_machine_query(config, "mssql", 10)
        self.assertIn("FROM dbo.registro_telar_1", sql)

    def test_rejects_unsafe_column_names(self) -> None:
        config = {
            **MACHINE_CONFIG,
            "columns": {**MACHINE_CONFIG["columns"], "lot_id": "n_bloque; DROP TABLE x"},
        }
        with self.assertRaises(ValueError):
            _build_machine_query(config, "mssql", 10)

    def test_rejects_unsafe_table_name(self) -> None:
        config = {**MACHINE_CONFIG, "table": "registro_telar_1; DROP TABLE x"}
        with self.assertRaises(ValueError):
            _build_machine_query(config, "mssql", 10)


class RowToRecordTests(unittest.TestCase):
    def test_parses_row_with_compact_timestamp(self) -> None:
        row = {
            "fecha": "20260609",
            "hora": 1601,
            "operario_1": "88",
            "n_bloque": "CM-48120",
            "n_tablas": 12,
            "pedido_fecha_compromiso": "2026-06-20T17:00:00",
            "consumo": 10.5,
        }
        parsed = _row_to_record(MACHINE_CONFIG, row, 3)

        self.assertEqual(parsed.timestamp, datetime(2026, 6, 9, 16, 1))
        self.assertEqual(parsed.operators, ["88"])
        self.assertEqual(parsed.lot_id, "CM-48120")
        self.assertEqual(parsed.quantity, 12.0)
        self.assertEqual(parsed.unit, "M3")
        self.assertEqual(parsed.order_committed_date, datetime(2026, 6, 20, 17, 0))
        self.assertEqual(parsed.consumption_kwh_total, 10.5)
        self.assertEqual(parsed.machine_id, "telar_1")
        self.assertTrue(parsed.id.endswith("-3"))

    def test_rows_in_same_minute_get_unique_ids(self) -> None:
        row = {"fecha": "20260609", "hora": 1601, "n_bloque": "CM-48120"}
        first = _row_to_record(MACHINE_CONFIG, row, 0)
        second = _row_to_record(MACHINE_CONFIG, row, 1)
        self.assertNotEqual(first.id, second.id)

    def test_missing_optional_columns_default_to_none(self) -> None:
        row = {"fecha": "20260609", "hora": 800}
        parsed = _row_to_record(MACHINE_CONFIG, row)
        self.assertIsNone(parsed.lot_id)
        self.assertIsNone(parsed.order_committed_date)
        self.assertEqual(parsed.operators, [])
        self.assertEqual(parsed.quantity, 0)


def make_record(record_id: str, minute: int, lot_id: str | None = None, pallet_out: str | None = None) -> ProductionRecord:
    return ProductionRecord(
        id=record_id,
        machine_id="telar_1",
        machine_name="Telar 1",
        timestamp=datetime(2026, 6, 10, 8, minute),
        lot_id=lot_id,
        pallet_out=pallet_out,
        quantity=1,
        unit="M3",
    )


class FilterRecordsTests(unittest.TestCase):
    def test_window_and_limit(self) -> None:
        records = [make_record("a", 0), make_record("b", 20), make_record("c", 40)]
        filtered = filter_records(
            records,
            RecordFilters(window_start=datetime(2026, 6, 10, 8, 10), limit=1),
        )
        self.assertEqual([item.id for item in filtered], ["c"])

    def test_lot_filter_matches_substring(self) -> None:
        records = [make_record("a", 0, lot_id="CM-48120"), make_record("b", 5, lot_id="NM-39014")]
        filtered = filter_records(records, RecordFilters(lot_id="cm-48"))
        self.assertEqual([item.id for item in filtered], ["a"])

    def test_pallet_filter_checks_in_and_out(self) -> None:
        records = [make_record("a", 0, pallet_out="AC1048-60-001"), make_record("b", 5)]
        filtered = filter_records(records, RecordFilters(pallet="AC1048"))
        self.assertEqual([item.id for item in filtered], ["a"])


if __name__ == "__main__":
    unittest.main()
