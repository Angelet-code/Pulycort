from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable

from app.models import NextAction, OrderStage, ProductionOrder, ProductionOrderLine, ProductionOrderPlan, ProductionRecord
from app.timeutils import is_within_working_hours


@dataclass(frozen=True)
class StageRule:
    label: str
    machine_ids: frozenset[str]
    # Fases auxiliares (refuerzo de bloque, taller) no marcan el avance del
    # pedido: un trabajo pequeno de taller no debe sustituir a la cantidad
    # de la fase principal mas avanzada.
    counts_for_progress: bool


# Cadena documentada bloque -> tabla -> losa (02_conocimiento/obsidian/03
# Cadena industrial bloque tabla losa.md). Cubre las 18 maquinas del catalogo.
STAGE_RULES: tuple[StageRule, ...] = (
    StageRule("Refuerzo bloque", frozenset({"reforzadora_bloques"}), False),
    StageRule(
        "Aserrado bloque",
        frozenset({"telar_1", "telar_2", "telar_3", "telar_4", "telar_externo", "telar_monohilo", "cortabloques"}),
        True,
    ),
    StageRule("Refuerzo tabla", frozenset({"reforzadora_tablas"}), True),
    StageRule("Acabado tabla", frozenset({"pulidora_tablas"}), True),
    StageRule(
        "Corte a losa",
        frozenset({"disco_puente_terzago", "disco_puente_gomez", "disco_puente_canigo", "control_numerico_donatoni"}),
        True,
    ),
    StageRule("Acabado losa", frozenset({"pulidora_losas"}), True),
    StageRule("Taller y biselado", frozenset({"biseladora", "taller", "recuperadora"}), False),
)

STATUS_RANK = {
    "en_riesgo": 0,
    "pausado": 1,
    "en_produccion": 2,
    "en_cola": 3,
    "completado": 4,
    "sin_datos": 5,
}

ACTION_PRIORITY_RANK = {
    "alta": 0,
    "media": 1,
    "baja": 2,
    "ninguna": 3,
}


def build_orders(
    records: list[ProductionRecord],
    configured_plans: list[ProductionOrderPlan],
    now: datetime,
    *,
    quantity_mode: str = "cumulative",
    shift_schedule: str = "",
    stalled_after_hours: int = 6,
) -> list[ProductionOrder]:
    plans = _merge_configured_and_record_plans(configured_plans, records)
    plant_last_signal = max((record.timestamp for record in records), default=None)
    line_orders = [
        _build_order(plan, records, now, quantity_mode, shift_schedule, stalled_after_hours, plant_last_signal)
        for plan in plans
    ]
    orders = _group_commercial_orders(line_orders)
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
            committed_date=record.order_committed_date,
            sale_price_eur_m2=record.order_sale_price_eur_m2,
            cost_price_eur_m2=record.order_cost_price_eur_m2,
            currency_code=record.order_currency_code or "EUR",
            incoterm=record.order_incoterm,
            destination=record.order_destination,
            material_code=record.material_code,
            material_name=record.material_name,
            material_family=record.material_family,
            linked_lot_ids=[record.lot_id] if record.lot_id else [],
            linked_pallet_ids=[pallet for pallet in [record.pallet_in, record.pallet_out] if pallet],
        )
    return list(plans_by_id.values())


