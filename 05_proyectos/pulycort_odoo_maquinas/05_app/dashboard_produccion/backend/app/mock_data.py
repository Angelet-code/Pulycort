from __future__ import annotations

from datetime import datetime, time, timedelta

from app.models import Dimensions, ProductionOrderPlan, ProductionRecord


MATERIALS = {
    "100": ("CREMA MARFIL", "801 MARMOLES"),
    "920": ("NEGRO MARQUINA", "801 MARMOLES"),
    "205": ("TRAVERTINO ROMANO", "806 TRAVERTINOS"),
    "701": ("GRIS SAN VICENTE", "803 CALIZAS"),
}


DEMO_ORDER_PLANS = [
    ProductionOrderPlan(
        id="AC-2026-1048-01",
        commercial_order_id="AC-2026-1048",
        title="Linea 1 - Losas Crema Marfil 60 x 30 x 2",
        description="Arabia Construction: 1.000 m2 de losa 60 x 30 x 2 cm en Crema Marfil.",
        client="Arabia Construction",
        planned_quantity=1000,
        unit="M2",
        sale_price_eur_m2=42.5,
        cost_price_eur_m2=27.8,
        linked_lot_ids=["CM-48120", "CM-48121"],
        linked_pallet_ids=["AC1048-60-001", "AC1048-60-002"],
    ),
    ProductionOrderPlan(
        id="AC-2026-1048-02",
        commercial_order_id="AC-2026-1048",
        title="Linea 2 - Losas Crema Marfil 30 x 30 x 2",
        description="Arabia Construction: 300 m2 de losa 30 x 30 x 2 cm en Crema Marfil.",
        client="Arabia Construction",
        planned_quantity=300,
        unit="M2",
        sale_price_eur_m2=39.0,
        cost_price_eur_m2=25.4,
        linked_lot_ids=["CM-48120", "CM-48122"],
        linked_pallet_ids=["AC1048-30-001"],
    ),
    ProductionOrderPlan(
        id="AC-2026-1048-03",
        commercial_order_id="AC-2026-1048",
        title="Linea 3 - Losas Negro Marquina 120 x 60 x 2",
        description="Arabia Construction: 2.000 m2 de losa 120 x 60 x 2 cm en Negro Marquina.",
        client="Arabia Construction",
        planned_quantity=2000,
        unit="M2",
        sale_price_eur_m2=89.0,
        cost_price_eur_m2=58.5,
        linked_lot_ids=["NM-39014", "NM-39015"],
        linked_pallet_ids=["AC1048-NM-001", "AC1048-NM-002", "AC1048-NM-003"],
    ),
]


def make_demo_order_plans() -> list[ProductionOrderPlan]:
    return DEMO_ORDER_PLANS.copy()


