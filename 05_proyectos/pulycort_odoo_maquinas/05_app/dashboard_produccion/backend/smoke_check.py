"""Smoke test manual del pipeline en modo mock (no es parte de la suite)."""
from __future__ import annotations

from app.config import get_settings
from app.repository import RecordFilters
from app.service import ProductionService, get_repository

settings = get_settings()
service = ProductionService(settings, get_repository(settings))

health = service.health()
print("health:", health.status, health.data_mode, "turnos:", health.shift_schedule_configured)

machines = service.machine_statuses()
print("maquinas:", len(machines), "con senal:", sum(1 for m in machines if m.records_today))

summary = service.summary("today")
print("kpis:", {kpi.label: kpi.value for kpi in summary.kpis})

orders = service.orders()
for order in orders:
    print(f"  {order.id:16} {order.production_status:13} {order.percent_produced:6}% compromiso={order.committed_date}")

exact = service.trace("CM-48120")
partial = service.trace("CM-481")
print("trace exacta:", exact.match_mode, len(exact.steps), "| parcial:", partial.match_mode, len(partial.steps))

unknowns = service.unknown_mappings()
print("codigos pendientes:", [(u.kind, u.machine_id, u.code) for u in unknowns])

records = service.records(RecordFilters(limit=10))
print("ids unicos en /records:", len({r.id for r in records}) == len(records))