def _build_order(
    plan: ProductionOrderPlan,
    all_records: list[ProductionRecord],
    now: datetime,
    quantity_mode: str,
    shift_schedule: str,
    stalled_after_hours: int,
    plant_last_signal: datetime | None,
) -> ProductionOrder:
    order_records = _records_for_plan(plan, all_records)
    linked_lots = _unique([*plan.linked_lot_ids, *(record.lot_id for record in order_records)])
    linked_pallets = _unique(
        [
            *plan.linked_pallet_ids,
            *(record.pallet_in for record in order_records),
            *(record.pallet_out for record in order_records),
        ]
    )

    stages = _build_stages(order_records, plan, quantity_mode)
    produced_quantity = _progress_quantity(stages, plan.unit)
    percent = min(100.0, round((produced_quantity / plan.planned_quantity) * 100, 1)) if plan.planned_quantity else 0.0
    latest = max(order_records, key=lambda item: item.timestamp, default=None)
    incidence_count = sum(1 for record in order_records if record.event_code or record.incidence_code)
    open_issue = _open_issue_record(order_records)
    detected_pause_reason = _pause_reason(latest, now, plant_last_signal, shift_schedule, stalled_after_hours)
    eta = _estimate_completion(order_records, produced_quantity, plan.planned_quantity, percent, now)
    status = _order_status(order_records, produced_quantity, percent, detected_pause_reason, open_issue, plan.committed_date, eta, now)
    pause_reason = detected_pause_reason if status == "pausado" else None
    pause_owner = _pause_owner(latest) if pause_reason else None
    next_action = _next_action(status, latest, pause_reason, pause_owner, open_issue, plan.committed_date, eta, now)
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
        currency_code=plan.currency_code,
        incoterm=plan.incoterm,
        destination=plan.destination,
        material_code=plan.material_code or _common_text(record.material_code for record in order_records),
        material_name=plan.material_name or _common_text(record.material_name for record in order_records),
        material_family=plan.material_family or _common_text(record.material_family for record in order_records),
        committed_date=plan.committed_date,
        estimated_completion_at=eta,
        last_activity_at=latest.timestamp if latest else None,
        active_machine=latest.machine_name if latest and status in {"en_produccion", "en_riesgo"} else None,
        last_machine_name=latest.machine_name if latest else None,
        current_operation=_operation_label(latest) if latest else None,
        incidence_count=incidence_count,
        pause_reason=pause_reason,
        pause_owner=pause_owner,
        next_action=next_action,
        linked_lot_ids=linked_lots,
        linked_pallet_ids=linked_pallets,
        stages=stages,
    )


def _group_commercial_orders(line_orders: list[ProductionOrder]) -> list[ProductionOrder]:
    grouped: dict[str, list[ProductionOrder]] = {}
    for order in line_orders:
        key = order.commercial_order_id or order.id
        grouped.setdefault(key, []).append(order)

    output: list[ProductionOrder] = []
    for key, lines in grouped.items():
        if len(lines) == 1 and not lines[0].commercial_order_id:
            output.append(lines[0])
            continue
        output.append(_build_commercial_order(key, lines))
    return output


