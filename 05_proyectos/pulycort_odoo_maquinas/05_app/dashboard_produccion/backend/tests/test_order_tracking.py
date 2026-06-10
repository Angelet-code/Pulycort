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
) -> ProductionRecord:
    return ProductionRecord(
        id=record_id,
        order_id="PUL-TEST",
        machine_id=machine_id,
        machine_name=machine_name,
        timestamp=datetime(2026, 6, 10, 8, 0) + timedelta(minutes=minute),
        quantity=quantity,
        unit="M2",
        event_code=event_code,
    )


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

    def test_event_keeps_order_producing_for_now(self) -> None:
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

        self.assertEqual(orders[0].production_status, "en_produccion")
        self.assertEqual(orders[0].incidence_count, 1)

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


if __name__ == "__main__":
    unittest.main()
