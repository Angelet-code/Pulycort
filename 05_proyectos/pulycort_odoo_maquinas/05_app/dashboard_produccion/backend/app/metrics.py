from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from app.models import Kpi, MachineSummary, ProductionRecord, TimeBucket


def area_m2(record: ProductionRecord) -> float:
    if record.unit.upper() == "M2":
        return round(record.quantity, 3)
    length = record.dimensions.length_mm
    height = record.dimensions.height_mm
    if not length or not height:
        return 0.0
    multiplier = max(record.quantity, 1)
    return round((length * height * multiplier) / 1_000_000, 3)


def volume_m3(record: ProductionRecord) -> float:
    if record.unit.upper() == "M3":
        return round(record.quantity, 3)
    thickness = record.dimensions.thickness_mm
    if not thickness:
        return 0.0
    return round(area_m2(record) * (thickness / 1000), 3)


def with_consumption_deltas(records: list[ProductionRecord]) -> list[ProductionRecord]:
    by_machine: dict[str, list[ProductionRecord]] = defaultdict(list)
    for record in records:
        by_machine[record.machine_id].append(record)

    updated: list[ProductionRecord] = []
    for machine_records in by_machine.values():
        previous_total: float | None = None
        for record in sorted(machine_records, key=lambda item: item.timestamp):
            delta = record.consumption_kwh_delta
            if delta is None and record.consumption_kwh_total is not None:
                if previous_total is None:
                    delta = 0.0
                elif record.consumption_kwh_total >= previous_total:
                    delta = record.consumption_kwh_total - previous_total
                else:
                    delta = record.consumption_kwh_total
                previous_total = record.consumption_kwh_total
            updated.append(record.model_copy(update={"consumption_kwh_delta": round(delta or 0.0, 3)}))
    return sorted(updated, key=lambda item: item.timestamp, reverse=True)


def build_machine_summaries(records: list[ProductionRecord]) -> list[MachineSummary]:
    grouped: dict[str, list[ProductionRecord]] = defaultdict(list)
    for record in records:
        grouped[record.machine_id].append(record)

    summaries: list[MachineSummary] = []
    for machine_id, group in grouped.items():
        name = group[0].machine_name
        summaries.append(
            MachineSummary(
                machine_id=machine_id,
                machine_name=name,
                records=len(group),
                quantity=sum(item.quantity for item in group),
                area_m2=round(sum(area_m2(item) for item in group), 3),
                volume_m3=round(sum(volume_m3(item) for item in group), 3),
                consumption_kwh=round(sum(item.consumption_kwh_delta or 0 for item in group), 3),
                incidents=sum(1 for item in group if item.incidence_code or item.event_code),
            )
        )
    return sorted(summaries, key=lambda item: item.machine_name)


def build_hour_buckets(records: list[ProductionRecord]) -> list[TimeBucket]:
    buckets: dict[tuple[str, str], list[ProductionRecord]] = defaultdict(list)
    for record in records:
        bucket = record.timestamp.replace(minute=0, second=0, microsecond=0).isoformat(timespec="minutes")
        buckets[(bucket, record.machine_id)].append(record)

    output: list[TimeBucket] = []
    for (bucket, machine_id), group in buckets.items():
        output.append(
            TimeBucket(
                bucket=bucket,
                machine_id=machine_id,
                machine_name=group[0].machine_name,
                quantity=sum(item.quantity for item in group),
                area_m2=round(sum(area_m2(item) for item in group), 3),
                volume_m3=round(sum(volume_m3(item) for item in group), 3),
                records=len(group),
            )
        )
    return sorted(output, key=lambda item: (item.bucket, item.machine_name))


def build_kpis(records: list[ProductionRecord], generated_at: datetime) -> list[Kpi]:
    active_machines = len({record.machine_id for record in records})
    incidents = sum(1 for record in records if record.incidence_code or record.event_code)
    return [
        Kpi(label="Maquinas activas", value=active_machines, unit="", help="Maquinas con registros en la ventana seleccionada."),
        Kpi(label="Registros", value=len(records), unit="", help="Partes o eventos recibidos desde las tablas SQL."),
        Kpi(label="Produccion", value=round(sum(area_m2(record) for record in records), 2), unit="m2", help="Area estimada desde largo x alto x cantidad."),
        Kpi(label="Volumen", value=round(sum(volume_m3(record) for record in records), 2), unit="m3", help="Volumen estimado cuando hay grueso disponible."),
        Kpi(label="Consumo", value=round(sum(record.consumption_kwh_delta or 0 for record in records), 2), unit="kWh", help="Diferencia entre contador inicial y final por maquina."),
        Kpi(label="Eventos", value=incidents, unit="", help="Eventos o incidencias registrados en la ventana."),
    ]
