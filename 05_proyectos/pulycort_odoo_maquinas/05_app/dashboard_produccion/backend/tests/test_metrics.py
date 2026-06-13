from __future__ import annotations

import unittest
from datetime import datetime

from app.metrics import area_m2, build_kpis, volume_m3, with_consumption_deltas
from app.models import Dimensions, ProductionRecord


def record(record_id: str, total: float, minute: int = 0) -> ProductionRecord:
    return ProductionRecord(
        id=record_id,
        machine_id="telar_1",
        machine_name="Telar 1",
        timestamp=datetime(2026, 6, 10, 8, minute),
        dimensions=Dimensions(length_mm=1000, height_mm=500, thickness_mm=20),
        quantity=2,
        unit="UN",
        consumption_kwh_total=total,
    )


class MetricsTests(unittest.TestCase):
    def test_area_and_volume(self) -> None:
        item = record("a", 10)
        self.assertEqual(area_m2(item), 1.0)
        self.assertEqual(volume_m3(item), 0.02)

    def test_area_uses_normalized_m2_quantity(self) -> None:
        item = record("a", 10).model_copy(update={"quantity": 125, "unit": "M2"})
        self.assertEqual(area_m2(item), 125)
        self.assertEqual(volume_m3(item), 2.5)

    def test_m3_records_do_not_fake_area_from_block_dimensions(self) -> None:
        item = record("a", 10).model_copy(update={"quantity": 13.3, "unit": "M3"})
        self.assertEqual(area_m2(item), 0.0)
        self.assertEqual(volume_m3(item), 13.3)

    def test_consumption_delta_handles_accumulative_counter(self) -> None:
        output = with_consumption_deltas([record("b", 15, 30), record("a", 10, 0)])
        by_id = {item.id: item for item in output}
        # Sin lectura previa el delta es desconocido, no cero.
        self.assertIsNone(by_id["a"].consumption_kwh_delta)
        self.assertEqual(by_id["b"].consumption_kwh_delta, 5.0)

    def test_consumption_delta_handles_counter_reset(self) -> None:
        output = with_consumption_deltas([record("b", 2, 30), record("a", 10, 0)])
        by_id = {item.id: item for item in output}
        self.assertEqual(by_id["b"].consumption_kwh_delta, 2.0)

    def test_summary_machine_kpi_names_records_not_active_state(self) -> None:
        kpis = build_kpis([record("a", 10), record("b", 15, 30)], datetime(2026, 6, 10, 9, 0))

        self.assertEqual(kpis[0].label, "Maquinas con registros")
        self.assertIn("ventana seleccionada", kpis[0].help)

    def test_sawn_volume_kpi_only_counts_m3_machines(self) -> None:
        sawing = record("a", 10).model_copy(update={"quantity": 13.3, "unit": "M3"})
        polishing = record("b", 15, 30).model_copy(update={"quantity": 100, "unit": "M2", "machine_id": "pulidora_losas"})
        kpis = build_kpis([sawing, polishing], datetime(2026, 6, 10, 9, 0))
        volume_kpi = next(kpi for kpi in kpis if kpi.label == "Volumen aserrado")
        # La pulidora no debe sumar volumen aunque tenga grueso disponible.
        self.assertEqual(volume_kpi.value, 13.3)


if __name__ == "__main__":
    unittest.main()
