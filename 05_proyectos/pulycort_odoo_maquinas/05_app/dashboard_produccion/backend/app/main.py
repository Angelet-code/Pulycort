from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import Literal

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.models import HealthResponse, MachineStatus, ProductionOrder, ProductionRecord, ProductionSummary, TraceResponse, UnknownMapping
from app.repository import RecordFilters
from app.service import ProductionService, get_repository
from app.timeutils import resolve_window


app = FastAPI(title="Pulycort Dashboard Produccion", version="0.1.0")


settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    # API de solo lectura: el tracker observa, no ejecuta.
    allow_methods=["GET"],
    allow_headers=["*"],
)


@lru_cache(maxsize=1)
def get_service() -> ProductionService:
    current_settings = get_settings()
    return ProductionService(current_settings, get_repository(current_settings))


@app.get("/api/health", response_model=HealthResponse)
def health(service: ProductionService = Depends(get_service)) -> HealthResponse:
    return service.health()


@app.get("/api/machines", response_model=list[MachineStatus])
def machines(service: ProductionService = Depends(get_service)) -> list[MachineStatus]:
    return service.machine_statuses()


@app.get("/api/production/summary", response_model=ProductionSummary)
def production_summary(
    window: Literal["today", "shift"] = "today",
    service: ProductionService = Depends(get_service),
) -> ProductionSummary:
    return service.summary(window)


@app.get("/api/orders", response_model=list[ProductionOrder])
def orders(service: ProductionService = Depends(get_service)) -> list[ProductionOrder]:
    return service.orders()


@app.get("/api/records", response_model=list[ProductionRecord])
def records(
    window: Literal["today", "shift", "all"] = "today",
    machine_id: str | None = None,
    lot_id: str | None = None,
    pallet: str | None = None,
    material_code: str | None = None,
    operator: str | None = None,
    operation_code: str | None = None,
    limit: int = Query(default=250, ge=1, le=1000),
    service: ProductionService = Depends(get_service),
    current_settings: Settings = Depends(get_settings),
) -> list[ProductionRecord]:
    start = end = None
    if window != "all":
        start, end = resolve_window(window, datetime.now(), current_settings.shift_schedule)
    return service.records(
        RecordFilters(
            window_start=start,
            window_end=end,
            machine_id=machine_id,
            lot_id=lot_id,
            pallet=pallet,
            material_code=material_code,
            operator=operator,
            operation_code=operation_code,
            limit=limit,
        )
    )


@app.get("/api/trace/{lote_o_palet}", response_model=TraceResponse)
def trace(lote_o_palet: str, service: ProductionService = Depends(get_service)) -> TraceResponse:
    return service.trace(lote_o_palet)


@app.get("/api/mappings/unknowns", response_model=list[UnknownMapping])
def mapping_unknowns(service: ProductionService = Depends(get_service)) -> list[UnknownMapping]:
    return service.unknown_mappings()
