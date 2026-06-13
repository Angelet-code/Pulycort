from __future__ import annotations

import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from app.config import Settings
from app.models import ProductionOrderPlan, ProductionRecord
from app.repository import RecordFilters
from app.service import ProductionService


def make_settings(tmp_dir: str) -> Settings:
    return Settings(
        database_url="mock://pulycort",
        app_refresh_seconds=30,
        shift_schedule="",
        sql_table_config=Path(tmp_dir) / "tables.json",
        sql_row_limit=5000,
        mapping_actions_path=Path(tmp_dir) / "mapping_actions.json",
        cors_origins=(),
        quantity_mode="cumulative",
        stalled_after_hours=6,
    )


def make_record(record_id: str, lot_id: str | None = None, pallet_out: str | None = None) -> ProductionRecord:
    return ProductionRecord(
        id=record_id,
        machine_id="telar_1",
        machine_name="Telar 1",
        timestamp=datetime(2026, 6, 10, 8, 0),
        lot_id=lot_id,
        pallet_out=pallet_out,
        quantity=1,
        unit="M3",
    )


class FakeRepository:
    def __init__(self, records: list[ProductionRecord]) -> None:
        self.records = records
        self.list_calls = 0

    def list_records(self, filters: RecordFilters) -> list[ProductionRecord]:
        self.list_calls += 1
        return list(self.records)

    def list_order_plans(self) -> list[ProductionOrderPlan]:
        return []

    def check_connection(self) -> bool:
        return True


class ServiceCacheTests(unittest.TestCase):
    def test_cached_data_avoids_repeated_repository_reads(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            repository = FakeRepository([make_record("a", lot_id="CM-48120")])
            service = ProductionService(make_settings(tmp_dir), repository)

            service.records(RecordFilters())
            service.orders()
            service.unknown_mappings()

            self.assertEqual(repository.list_calls, 1)


class ServiceTraceTests(unittest.TestCase):
    def _service(self, tmp_dir: str) -> ProductionService:
        repository = FakeRepository(
            [
                make_record("a", lot_id="47224"),
                make_record("b", lot_id="147224"),
                make_record("c", pallet_out="AC1048-60-001"),
            ]
        )
        return ProductionService(make_settings(tmp_dir), repository)

    def test_trace_prefers_exact_match(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            trace = self._service(tmp_dir).trace("47224")

        # Con lotes numericos correlativos, 47224 no debe arrastrar 147224.
        self.assertEqual(trace.match_mode, "exact")
        self.assertEqual([step.id for step in trace.steps], ["a"])

    def test_trace_falls_back_to_partial_match(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            trace = self._service(tmp_dir).trace("4722")

        self.assertEqual(trace.match_mode, "partial")
        self.assertEqual({step.id for step in trace.steps}, {"a", "b"})

    def test_trace_without_results(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            trace = self._service(tmp_dir).trace("ZZZ")

        self.assertEqual(trace.match_mode, "none")
        self.assertEqual(trace.steps, [])


class ServiceHealthTests(unittest.TestCase):
    def test_health_reports_shift_schedule_flag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            service = ProductionService(make_settings(tmp_dir), FakeRepository([]))
            health = service.health()

        self.assertTrue(health.read_only)
        self.assertFalse(health.shift_schedule_configured)


if __name__ == "__main__":
    unittest.main()
