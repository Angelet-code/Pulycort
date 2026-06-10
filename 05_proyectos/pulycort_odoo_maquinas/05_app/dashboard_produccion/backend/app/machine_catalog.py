from __future__ import annotations

from app.models import MachineDefinition


MACHINES: list[MachineDefinition] = [
    MachineDefinition(id="telar_1", name="Telar 1", family="TELAR", unit="M3", sort_order=10),
    MachineDefinition(id="telar_2", name="Telar 2", family="TELAR", unit="M3", sort_order=20),
    MachineDefinition(id="telar_3", name="Telar 3", family="TELAR", unit="M3", sort_order=30),
    MachineDefinition(id="telar_4", name="Telar 4", family="TELAR", unit="M3", sort_order=40),
    MachineDefinition(id="reforzadora_tablas", name="Reforzadora tablas", family="REFORZADORA", unit="M2", sort_order=50),
    MachineDefinition(id="pulidora_tablas", name="Pulidora tablas", family="PULIDORA", unit="M2", sort_order=60),
    MachineDefinition(id="pulidora_losas", name="Pulidora losas", family="PULIDORA", unit="M2", sort_order=70),
    MachineDefinition(id="disco_puente_gomez", name="Disco Puente Gomez", family="DISCO PUENTE", unit="M2", sort_order=80),
]


def machine_by_id() -> dict[str, MachineDefinition]:
    return {machine.id: machine for machine in MACHINES}