def _build_commercial_order(order_id: str, line_orders: list[ProductionOrder]) -> ProductionOrder:
    ordered_lines = sorted(line_orders, key=lambda item: item.id)
    client = ordered_lines[0].client
    unit = _common_unit(line.unit for line in ordered_lines)
    planned_quantity = sum(line.planned_quantity for line in ordered_lines if line.unit.upper() == unit.upper())
    produced_quantity = sum(line.produced_quantity for line in ordered_lines if line.unit.upper() == unit.upper())
    percent = min(100.0, round((produced_quantity / planned_quantity) * 100, 1)) if planned_quantity else 0.0
    currency_code = _common_currency(line.currency_code for line in ordered_lines)
    sale_amount = _sum_optional(line.sale_amount_eur for line in ordered_lines) if currency_code != "MIX" else None
    cost_amount = _sum_optional(line.cost_amount_eur for line in ordered_lines) if currency_code != "MIX" else None
    margin_amount = round(sale_amount - cost_amount, 2) if sale_amount is not None and cost_amount is not None else None
    margin_percent = round((margin_amount / sale_amount) * 100, 1) if sale_amount and margin_amount is not None else None
    sale_price = round(sale_amount / planned_quantity, 2) if sale_amount is not None and planned_quantity else None
    cost_price = round(cost_amount / planned_quantity, 2) if cost_amount is not None and planned_quantity else None
    latest_line = max(ordered_lines, key=lambda item: item.last_activity_at or datetime.min, default=None)
    eta_values = [line.estimated_completion_at for line in ordered_lines if line.estimated_completion_at]
    committed_values = [line.committed_date for line in ordered_lines if line.committed_date]
    next_action = _select_next_action(ordered_lines)
    paused_line = next((line for line in ordered_lines if line.pause_reason), None)

    return ProductionOrder(
        id=order_id,
        commercial_order_id=order_id,
        title=client,
        description=_commercial_description(ordered_lines),
        client=client,
        production_status=_aggregate_status(ordered_lines, percent),
        percent_produced=percent,
        planned_quantity=planned_quantity,
        produced_quantity=round(produced_quantity, 3),
        unit=unit,
        sale_price_eur_m2=sale_price,
        cost_price_eur_m2=cost_price,
        sale_amount_eur=sale_amount,
        cost_amount_eur=cost_amount,
        margin_amount_eur=margin_amount,
        margin_percent=margin_percent,
        currency_code=currency_code,
        incoterm=_common_text(line.incoterm for line in ordered_lines),
        destination=_common_text(line.destination for line in ordered_lines),
        material_code=_common_text(line.material_code for line in ordered_lines),
        material_name=_common_text(line.material_name for line in ordered_lines),
        material_family=_common_text(line.material_family for line in ordered_lines),
        committed_date=min(committed_values) if committed_values else None,
        estimated_completion_at=max(eta_values) if eta_values else None,
        last_activity_at=latest_line.last_activity_at if latest_line else None,
        active_machine=latest_line.active_machine if latest_line else None,
        last_machine_name=latest_line.last_machine_name if latest_line else None,
        current_operation=latest_line.current_operation if latest_line else None,
        incidence_count=sum(line.incidence_count for line in ordered_lines),
        pause_reason=paused_line.pause_reason if paused_line else None,
        pause_owner=paused_line.pause_owner if paused_line else None,
        next_action=next_action,
        linked_lot_ids=_unique(lot for line in ordered_lines for lot in line.linked_lot_ids),
        linked_pallet_ids=_unique(pallet for line in ordered_lines for pallet in line.linked_pallet_ids),
        stages=_aggregate_stages(ordered_lines, unit, planned_quantity),
        lines=[_line_from_order(line) for line in ordered_lines],
    )


def _line_from_order(order: ProductionOrder) -> ProductionOrderLine:
    return ProductionOrderLine(
        id=order.id,
        title=_clean_line_title(order.title),
        description=order.description,
        planned_quantity=order.planned_quantity,
        produced_quantity=order.produced_quantity,
        unit=order.unit,
        percent_produced=order.percent_produced,
        sale_price_eur_m2=order.sale_price_eur_m2,
        cost_price_eur_m2=order.cost_price_eur_m2,
        sale_amount_eur=order.sale_amount_eur,
        cost_amount_eur=order.cost_amount_eur,
        margin_amount_eur=order.margin_amount_eur,
        margin_percent=order.margin_percent,
        currency_code=order.currency_code,
        material_code=order.material_code,
        material_name=order.material_name,
        material_family=order.material_family,
        linked_lot_ids=order.linked_lot_ids,
        linked_pallet_ids=order.linked_pallet_ids,
    )


def _commercial_description(line_orders: list[ProductionOrder]) -> str:
    count = len(line_orders)
    if count == 1:
        return line_orders[0].description or "Pedido con una partida."
    return f"Pedido con {count} partidas de fabricacion segmentadas."


def _clean_line_title(title: str) -> str:
    if title.lower().startswith("linea ") and " - " in title:
        return title.split(" - ", 1)[1]
    return title


def _aggregate_status(line_orders: list[ProductionOrder], percent: float) -> str:
    statuses = {line.production_status for line in line_orders}
    if percent >= 99.5 or statuses == {"completado"}:
        return "completado"
    for status in ["en_riesgo", "pausado", "en_produccion", "en_cola", "sin_datos"]:
        if status in statuses:
            return status
    return "sin_datos"


