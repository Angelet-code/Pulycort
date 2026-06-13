from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from app.models import Kpi, MachineSummary, ProductionRecord, TimeBucket


def area_m2(record: ProductionRecord) -> float:
    unit = record.unit.upper()
    if unit == "M2":
        return round(record.quantity, 3)
    if unit == "M3":
        # En aserrado las dimensiones son del bloque, no de la pieza producida:
        # derivar area de ahi multiplicaria por el numero de tablas un area falsa.
        return 0.0
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
        for record in sorted(machine_records, key=lambda item: (item.timestamp, item.id)):
            delta = record.consumption_kwh_delta
            if delta is None and record.consumption_kwh_total is not None:
                if previous_total is not None:
                    if record.consumption_kwh_total >= previous_total:
                        delta = record.consumption_kwh_total - previous_total
                    else:
                        # Contador reiniciado: el total actual es el minimo gastado.
                        delta = record.consumption_kwh_total
                # Sin lectura previa el delta es desconocido, no cero.
                previous_total = record.consumption_kwh_total
            updated.append(
                record.model_copy(update={"consumption_kwh_delta": round(delta, 3) if delta is not None else None})
            )
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
    machines_with_records = len({record.machine_id for record in records})
    incidents = sum(1 for record in records if record.incidence_code or record.event_code)
    sawn_volume = sum(volume_m3(record) for record in records if record.unit.upper() == "M3")
    return [
        Kpi(label="Maquinas con registros", value=machines_with_records, unit="", help="Maquinas con al menos un registro en la ventana seleccionada."),
        Kpi(label="Registros", value=len(records), unit="", help="Partes o eventos recibidos desde las tablas SQL."),
        Kpi(label="Area procesada", value=round(sum(area_m2(record) for record in records), 2), unit="m2", help="Suma del area registrada en todas las maquinas; una misma pieza cuenta en cada fase que atraviesa."),
        Kpi(label="Volumen aserrado", value=round(sawn_volume, 2), unit="m3", help="M3 registrados en maquinas de aserrado (telares y cortabloques)."),
        Kpi(label="Consumo", value=round(sum(record.consumption_kwh_delta or 0 for record in records), 2), unit="kWh", help="Suma de incrementos del contador por maquina; el primer parte de la ventana no aporta delta."),
        Kpi(label="Eventos", value=incidents, unit="", help="Eventos o incidencias registrados en la ventana."),
    ]
