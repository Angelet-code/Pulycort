from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol

from app.metrics import with_consumption_deltas
from app.mock_data import make_demo_order_plans, make_demo_records
from app.models import Dimensions, ProductionOrderPlan, ProductionRecord
from app.sql_guard import assert_safe_identifier, assert_select_only
from app.timeutils import parse_compact_date_time


@dataclass(frozen=True)
class RecordFilters:
    window_start: datetime | None = None
    window_end: datetime | None = None
    machine_id: str | None = None
    lot_id: str | None = None
    pallet: str | None = None
    material_code: str | None = None
    operator: str | None = None
    operation_code: str | None = None
    limit: int = 250


class ProductionRepository(Protocol):
    def list_records(self, filters: RecordFilters) -> list[ProductionRecord]:
        ...

    def list_order_plans(self) -> list[ProductionOrderPlan]:
        ...

    def check_connection(self) -> bool:
        ...


class MockProductionRepository:
    def __init__(self) -> None:
        self._records = with_consumption_deltas(make_demo_records())

    def check_connection(self) -> bool:
        return True

    def list_records(self, filters: RecordFilters) -> list[ProductionRecord]:
        return _filter_records(self._records, filters)

    def list_order_plans(self) -> list[ProductionOrderPlan]:
        return make_demo_order_plans()


class SqlProductionRepository:
    def __init__(self, database_url: str, table_config_path: Path, row_limit: int) -> None:
        self.database_url = database_url
        self.table_config_path = table_config_path
        self.row_limit = row_limit
        try:
            from sqlalchemy import create_engine
        except ImportError as exc:
            raise RuntimeError("SQL mode needs SQLAlchemy installed. Run pip install -r backend/requirements.txt") from exc
        self.engine = create_engine(database_url, future=True)
        self.table_config = _load_table_config(table_config_path)

    def check_connection(self) -> bool:
        try:
            with self.engine.connect() as connection:
                connection.exec_driver_sql("SELECT 1")
            return True
        except Exception:
            return False

    def list_records(self, filters: RecordFilters) -> list[ProductionRecord]:
        raw_records: list[ProductionRecord] = []
        with self.engine.connect() as connection:
            dialect = connection.dialect.name
            for machine_config in self.table_config.get("machines", []):
                if filters.machine_id and machine_config["machine_id"] != filters.machine_id:
                    continue
                query = _build_machine_query(machine_config, dialect, min(filters.limit, self.row_limit))
                rows = connection.exec_driver_sql(query).mappings().all()
                for row in rows:
                    raw_records.append(_row_to_record(machine_config, dict(row)))
        return _filter_records(with_consumption_deltas(raw_records), filters)

    def list_order_plans(self) -> list[ProductionOrderPlan]:
        return []


def _filter_records(records: list[ProductionRecord], filters: RecordFilters) -> list[ProductionRecord]:
    output: list[ProductionRecord] = []
    lot_text = (filters.lot_id or "").lower()
    pallet_text = (filters.pallet or "").lower()
    for record in records:
        if filters.window_start and record.timestamp < filters.window_start:
            continue
        if filters.window_end and record.timestamp > filters.window_end:
            continue
        if filters.machine_id and record.machine_id != filters.machine_id:
            continue
        if lot_text and lot_text not in (record.lot_id or "").lower():
            continue
        if pallet_text:
            pallet_values = " ".join(value or "" for value in [record.pallet_in, record.pallet_out]).lower()
            if pallet_text not in pallet_values:
                continue
        if filters.material_code and record.material_code != filters.material_code:
            continue
        if filters.operator and filters.operator not in record.operators:
            continue
        if filters.operation_code and record.operation_code != filters.operation_code:
            continue
        output.append(record)
    return sorted(output, key=lambda item: item.timestamp, reverse=True)[: filters.limit]