def _aggregate_stages(line_orders: list[ProductionOrder], unit: str, planned_quantity: float) -> list[OrderStage]:
    stages: list[OrderStage] = []
    for rule in STAGE_RULES:
        line_stages = [stage for line in line_orders for stage in line.stages if stage.label == rule.label]
        produced = sum(stage.produced_quantity for stage in line_stages if stage.unit.upper() == unit.upper())
        latest = max((stage.last_record_at for stage in line_stages if stage.last_record_at), default=None)
        statuses = {stage.status for stage in line_stages}
        if "active" in statuses:
            status = "active"
        elif "blocked" in statuses:
            status = "blocked"
        elif statuses and statuses <= {"done", "pending"} and produced >= planned_quantity * 0.98:
            status = "done"
        elif "done" in statuses and produced > 0:
            status = "active"
        else:
            status = "pending"
        stages.append(
            OrderStage(
                label=rule.label,
                status=status,
                produced_quantity=round(produced, 3),
                unit=unit,
                machine_names=_unique(machine for stage in line_stages for machine in stage.machine_names),
                last_record_at=latest,
            )
        )
    return stages


def _common_unit(units: Iterable[str]) -> str:
    unit_list = [unit for unit in units if unit]
    if not unit_list:
        return "UN"
    first = unit_list[0]
    if all(unit.upper() == first.upper() for unit in unit_list):
        return first
    return "MIX"


def _common_currency(currencies: Iterable[str | None]) -> str:
    values = [currency.upper() for currency in currencies if currency]
    if not values:
        return "EUR"
    first = values[0]
    if all(value == first for value in values):
        return first
    return "MIX"


def _common_text(values: Iterable[str | None]) -> str | None:
    collected = [value for value in values if value]
    if not collected:
        return None
    first = collected[0]
    if all(value.lower() == first.lower() for value in collected):
        return first
    return "Varios"


def _sum_optional(values: Iterable[float | None]) -> float | None:
    collected = [value for value in values if value is not None]
    if not collected:
        return None
    return round(sum(collected), 2)


def _records_for_plan(plan: ProductionOrderPlan, records: list[ProductionRecord]) -> list[ProductionRecord]:
    lot_ids = {item.lower() for item in plan.linked_lot_ids}
    pallet_ids = {item.lower() for item in plan.linked_pallet_ids}
    matches: list[ProductionRecord] = []
    for record in records:
        pallets = {item.lower() for item in [record.pallet_in, record.pallet_out] if item}
        if record.order_id == plan.id:
            matches.append(record)
        elif record.order_id:
            continue
        elif record.lot_id and record.lot_id.lower() in lot_ids:
            matches.append(record)
        elif pallets & pallet_ids:
            matches.append(record)
    return sorted(matches, key=lambda item: item.timestamp)


def _build_stages(records: list[ProductionRecord], plan: ProductionOrderPlan, quantity_mode: str) -> list[OrderStage]:
    groups = [_records_for_stage(records, rule.machine_ids) for rule in STAGE_RULES]
    furthest_index = max((idx for idx, group in enumerate(groups) if group), default=-1)
    stages: list[OrderStage] = []
    for idx, (rule, group) in enumerate(zip(STAGE_RULES, groups)):
        produced = _stage_quantity(group, quantity_mode)
        latest = max(group, key=lambda item: item.timestamp, default=None)
        stage_unit = latest.unit if latest else plan.unit
        if not group:
            status = "pending"
        elif idx < furthest_index:
            status = "done"
        elif produced >= plan.planned_quantity * 0.98 and stage_unit.upper() == plan.unit.upper():
            # Solo se da por cubierta una fase comparando cantidades en la
            # misma unidad: m3 de aserrado no son los m2 del pedido.
            status = "done"
        else:
            status = "active"
        stages.append(
            OrderStage(
                label=rule.label,
                status=status,
                produced_quantity=round(produced, 3),
                unit=stage_unit,
                machine_names=_unique(record.machine_name for record in group),
                last_record_at=latest.timestamp if latest else None,
            )
        )
    return stages


