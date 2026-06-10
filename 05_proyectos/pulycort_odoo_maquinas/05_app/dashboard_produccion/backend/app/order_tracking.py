from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable

from app.models import OrderStage, ProductionOrder, ProductionOrderPlan, ProductionRecord


STAGE_RULES: tuple[tuple[str, set[str]], ...] = (
    ("Aserrado bloque", {"telar_1", "telar_2", "telar_3", "telar_4"}),
    ("Refuerzo tabla", {"reforzadora_tablas"}),
    ("Acabado tabla", {"pulidora_tablas"}),
    ("Corte a losa", {"disco_puente_gomez"}),
    ("Acabado losa", {"pulidora_losas"}),
)

STATUS_RANK = {
    "en_riesgo": 0,
    "en_produccion": 1,
    "pausado": 2,
    "en_cola": 3,
    "completado": 4,
    "sin_datos": 5,
}


def build_orders(
    records: list[ProductionRecord],
    configured_plans: list[ProductionOrderPlan],
    now: datetime,
) -> list[ProductionOrder]:
    plans = _merge_configured_and_record_plans(configured_plans, records)
    orders = [_build_order(plan, records, now) for plan in plans]
    return sorted(
        orders,
        key=lambda order: (
            STATUS_RANK[order.production_status],
            order.estimated_completion_at or datetime.max,
            order.id,
        ),
    )


def _merge_configured_and_record_plans(
    configured_plans: list[ProductionOrderPlan],
    records: list[ProductionRecord],
) -> list[ProductionOrderPlan]:
    plans_by_id = {plan.id: plan for plan in configured_plans}
    for record in records:
        if not record.order_id or record.order_id in plans_by_id:
            continue
        plans_by_id[record.order_id] = ProductionOrderPlan(
            id=record.order_id,
            commercial_order_id=record.commercial_order_id,
            title=record.order_title or f"Pedido {record.order_id}",
            description=record.order_description or "",
            client=record.client_name or "Cliente pendiente",
            planned_quantity=record.order_planned_quantity or max(record.quantity, 1),
            unit=record.order_unit or record.unit,
            sale_price_eur_m2=record.order_sale_price_eur_m2,
            cost_price_eur_m2=record.order_cost_price_eur_m2,
            linked_lot_ids=[record.lot_id] if record.lot_id else [],
            linked_pallet_ids=[pallet for pallet in [record.pallet_in, record.pallet_out] if pallet],
        )
    return list(plans_by_id.values())


def _build_order(plan: ProductionOrderPlan, all_records: list[ProductionRecord], now: datetime) -> ProductionOrder:
    order_records = _records_for_plan(plan, all_records)
    linked_lots = _unique([*plan.linked_lot_ids, *(record.lot_id for record in order_records)])
    linked_pallets = _unique(
        [
            *plan.linked_pallet_ids,
            *(record.pallet_in for record in order_records),
            *(record.pallet_out for record in order_records),
        ]
    )

    stages = _build_stages(order_records, plan)
    produced_quantity = _furthest_stage_quantity(stages, order_records, plan.unit)
    percent = min(100.0, round((produced_quantity / plan.planned_quantity) * 100, 1)) if plan.planned_quantity else 0.0
    latest = max(order_records, key=lambda item: item.timestamp, default=None)
    incidence_count = sum(1 for record in order_records if record.event_code or record.incidence_code)
    status = _order_status(order_records, produced_quantity, percent, latest, now)
    eta = _estimate_completion(order_records, produced_quantity, plan.planned_quantity, percent, now)
    sale_amount = _line_amount(plan.sale_price_eur_m2, plan.planned_quantity)
    cost_amount = _line_amount(plan.cost_price_eur_m2, plan.planned_quantity)
    margin_amount = round(sale_amount - cost_amount, 2) if sale_amount is not None and cost_amount is not None else None
    margin_percent = round((margin_amount / sale_amount) * 100, 1) if sale_amount and margin_amount is not None else None

    return ProductionOrder(
        id=plan.id,
        commercial_order_id=plan.commercial_order_id,
        title=plan.title,
        description=plan.description,
        client=plan.client,
        production_status=status,
        percent_produced=percent,
        planned_quantity=plan.planned_quantity,
        produced_quantity=round(produced_quantity, 3),
        unit=plan.unit,
        sale_price_eur_m2=plan.sale_price_eur_m2,
        cost_price_eur_m2=plan.cost_price_eur_m2,
        sale_amount_eur=sale_amount,
        cost_amount_eur=cost_amount,
        margin_amount_eur=margin_amount,
        margin_percent=margin_percent,
        estimated_completion_at=eta,
        last_activity_at=latest.timestamp if latest else None,
        active_machine=latest.machine_name if latest else None,
        current_operation=_operation_label(latest) if latest else None,
        incidence_count=incidence_count,
        linked_lot_ids=linked_lots,
        linked_pallet_ids=linked_pallets,
        stages=stages,
    )