def make_demo_records(now: datetime | None = None) -> list[ProductionRecord]:
    current = now or datetime.now()
    base = datetime.combine(current.date(), time(hour=6, minute=15))
    rows = [
        ("AC-2026-1048-01", "telar_1", "Telar 1", 0, "176", "69", "CM-48120", None, None, "100", 2800, 1700, 20, 520, "M2", "3", "Aserrado 2 cm", None, None, 1180.0, None, None),
        ("AC-2026-1048-03", "telar_3", "Telar 3", 45, "88", "34", "NM-39014", None, None, "920", 2950, 1650, 20, 880, "M2", "3", "Aserrado 2 cm", None, None, 980.0, None, None),
        ("AC-2026-1048-01", "telar_2", "Telar 2", 90, "176", "42", "CM-48121", None, None, "100", 2750, 1650, 20, 1000, "M2", "3", "Aserrado 2 cm", None, None, 1294.6, None, None),
        ("AC-2026-1048-02", "reforzadora_tablas", "Reforzadora tablas", 130, "42", "176", "CM-48120", None, None, "100", 2600, 1500, 20, 300, "M2", "1", "Reforzado poliester", "1", "Reforzado poliester", 0.0, None, None),
        ("AC-2026-1048-03", "telar_4", "Telar 4", 165, "34", "69", "NM-39015", None, None, "920", 2900, 1600, 20, 1650, "M2", "3", "Aserrado 2 cm", None, None, 1044.8, None, None),
        ("AC-2026-1048-01", "reforzadora_tablas", "Reforzadora tablas", 205, "42", "176", "CM-48121", None, None, "100", 2750, 1650, 20, 900, "M2", "1", "Reforzado poliester", "1", "Reforzado poliester", 47.8, None, None),
        ("AC-2026-1048-03", "reforzadora_tablas", "Reforzadora tablas", 250, "42", "88", "NM-39014", None, None, "920", 2950, 1650, 20, 1100, "M2", "1", "Reforzado poliester", "1", "Reforzado poliester", 96.2, None, None),
        ("AC-2026-1048-01", "pulidora_tablas", "Pulidora tablas", 290, "34", "", "CM-48121", None, None, "100", 2750, 1650, 20, 860, "M2", "203", "Pulido tabla", "203", "Pulido", 305.0, None, None),
        ("AC-2026-1048-02", "disco_puente_gomez", "Disco Puente Gomez", 330, "176", "69", "CM-48122", None, "AC1048-30-001", "100", 300, 300, 20, 300, "M2", "2", "Corte disco puente", None, None, 740.0, None, None),
        ("AC-2026-1048-03", "pulidora_tablas", "Pulidora tablas", 360, "34", "88", "NM-39015", None, None, "920", 2900, 1600, 20, 760, "M2", "203", "Pulido tabla", "203", "Pulido", 356.0, None, "12"),
        ("AC-2026-1048-01", "disco_puente_gomez", "Disco Puente Gomez", 405, "176", "69", "CM-48121", None, "AC1048-60-001", "100", 600, 300, 20, 760, "M2", "2", "Corte disco puente", None, None, 812.0, None, None),
        ("AC-2026-1048-02", "pulidora_losas", "Pulidora losas", 455, "176", "", None, "AC1048-30-001", "AC1048-30-001", "100", 300, 300, 20, 180, "M2", "203", "Pulido losa", "203", "Pulido", 0.0, None, None),
        ("AC-2026-1048-01", "pulidora_losas", "Pulidora losas", 505, "176", "", None, "AC1048-60-001", "AC1048-60-002", "100", 600, 300, 20, 640, "M2", "203", "Pulido losa", "203", "Pulido", 63.0, None, None),
        ("AC-2026-1048-01", "pulidora_losas", "Pulidora losas", 565, "176", "", None, "AC1048-60-001", "AC1048-60-002", "100", 600, 300, 20, 740, "M2", "203", "Pulido losa", "203", "Pulido", 94.4, "4", "Parada ajuste"),
    ]

    records: list[ProductionRecord] = []
    for idx, row in enumerate(rows, start=1):
        (
            order_id,
            machine_id,
            machine_name,
            minutes,
            operator_1,
            operator_2,
            lot_id,
            pallet_in,
            pallet_out,
            material_code,
            length,
            height,
            thickness,
            quantity,
            unit,
            operation_code,
            operation_label,
            finish_code,
            finish_label,
            consumption_total,
            event_code,
            incidence_code,
        ) = row
        material_name, material_family = MATERIALS[material_code]
        timestamp = base + timedelta(minutes=minutes)
        if timestamp > current:
            timestamp = current - timedelta(minutes=max(5, len(rows) - idx))
        operators = [operator for operator in [operator_1, operator_2] if operator]
        records.append(
            ProductionRecord(
                id=f"demo-{idx}",
                order_id=order_id,
                machine_id=machine_id,
                machine_name=machine_name,
                timestamp=timestamp,
                operators=operators,
                lot_id=lot_id,
                pallet_in=pallet_in,
                pallet_out=pallet_out,
                material_code=material_code,
                material_name=material_name,
                material_family=material_family,
                dimensions=Dimensions(length_mm=length, height_mm=height, thickness_mm=thickness),
                quantity=quantity,
                unit=unit,
                operation_code=operation_code,
                operation_label=operation_label,
                finish_code=finish_code,
                finish_label=finish_label,
                consumption_kwh_total=consumption_total,
                event_code=event_code,
                event_label=None if event_code else None,
                incidence_code=incidence_code,
                incidence_label=None if incidence_code else None,
                consumables={"malla_m2": 12.4 if machine_id == "reforzadora_tablas" else None},
                raw_payload={"source": "demo", "note": "Datos simulados hasta recibir acceso SQL TotWare/Indasel."},
            )
        )
    return records