def _records_for_stage(records: list[ProductionRecord], machine_ids: frozenset[str]) -> list[ProductionRecord]:
    return [record for record in records if record.machine_id in machine_ids]


def _progress_quantity(stages: list[OrderStage], unit: str) -> float:
    for stage, rule in reversed(list(zip(stages, STAGE_RULES))):
        if not rule.counts_for_progress:
            continue
        if stage.produced_quantity > 0 and stage.unit.upper() == unit.upper():
            return stage.produced_quantity
    return 0.0


def _stage_quantity(records: list[ProductionRecord], quantity_mode: str) -> float:
    if not records:
        return 0.0
    if quantity_mode == "incremental":
        return sum(record.quantity for record in records)
    return max(record.quantity for record in records)


def _order_status(
    records: list[ProductionRecord],
    produced_quantity: float,
    percent: float,
    pause_reason: str | None,
    open_issue: ProductionRecord | None,
    committed_date: datetime | None,
    eta: datetime | None,
    now: datetime,
) -> str:
    if not records:
        return "en_cola"
    if produced_quantity > 0 and percent >= 99.5:
        return "completado"
    if pause_reason:
        return "pausado"
    if open_issue is not None:
        return "en_riesgo"
    if committed_date and now > committed_date:
        return "en_riesgo"
    if committed_date and eta and eta > committed_date:
        return "en_riesgo"
    return "en_produccion"


def _open_issue_record(records: list[ProductionRecord]) -> ProductionRecord | None:
    """Incidencia abierta: el ultimo parte de una maquina es un evento/incidencia.

    Si la maquina volvio a registrar partes normales despues, el aviso se
    considera resuelto y no mantiene el pedido en riesgo indefinidamente.
    """
    latest_by_machine: dict[str, ProductionRecord] = {}
    for record in sorted(records, key=lambda item: item.timestamp):
        latest_by_machine[record.machine_id] = record
    open_issues = [record for record in latest_by_machine.values() if record.event_code or record.incidence_code]
    return max(open_issues, key=lambda item: item.timestamp, default=None)


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


def _pause_reason(
    latest: ProductionRecord | None,
    now: datetime,
    plant_last_signal: datetime | None,
    shift_schedule: str,
    stalled_after_hours: int,
) -> str | None:
    if not latest:
        return None
    issue = _issue_label(latest)
    if issue and _looks_like_pause(issue):
        return f"Parada registrada: {issue}."
    threshold = timedelta(hours=stalled_after_hours)
    if now - latest.timestamp <= threshold:
        return None
    # El silencio solo es parada si la fabrica siguio registrando actividad
    # (otras maquinas avanzan y este pedido no) o si estamos dentro de un
    # turno configurado; de noche o en fin de semana no es una pausa real.
    if plant_last_signal and plant_last_signal - latest.timestamp > threshold:
        if issue:
            return f"Sin registros del pedido con la planta activa tras incidencia {issue}."
        return f"Sin registros del pedido durante mas de {stalled_after_hours} horas con la planta activa."
    if is_within_working_hours(shift_schedule, now):
        return f"Sin registros de maquina durante mas de {stalled_after_hours} horas en horario de turno."
    return None


def _pause_owner(latest: ProductionRecord | None) -> str:
    if latest and latest.operators:
        return f"Operario {'/'.join(latest.operators)}"
    return "Jefe de turno"


