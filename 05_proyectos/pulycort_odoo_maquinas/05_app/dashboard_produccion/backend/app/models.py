from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class Dimensions(BaseModel):
    length_mm: float | None = None
    height_mm: float | None = None
    thickness_mm: float | None = None


class MachineDefinition(BaseModel):
    id: str
    name: str
    family: str
    unit: str
    sort_order: int


class ProductionRecord(BaseModel):
    id: str
    commercial_order_id: str | None = None
    order_id: str | None = None
    order_title: str | None = None
    order_description: str | None = None
    client_name: str | None = None
    order_planned_quantity: float | None = None
    order_unit: str | None = None
    order_sale_price_eur_m2: float | None = None
    order_cost_price_eur_m2: float | None = None
    machine_id: str
    machine_name: str
    timestamp: datetime
    operators: list[str] = Field(default_factory=list)
    lot_id: str | None = None
    pallet_in: str | None = None
    pallet_out: str | None = None
    material_code: str | None = None
    material_name: str | None = None
    material_family: str | None = None
    dimensions: Dimensions = Field(default_factory=Dimensions)
    quantity: float = 0
    unit: str = "UN"
    operation_code: str | None = None
    operation_label: str | None = None
    finish_code: str | None = None
    finish_label: str | None = None
    consumption_kwh_total: float | None = None
    consumption_kwh_delta: float | None = None
    event_code: str | None = None
    event_label: str | None = None
    incidence_code: str | None = None
    incidence_label: str | None = None
    consumables: dict[str, float | None] = Field(default_factory=dict)
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    data_mode: Literal["mock", "sql"]
    read_only: bool
    database_connected: bool
    refresh_seconds: int
    message: str


class MachineStatus(BaseModel):
    id: str
    name: str
    family: str
    unit: str
    active: bool
    last_record_at: datetime | None = None
    last_lot_id: str | None = None
    records_today: int = 0
    quantity_today: float = 0
    area_m2_today: float = 0
    volume_m3_today: float = 0
    consumption_kwh_today: float = 0
    incidence_count_today: int = 0


class Kpi(BaseModel):
    label: str
    value: float
    unit: str
    help: str


class TimeBucket(BaseModel):
    bucket: str
    machine_id: str
    machine_name: str
    quantity: float
    area_m2: float
    volume_m3: float
    records: int


class MachineSummary(BaseModel):
    machine_id: str
    machine_name: str
    records: int
    quantity: float
    area_m2: float
    volume_m3: float
    consumption_kwh: float
    incidents: int


class ProductionSummary(BaseModel):
    window: Literal["today", "shift"]
    window_start: datetime
    window_end: datetime
    generated_at: datetime
    kpis: list[Kpi]
    by_machine: list[MachineSummary]
    production_by_hour: list[TimeBucket]


class ProductionOrderPlan(BaseModel):
    id: str
    commercial_order_id: str | None = None
    title: str
    description: str = ""
    client: str
    planned_quantity: float
    unit: str
    sale_price_eur_m2: float | None = None
    cost_price_eur_m2: float | None = None
    linked_lot_ids: list[str] = Field(default_factory=list)
    linked_pallet_ids: list[str] = Field(default_factory=list)


class OrderStage(BaseModel):
    label: str
    status: Literal["pending", "active", "done", "blocked"]
    produced_quantity: float = 0
    unit: str
    machine_names: list[str] = Field(default_factory=list)
    last_record_at: datetime | None = None


class ProductionOrder(BaseModel):
    id: str
    commercial_order_id: str | None = None
    title: str
    description: str
    client: str
    production_status: Literal["sin_datos", "en_cola", "en_produccion", "pausado", "en_riesgo", "completado"]
    percent_produced: float
    planned_quantity: float
    produced_quantity: float
    unit: str
    sale_price_eur_m2: float | None = None
    cost_price_eur_m2: float | None = None
    sale_amount_eur: float | None = None
    cost_amount_eur: float | None = None
    margin_amount_eur: float | None = None
    margin_percent: float | None = None
    estimated_completion_at: datetime | None = None
    last_activity_at: datetime | None = None
    active_machine: str | None = None
    current_operation: str | None = None
    incidence_count: int = 0
    linked_lot_ids: list[str] = Field(default_factory=list)
    linked_pallet_ids: list[str] = Field(default_factory=list)
    stages: list[OrderStage] = Field(default_factory=list)


class TraceResponse(BaseModel):
    query: str
    steps: list[ProductionRecord]


class UnknownMapping(BaseModel):
    kind: Literal["operation", "finish", "event", "incidence"]
    code: str
    machine_id: str
    machine_name: str
    count: int
    first_seen: datetime
    last_seen: datetime
