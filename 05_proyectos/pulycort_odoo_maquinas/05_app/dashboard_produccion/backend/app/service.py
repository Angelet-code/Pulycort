from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from app.config import Settings
from app.machine_catalog import MACHINES
from app.metrics import area_m2, build_hour_buckets, build_kpis, build_machine_summaries, volume_m3
from app.models import HealthResponse, MachineStatus, ProductionOrder, ProductionSummary, TraceResponse, UnknownMapping
from app.order_tracking import build_orders
from app.repository import MockProductionRepository, ProductionRepository, RecordFilters, SqlProductionRepository
from app.timeutils import resolve_window


def get_repository(settings: Settings) -> ProductionRepository:
    if settings.data_mode == "sql":
        return SqlProductionRepository(settings.database_url, settings.sql_table_config, settings.sql_row_limit)
    return MockProductionRepository()


class ProductionService:
    def __init__(self, settings: Settings, repository: ProductionRepository) -> None:
        self.settings = settings
        self.repository = repository

    def health(self) -> HealthResponse:
        connected = self.repository.check_connection()
        return HealthResponse(
            status="ok" if connected else "degraded",
            data_mode=self.settings.data_mode,
            read_only=True,
            database_connected=connected,
            refresh_seconds=self.settings.app_refresh_seconds,
            message="Leyendo datos demo." if self.settings.data_mode == "mock" else "Conexion SQL configurada en modo solo lectura.",
        )

    def records(self, filters: RecordFilters) -> list:
        return self.repository.list_records(filters)

    def machine_statuses(self) -> list[MachineStatus]:
        now = datetime.now()
        start, end = resolve_window("today", now, self.settings.shift_schedule)
        records = self.repository.list_records(RecordFilters(window_start=start, window_end=end, limit=5000))
        by_machine = defaultdict(list)
        for record in records:
            by_machine[record.machine_id].append(record)

        statuses: list[MachineStatus] = []
        for machine in MACHINES:
            group = sorted(by_machine.get(machine.id, []), key=lambda item: item.timestamp, reverse=True)
            last = group[0] if group else None
            statuses.append(
                MachineStatus(
                    id=machine.id,
                    name=machine.name,
                    family=machine.family,
                    unit=machine.unit,
                    active=bool(last and last.timestamp >= now - timedelta(minutes=90)),
                    last_record_at=last.timestamp if last else None,
                    last_lot_id=last.lot_id if last else None,
                    records_today=len(group),
                    quantity_today=sum(item.quantity for item in group),
                    area_m2_today=round(sum(area_m2(item) for item in group), 3),
                    volume_m3_today=round(sum(volume_m3(item) for item in group), 3),
                    consumption_kwh_today=round(sum(item.consumption_kwh_delta or 0 for item in group), 3),
                    incidence_count_today=sum(1 for item in group if item.event_code or item.incidence_code),
                )
            )
        return statuses

    def summary(self, window: str) -> ProductionSummary:
        now = datetime.now()
        start, end = resolve_window(window, now, self.settings.shift_schedule)
        records = self.repository.list_records(RecordFilters(window_start=start, window_end=end, limit=5000))
        typed_window = "shift" if window == "shift" else "today"
        return ProductionSummary(
            window=typed_window,
            window_start=start,
            window_end=end,
            generated_at=now,
            kpis=build_kpis(records, now),
            by_machine=build_machine_summaries(records),
            production_by_hour=build_hour_buckets(records),
        )

    def orders(self) -> list[ProductionOrder]:
        records = self.repository.list_records(RecordFilters(limit=5000))
        return build_orders(records, self.repository.list_order_plans(), datetime.now())

    def trace(self, query: str) -> TraceResponse:
        records = self.repository.list_records(RecordFilters(limit=5000))
        needle = query.lower()
        matches = [
            record
            for record in records
            if needle in (record.lot_id or "").lower()
            or needle in (record.pallet_in or "").lower()
            or needle in (record.pallet_out or "").lower()
        ]
        return TraceResponse(query=query, steps=sorted(matches, key=lambda item: item.timestamp))

    def unknown_mappings(self) -> list[UnknownMapping]:
        records = self.repository.list_records(RecordFilters(limit=5000))
        buckets: dict[tuple[str, str, str], list] = defaultdict(list)
        for record in records:
            for kind, code, label in [
                ("operation", record.operation_code, record.operation_label),
                ("finish", record.finish_code, record.finish_label),
                ("event", record.event_code, record.event_label),
                ("incidence", record.incidence_code, record.incidence_label),
            ]:
                if code and not label:
                    buckets[(kind, record.machine_id, code)].append(record)

        unknowns: list[UnknownMapping] = []
        for (kind, machine_id, code), group in buckets.items():
            ordered = sorted(group, key=lambda item: item.timestamp)
            unknowns.append(
                UnknownMapping(
                    kind=kind,
                    code=code,
                    machine_id=machine_id,
                    machine_name=ordered[0].machine_name,
                    count=len(group),
                    first_seen=ordered[0].timestamp,
                    last_seen=ordered[-1].timestamp,
                )
            )
        return sorted(unknowns, key=lambda item: (item.kind, item.machine_name, item.code))