def _next_action(
    status: str,
    latest: ProductionRecord | None,
    pause_reason: str | None,
    pause_owner: str | None,
    open_issue: ProductionRecord | None,
    committed_date: datetime | None,
    eta: datetime | None,
    now: datetime,
) -> NextAction:
    source = latest or open_issue
    if status == "pausado":
        issue_source = open_issue or latest
        return _action_from_record(
            priority="alta",
            text="Resolver parada antes de reanudar",
            reason=pause_reason,
            owner=pause_owner or "Jefe de turno",
            record=issue_source,
            fallback_record=source,
        )
    if open_issue:
        return _action_from_record(
            priority="alta",
            text="Revisar incidencia o codigo pendiente",
            reason=f"Codigo pendiente: {_issue_label(open_issue)}.",
            owner="Produccion / INDASEL",
            record=open_issue,
            fallback_record=source,
        )
    if status == "en_riesgo" and committed_date:
        if now > committed_date:
            reason = "La fecha comprometida con el cliente ya ha vencido."
        else:
            reason = "La finalizacion estimada supera la fecha comprometida."
        return NextAction(
            priority="alta",
            text="Revisar compromiso de entrega",
            reason=reason,
            owner="Planificacion / Comercial",
            machine_name=source.machine_name if source else None,
            operation=_operation_label(source),
            lot_id=source.lot_id if source else None,
            pallet_id=_pallet_id(source),
            last_signal_at=source.timestamp if source else None,
        )
    if status == "en_cola":
        return NextAction(
            priority="media",
            text="Asignar lote y primera maquina",
            reason="El pedido aun no tiene registros de maquina.",
            owner="Planificacion",
        )
    if status == "completado":
        return NextAction(
            priority="baja",
            text="Cerrar fabricacion y preparar expedicion",
            reason="La cantidad producida cubre el pedido planificado.",
            owner="Administracion / Expediciones",
            machine_name=source.machine_name if source else None,
            operation=_operation_label(source),
            lot_id=source.lot_id if source else None,
            pallet_id=_pallet_id(source),
            last_signal_at=source.timestamp if source else None,
        )
    return NextAction(
        priority="baja",
        text="Continuar seguimiento de produccion",
        reason="No hay parada ni incidencia abierta en los registros cargados.",
        owner="Produccion",
        machine_name=source.machine_name if source else None,
        operation=_operation_label(source),
        lot_id=source.lot_id if source else None,
        pallet_id=_pallet_id(source),
        last_signal_at=source.timestamp if source else None,
    )


def _action_from_record(
    priority: str,
    text: str,
    reason: str | None,
    owner: str,
    record: ProductionRecord | None,
    fallback_record: ProductionRecord | None,
) -> NextAction:
    source = record or fallback_record
    return NextAction(
        priority=priority,
        text=text,
        reason=reason,
        owner=owner,
        machine_name=source.machine_name if source else None,
        operation=_operation_label(source),
        lot_id=source.lot_id if source else None,
        pallet_id=_pallet_id(source),
        incidence_code=_issue_code(record),
        incidence_label=_issue_label(record),
        last_signal_at=source.timestamp if source else None,
    )


def _select_next_action(orders: list[ProductionOrder]) -> NextAction | None:
    actions = [order.next_action for order in orders if order.next_action]
    if not actions:
        return None
    return sorted(actions, key=lambda action: (ACTION_PRIORITY_RANK[action.priority], -_datetime_score(action.last_signal_at)))[0]


def _datetime_score(value: datetime | None) -> float:
    if not value:
        return 0
    return value.toordinal() * 86400 + value.hour * 3600 + value.minute * 60 + value.second


def _issue_code(record: ProductionRecord | None) -> str | None:
    if not record:
        return None
    return record.incidence_code or record.event_code


def _issue_label(record: ProductionRecord | None) -> str | None:
    if not record:
        return None
    return record.incidence_label or record.event_label or record.incidence_code or record.event_code


def _looks_like_pause(value: str) -> bool:
    normalized = value.lower()
    return any(token in normalized for token in ["parada", "paro", "stop", "pausa"])


def _pallet_id(record: ProductionRecord | None) -> str | None:
    if not record:
        return None
    return record.pallet_out or record.pallet_in


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
