from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.mapping_actions import MappingActionStore
from app.models import UnknownMappingActionUpdate


class MappingActionStoreTests(unittest.TestCase):
    def test_update_and_read_mapping_action(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = MappingActionStore(Path(directory) / "mapping_actions.json")
            store.update(
                UnknownMappingActionUpdate(
                    kind="event",
                    machine_id="pulidora_losas",
                    code="4",
                    action="preguntar_a_indasel",
                    note="Confirmar si detiene produccion.",
                )
            )

            state = store.get("event", "pulidora_losas", "4")

        self.assertIsNotNone(state)
        self.assertEqual(state["action"], "preguntar_a_indasel")
        self.assertEqual(state["note"], "Confirmar si detiene produccion.")
        self.assertIsNotNone(state["updated_at"])


if __name__ == "__main__":
    unittest.main()
