from __future__ import annotations

import unittest
from datetime import datetime, timedelta

from app.models import ProductionOrderPlan, ProductionRecord
from app.order_tracking import build_orders


def record(
    record_id: str,
    machine_id: str,
    machine_name: str,
    minute: int,
    quantity: float,
    event_code: str | None = None,
    order_id: str = "PUL-TEST",
    unit: str = "M2",
) -> ProductionRecord:
    return ProductionRecord(
        id=record_id,
        order_id=order_id,
        machine_id=machine_id,
        machine_name=machine_name,
        timestamp=datetime(2026, 6, 10, 8, 0) + timedelta(minutes=minute),
        quantity=quantity,
        unit=unit,
        event_code=event_code,
    )


def make_plan(**overrides) -> ProductionOrderPlan:
    values = {
        "id": "PUL-TEST",
        "title": "Pedido prueba",
        "client": "Cliente",
        "planned_quantity": 100,
        "unit": "M2",
    }
    values.update(overrides)
    return ProductionOrderPlan(**values)


class OrderTrackingTests(unittest.TestCase):
    def test_progress_uses_furthest_stage_without_double_counting(self) -> None:
        plan = ProductionOrderPlan(
            id="PUL-TEST",
            title="Pedido prueba",
            client="Cliente",
            planned_quantity=100,
            unit="M2",
        )
        orders = build_orders(
            [
                record("a", "reforzadora_tablas", "Reforzadora tablas", 0, 100),
                record("b", "pulidora_losas", "Pulidora losas", 90, 80),
            ],
            [plan],
            datetime(2026, 6, 10, 10, 0),
        )

        self.assertEqual(orders[0].produced_quantity, 80)
        self.assertEqual(orders[0].percent_produced, 80)

    def test_event_generates_next_action(self) -> None:
        plan = ProductionOrderPlan(
            id="PUL-TEST",
            title="Pedido prueba",
            client="Cliente",
            planned_quantity=100,
            unit="M2",
        )
        orders = build_orders(
            [record("a", "pulidora_losas", "Pulidora losas", 0, 80, event_code="4")],
            [plan],
            datetime(2026, 6, 10, 10, 0),
        )

        self.assertEqual(orders[0].production_status, "en_riesgo")
        self.assertEqual(orders[0].incidence_count, 1)
        self.assertIsNotNone(orders[0].next_action)
        self.assertEqual(orders[0].next_action.priority, "alta")
        self.assertEqual(orders[0].next_action.incidence_code, "4")

    def test_paused_order_within_shift_without_signal(self) -> None:
        orders = build_orders(
            [record("a", "pulidora_losas", "Pulidora losas", 0, 80)],
            [make_plan()],
            datetime(2026, 6, 10, 16, 30),
            shift_schedule="manana=06:00-14:00,tarde=14:00-22:00",
        )

        self.assertEqual(orders[0].production_status, "pausado")
        self.assertEqual(orders[0].pause_reason, "Sin registros de maquina durante mas de 6 horas en horario de turno.")
        self.assertEqual(orders[0].pause_owner, "Jefe de turno")
        self.assertEqual(orders[0].last_machine_name, "Pulidora losas")
        self.assertIsNone(orders[0].active_machine)
        self.assertEqual(orders[0].next_action.text, "Resolver parada antes de reanudar")

    def test_overnight_silence_without_schedule_is_not_pause(self) -> None:
        orders = build_orders(
            [record("a", "pulidora_losas", "Pulidora losas", 0, 80)],
            [make_plan()],
            datetime(2026, 6, 10, 23, 0),
        )

        # Sin turnos configurados y con la planta parada, el silencio nocturno
        # no debe convertir el pedido en una falsa alarma de pausa.
        self.assertEqual(orders[0].production_status, "en_produccion")
        self.assertIsNone(orders[0].pause_reason)

    def test_stalled_order_while_plant_active_is_paused(self) -> None:
        orders = build_orders(
            [
                record("a", "pulidora_losas", "Pulidora losas", 0, 80),
                record("b", "telar_1", "Telar 1", 420, 5, order_id="OTRO"),
            ],
            [make_plan()],
            datetime(2026, 6, 10, 15, 30),
        )

        target = next(order for order in orders if order.id == "PUL-TEST")
        self.assertEqual(target.production_status, "pausado")
        self.assertIn("planta activa", target.pause_reason)

    def test_resumed_machine_clears_open_issue_risk(self) -> None:
        orders = build_orders(
            [
                record("a", "pulidora_losas", "Pulidora losas", 0, 60, event_code="4"),
                record("b", "pulidora_losas", "Pulidora losas", 30, 80),
            ],
            [make_plan()],
            datetime(2026, 6, 10, 10, 0),
        )

        self.assertEqual(orders[0].production_status, "en_produccion")
        self.assertEqual(orders[0].incidence_count, 1)

    def test_overdue_committed_date_marks_risk(self) -> None:
        orders = build_orders(
            [record("a", "pulidora_losas", "Pulidora losas", 0, 50)],
            [make_plan(committed_date=datetime(2026, 6, 9, 17, 0))],
            datetime(2026, 6, 10, 10, 0),
        )

        self.assertEqual(orders[0].production_status, "en_riesgo")
        self.assertEqual(orders[0].next_action.text, "Revisar compromiso de entrega")
        self.assertEqual(orders[0].committed_date, datetime(2026, 6, 9, 17, 0))

    def test_m3_sawing_does_not_count_as_m2_progress(self) -> None:
        orders = build_orders(
            [record("a", "telar_1", "Telar 1", 0, 4.5, unit="M3")],
            [make_plan()],
            datetime(2026, 6, 10, 10, 0),
        )

        self.assertEqual(orders[0].produced_quantity, 0)
        self.assertEqual(orders[0].percent_produced, 0)
        self.assertEqual(orders[0].production_status, "en_produccion")
        sawing = next(stage for stage in orders[0].stages if stage.label == "Aserrado bloque")
        self.assertEqual(sawing.status, "active")
        self.assertEqual(sawing.produced_quantity, 4.5)
        self.assertEqual(sawing.unit, "M3")

    def test_workshop_stage_does_not_override_progress(self) -> None:
        orders = build_orders(
            [
                record("a", "pulidora_losas", "Pulidora losas", 0, 80),
                record("b", "taller", "Taller", 30, 5),
            ],
            [make_plan()],
            datetime(2026, 6, 10, 10, 0),
        )

        # Un trabajo pequeno de taller no debe sustituir el avance real.
        self.assertEqual(orders[0].produced_quantity, 80)

    def test_incremental_quantity_mode_sums_parts(self) -> None:
        records = [
            record("a", "pulidora_losas", "Pulidora losas", 0, 30),
            record("b", "pulidora_losas", "Pulidora losas", 30, 40),
        ]
        cumulative = build_orders(records, [make_plan()], datetime(2026, 6, 10, 10, 0))
        incremental = build_orders(records, [make_plan()], datetime(2026, 6, 10, 10, 0), quantity_mode="incremental")

        self.assertEqual(cumulative[0].produced_quantity, 40)
        self.assertEqual(incremental[0].produced_quantity, 70)

    def test_order_without_machine_records_is_queued(self) -> None:
        plan = ProductionOrderPlan(
            id="PUL-TEST",
            title="Pedido prueba",
            client="Cliente",
            planned_quantity=100,
            unit="M2",
        )
        orders = build_orders([], [plan], datetime(2026, 6, 10, 10, 0))

        self.assertEqual(orders[0].production_status, "en_cola")
        self.assertEqual(orders[0].percent_produced, 0)

    def test_order_includes_commercial_amounts(self) -> None:
        plan = ProductionOrderPlan(
            id="PUL-TEST",
            title="Pedido prueba",
            client="Cliente",
            planned_quantity=100,
            unit="M2",
            sale_price_eur_m2=50,
            cost_price_eur_m2=30,
        )
        orders = build_orders([], [plan], datetime(2026, 6, 10, 10, 0))

        self.assertEqual(orders[0].sale_amount_eur, 5000)
        self.assertEqual(orders[0].cost_amount_eur, 3000)
        self.assertEqual(orders[0].margin_amount_eur, 2000)
        self.assertEqual(orders[0].margin_percent, 40)
        self.assertEqual(orders[0].currency_code, "EUR")

    def test_commercial_order_groups_multiple_lines(self) -> None:
        plans = [
            ProductionOrderPlan(
                id="AC-L1",
                commercial_order_id="AC-ORDER",
                title="Linea 1 - Losas Crema Marfil 60 x 30 x 2",
                client="Arabia Construction",
                planned_quantity=100,
                unit="M2",
                sale_price_eur_m2=40,
                cost_price_eur_m2=25,
                currency_code="EUR",
                incoterm="CFR",
                destination="Riad, Arabia Saudita",
            ),
            ProductionOrderPlan(
                id="AC-L2",
                commercial_order_id="AC-ORDER",
                title="Linea 2 - Losas Negro Marquina 120 x 60 x 2",
                client="Arabia Construction",
                planned_quantity=200,
                unit="M2",
                sale_price_eur_m2=80,
                cost_price_eur_m2=50,
                currency_code="EUR",
                incoterm="CFR",
                destination="Riad, Arabia Saudita",
            ),
        ]
        orders = build_orders(
            [
                record("a", "pulidora_losas", "Pulidora losas", 0, 60, order_id="AC-L1"),
                record("b", "pulidora_losas", "Pulidora losas", 30, 120, order_id="AC-L2"),
            ],
            plans,
            datetime(2026, 6, 10, 10, 0),
        )

        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0].id, "AC-ORDER")
        self.assertEqual(orders[0].title, "Arabia Construction")
        self.assertEqual(orders[0].planned_quantity, 300)
        self.assertEqual(orders[0].produced_quantity, 180)
        self.assertEqual(orders[0].percent_produced, 60)
        self.assertEqual(orders[0].sale_amount_eur, 20000)
        self.assertEqual(orders[0].currency_code, "EUR")
        self.assertEqual(orders[0].incoterm, "CFR")
        self.assertEqual(orders[0].destination, "Riad, Arabia Saudita")
        self.assertEqual(len(orders[0].lines), 2)
        self.assertEqual(orders[0].description, "Pedido con 2 partidas de fabricacion segmentadas.")
        self.assertEqual(orders[0].lines[0].title, "Losas Crema Marfil 60 x 30 x 2")

    def test_commercial_order_does_not_sum_mixed_currencies(self) -> None:
        plans = [
            ProductionOrderPlan(
                id="MIX-L1",
                commercial_order_id="MIX-ORDER",
                title="Losa nacional",
                client="Cliente export",
                planned_quantity=100,
                unit="M2",
                sale_price_eur_m2=40,
                cost_price_eur_m2=25,
                currency_code="EUR",
            ),
            ProductionOrderPlan(
                id="MIX-L2",
                commercial_order_id="MIX-ORDER",
                title="Losa export",
                client="Cliente export",
                planned_quantity=100,
                unit="M2",
                sale_price_eur_m2=55,
                cost_price_eur_m2=35,
                currency_code="USD",
            ),
        ]
        orders = build_orders([], plans, datetime(2026, 6, 10, 10, 0))

        self.assertEqual(orders[0].currency_code, "MIX")
        self.assertIsNone(orders[0].sale_amount_eur)
        self.assertIsNone(orders[0].margin_amount_eur)


if __name__ == "__main__":
    unittest.main()
