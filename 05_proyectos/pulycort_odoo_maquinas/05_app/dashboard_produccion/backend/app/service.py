from __future__ import annotations

import threading
from collections import defaultdict
from datetime import datetime, timedelta
from time import monotonic

from app.config import Settings
from app.machine_catalog import MACHINES
from app.mapping_actions import MappingActionStore
from app.metrics import area_m2, build_hour_buckets, build_kpis, build_machine_summaries, volume_m3
from app.models import HealthResponse, MachineStatus, ProductionOrder, ProductionOrderPlan, ProductionRecord, ProductionSummary, TraceResponse, UnknownMapping
from app.order_tracking import build_orders
from app.repository import MockProductionRepository, ProductionRepository, RecordFilters, SqlProductionRepository, filter_records
from app.timeutils import resolve_window


def get_repository(settings: Settings) -> ProductionRepository:
    if settings.data_mode == "sql":
        return SqlProductionRepository(settings.database_url, settings.sql_table_config, settings.sql_row_limit)
    return MockProductionRepository()


class ProductionService:
    def __init__(self, settings: Settings, repository: ProductionRepository) -> None:
        self.settings = settings
        self.repository = repository
        self.mapping_actions = MappingActionStore(settings.mapping_actions_path)
        self._cache_lock = threading.Lock()
        self._cache: tuple[list[ProductionRecord], list[ProductionOrderPlan]] | None = None
        self._cache_at: float = 0.0

    def _cached_data(self) -> tuple[list[ProductionRecord], list[ProductionOrderPlan]]:
        """Una unica lectura del SQL de maquinas por ciclo de refresco.

        El frontend consulta varios endpoints cada APP_REFRESH_SECONDS; sin
        cache cada peticion relanzaria un SELECT por tabla de maquina contra
        la base de produccion de TotWare/INDASEL.
        """
        ttl = max(5, self.settings.app_refresh_seconds)
        with self._cache_lock:
            if self._cache is not None and monotonic() - self._cache_at < ttl:
                return self._cache
        records = self.repository.list_records(RecordFilters(limit=self.settings.sql_row_limit))
        plans = self.repository.list_order_plans()
        with self._cache_lock:
            self._cache = (records, plans)
            self._cache_at = monotonic()
        return records, plans

    def health(self) -> HealthResponse:
        connected = self.repository.check_connection()
        return HealthResponse(
            status="ok" if connected else "degraded",
            data_mode=self.settings.data_mode,
            read_only=True,
            database_connected=connected,
            refresh_seconds=self.settings.app_refresh_seconds,
            shift_schedule_configured=bool(self.settings.shift_schedule.strip()),
            message="Leyendo datos demo." if self.settings.data_mode == "mock" else "Conexion SQL configurada en modo solo lectura.",
        )

    def records(self, filters: RecordFilters) -> list[ProductionRecord]:
        records, _ = self._cached_data()
        return filter_records(records, filters)

    def machine_statuses(self) -> list[MachineStatus]:
        now = datetime.now()
        start, end = resolve_window("today", now, self.settings.shift_schedule)
        records = self.records(RecordFilters(window_start=start, window_end=end, limit=self.settings.sql_row_limit))
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
        records = self.records(RecordFilters(window_start=start, window_end=end, limit=self.settings.sql_row_limit))
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
        records, plans = self._cached_data()
        return build_orders(
            records,
            plans,
            datetime.now(),
            quantity_mode=self.settings.quantity_mode,
            shift_schedule=self.settings.shift_schedule,
            stalled_after_hours=self.settings.stalled_after_hours,
        )

    def trace(self, query: str) -> TraceResponse:
        records, _ = self._cached_data()
        needle = query.strip().lower()
        if not needle:
            return TraceResponse(query=query, match_mode="none", steps=[])

        def identifiers(record: ProductionRecord) -> set[str]:
            return {value.lower() for value in [record.lot_id, record.pallet_in, record.pallet_out] if value}

        # Coincidencia exacta primero: con lotes/PM numericos correlativos una
        # busqueda por subcadena mezclaria lotes distintos (47224 vs 147224).
        exact = [record for record in records if needle in identifiers(record)]
        if exact:
            return TraceResponse(query=query, match_mode="exact", steps=sorted(exact, key=lambda item: item.timestamp))
        partial = [
            record
            for record in records
            if any(needle in identifier for identifier in identifiers(record))
        ]
        return TraceResponse(
            query=query,
            match_mode="partial" if partial else "none",
            steps=sorted(partial, key=lambda item: item.timestamp),
        )

    def unknown_mappings(self) -> list[UnknownMapping]:
        records, _ = self._cached_data()
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
            state = self.mapping_actions.get(kind, machine_id, code) or {}
            unknowns.append(
                UnknownMapping(
                    kind=kind,
                    code=code,
                    machine_id=machine_id,
                    machine_name=ordered[0].machine_name,
                    count=len(group),
                    first_seen=ordered[0].timestamp,
                    last_seen=ordered[-1].timestamp,
                    action=_mapping_action(state.get("action")),
                    note=_mapping_text(state.get("note")),
                    mapped_label=_mapping_text(state.get("mapped_label")),
                    updated_at=_mapping_datetime(state.get("updated_at")),
                )
            )
        return sorted(unknowns, key=lambda item: (_action_rank(item.action), item.kind, item.machine_name, item.code))


def _mapping_action(value: object) -> str:
    if value in {"pendiente", "mapear", "ignorar", "preguntar_a_indasel"}:
        return str(value)
    return "pendiente"


def _mapping_text(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _mapping_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _action_rank(action: str) -> int:
    return {
        "pendiente": 0,
        "preguntar_a_indasel": 1,
        "mapear": 2,
        "ignorar": 3,
    }.get(action, 4)