def _load_table_config(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _build_machine_query(machine_config: dict[str, Any], dialect: str, limit: int) -> str:
    table = assert_safe_identifier(machine_config["table"])
    columns = _configured_columns(machine_config)
    safe_columns = [assert_safe_identifier(column) for column in columns]
    order_columns = [column for column in _timestamp_columns(machine_config) if column]
    safe_order = [assert_safe_identifier(column) for column in order_columns]

    select_columns = ", ".join(safe_columns)
    order_by = ", ".join(f"{column} DESC" for column in safe_order) or safe_columns[0]
    if dialect in {"mssql", "sqlserver"}:
        sql = f"SELECT TOP {int(limit)} {select_columns} FROM {table} ORDER BY {order_by}"
    else:
        sql = f"SELECT {select_columns} FROM {table} ORDER BY {order_by} LIMIT {int(limit)}"
    return assert_select_only(sql)


def _configured_columns(machine_config: dict[str, Any]) -> list[str]:
    columns: list[str] = []
    columns.extend(_timestamp_columns(machine_config))
    columns.extend(machine_config.get("columns", {}).values())
    return sorted({column for column in columns if column})


def _timestamp_columns(machine_config: dict[str, Any]) -> list[str]:
    timestamp = machine_config.get("timestamp", {})
    if "column" in timestamp:
        return [timestamp["column"]]
    return [timestamp.get("date"), timestamp.get("time")]


def _row_to_record(machine_config: dict[str, Any], row: dict[str, Any]) -> ProductionRecord:
    columns = machine_config.get("columns", {})
    timestamp_config = machine_config.get("timestamp", {})
    if timestamp_config.get("column"):
        timestamp_value = row.get(timestamp_config["column"])
        timestamp = timestamp_value if isinstance(timestamp_value, datetime) else datetime.fromisoformat(str(timestamp_value))
    else:
        timestamp = parse_compact_date_time(row.get(timestamp_config.get("date")), row.get(timestamp_config.get("time")))

    def value(key: str) -> Any:
        column = columns.get(key)
        return row.get(column) if column else None

    operators = [str(item) for item in [value("operator_1"), value("operator_2"), value("operator_3")] if item not in (None, "")]
    raw_payload = {key: _json_safe(item) for key, item in row.items()}
    return ProductionRecord(
        id=f"{machine_config['machine_id']}-{timestamp.isoformat()}-{value('lot_id') or value('pallet_in') or value('pallet_out') or 'row'}",
        commercial_order_id=_to_str(value("commercial_order_id")),
        order_id=_to_str(value("order_id")),
        order_title=_to_str(value("order_title")),
        order_description=_to_str(value("order_description")),
        client_name=_to_str(value("client_name")),
        order_planned_quantity=_to_float(value("order_planned_quantity")),
        order_unit=_to_str(value("order_unit")),
        order_sale_price_eur_m2=_to_float(value("order_sale_price_eur_m2")),
        order_cost_price_eur_m2=_to_float(value("order_cost_price_eur_m2")),
        machine_id=machine_config["machine_id"],
        machine_name=machine_config["machine_name"],
        timestamp=timestamp,
        operators=operators,
        lot_id=_to_str(value("lot_id")),
        pallet_in=_to_str(value("pallet_in")),
        pallet_out=_to_str(value("pallet_out")),
        material_code=_to_str(value("material_code")),
        material_name=_to_str(value("material_name")),
        material_family=_to_str(value("material_family")),
        dimensions=Dimensions(
            length_mm=_to_float(value("length_mm")),
            height_mm=_to_float(value("height_mm")),
            thickness_mm=_to_float(value("thickness_mm")),
        ),
        quantity=_to_float(value("quantity")) or 0,
        unit=_to_str(value("unit")) or machine_config.get("unit", "UN"),
        operation_code=_to_str(value("operation_code")),
        operation_label=_to_str(value("operation_label")),
        finish_code=_to_str(value("finish_code")),
        finish_label=_to_str(value("finish_label")),
        consumption_kwh_total=_to_float(value("consumption_kwh_total")),
        event_code=_to_str(value("event_code")),
        event_label=_to_str(value("event_label")),
        incidence_code=_to_str(value("incidence_code")),
        incidence_label=_to_str(value("incidence_label")),
        consumables={
            "malla_m2": _to_float(value("malla_m2")),
            "quimicos_l": _to_float(value("chemicals_l")),
        },
        raw_payload=raw_payload,
    )


def _to_str(value: Any) -> str | None:
    if value is None or value == "":
        return None
    return str(value)


def _to_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value