def _records_for_plan(plan: ProductionOrderPlan, records: list[ProductionRecord]) -> list[ProductionRecord]:
    lot_ids = {item.lower() for item in plan.linked_lot_ids}
    pallet_ids = {item.lower() for item in plan.linked_pallet_ids}
    matches: list[ProductionRecord] = []
    for record in records:
        pallets = {item.lower() for item in [record.pallet_in, record.pallet_out] if item}
        if record.order_id == plan.id:
            matches.append(record)
        elif record.lot_id and record.lot_id.lower() in lot_ids:
            matches.append(record)
        elif pallets & pallet_ids:
            matches.append(record)
    return sorted(matches, key=lambda item: item.timestamp)


def _build_stages(records: list[ProductionRecord], plan: ProductionOrderPlan) -> list[OrderStage]:
    groups = [_records_for_stage(records, machine_ids) for _, machine_ids in STAGE_RULES]
    furthest_index = max((idx for idx, group in enumerate(groups) if group), default=-1)
    stages: list[OrderStage] = []
    for idx, ((label, _), group) in enumerate(zip(STAGE_RULES, groups)):
        produced = _stage_quantity(group)
        latest = max(group, key=lambda item: item.timestamp, default=None)
        stage_unit = latest.unit if latest else plan.unit
        if not group:
            status = "pending"
        elif idx < furthest_index or produced >= plan.planned_quantity * 0.98:
            status = "done"
        else:
            status = "active"
        stages.append(
            OrderStage(
                label=label,
                status=status,
                produced_quantity=round(produced, 3),
                unit=stage_unit,
                machine_names=_unique(record.machine_name for record in group),
                last_record_at=latest.timestamp if latest else None,
            )
        )
    return stages


def _records_for_stage(records: list[ProductionRecord], machine_ids: set[str]) -> list[ProductionRecord]:
    return [record for record in records if record.machine_id in machine_ids]


def _furthest_stage_quantity(stages: list[OrderStage], records: list[ProductionRecord], unit: str) -> float:
    for stage in reversed(stages):
        if stage.produced_quantity > 0 and stage.unit.upper() == unit.upper():
            return stage.produced_quantity
    for stage in reversed(stages):
        if stage.produced_quantity > 0:
            return stage.produced_quantity
    return _stage_quantity(records)


def _stage_quantity(records: list[ProductionRecord]) -> float:
    if not records:
        return 0.0
    return max(record.quantity for record in records)


def _order_status(
    records: list[ProductionRecord],
    produced_quantity: float,
    percent: float,
    latest: ProductionRecord | None,
    now: datetime,
) -> str:
    if not records:
        return "en_cola"
    if percent >= 100 or produced_quantity > 0 and percent >= 99.5:
        return "completado"
    if latest and latest.timestamp < now - timedelta(hours=6):
        return "pausado"
    if produced_quantity <= 0:
        return "en_cola"
    return "en_produccion"


def _estimate_completion(
    records: list[ProductionRecord],
    produced_quantity: float,
    planned_quantity: float,
    percent: float,
    now: datetime,
) -> datetime | None:
    if not records or produced_quantity <= 0 or planned_quantity <= 0:
        return None
    ordered = sorted(records, key=lambda item: item.timestamp)
    latest = ordered[-1].timestamp
    if percent >= 100:
        return latest
    elapsed_hours = max((latest - ordered[0].timestamp).total_seconds() / 3600, 0.5)
    rate_per_hour = produced_quantity / elapsed_hours
    if rate_per_hour <= 0:
        return None
    remaining = max(planned_quantity - produced_quantity, 0)
    eta = latest + timedelta(hours=remaining / rate_per_hour)
    if eta < now:
        eta = now + timedelta(hours=remaining / rate_per_hour)
    return eta


def _line_amount(unit_price: float | None, quantity: float) -> float | None:
    if unit_price is None:
        return None
    return round(unit_price * quantity, 2)


def _operation_label(record: ProductionRecord | None) -> str | None:
    if not record:
        return None
    return record.operation_label or record.finish_label or record.operation_code or record.finish_code


def _unique(values: Iterable[str | None]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not value:
            continue
        normalized = value.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        output.append(value)
    return output
