from __future__ import annotations

from app.models import MachineDefinition


# Catalogo segun la documentacion de planta (02_conocimiento/obsidian/08 Maquinas
# operaciones y produccion.md). El id debe coincidir con machine_id del JSON de
# mapeo SQL (SQL_TABLE_CONFIG); las maquinas sin tabla mapeada aparecen sin senal.
MACHINES: list[MachineDefinition] = [
    MachineDefinition(id="telar_1", name="Telar 1", family="TELAR", unit="M3", sort_order=10),
    MachineDefinition(id="telar_2", name="Telar 2", family="TELAR", unit="M3", sort_order=20),
    MachineDefinition(id="telar_3", name="Telar 3", family="TELAR", unit="M3", sort_order=30),
    MachineDefinition(id="telar_4", name="Telar 4", family="TELAR", unit="M3", sort_order=40),
    MachineDefinition(id="telar_externo", name="Telar externo", family="TELAR", unit="M3", sort_order=50),
    MachineDefinition(id="telar_monohilo", name="Telar monohilo", family="TELAR", unit="M3", sort_order=60),
    MachineDefinition(id="reforzadora_bloques", name="Reforzadora bloques", family="REFORZADORA", unit="M3", sort_order=70),
    MachineDefinition(id="cortabloques", name="Cortabloques", family="CORTABLOQUES", unit="M3", sort_order=80),
    MachineDefinition(id="reforzadora_tablas", name="Reforzadora tablas", family="REFORZADORA", unit="M2", sort_order=90),
    MachineDefinition(id="pulidora_tablas", name="Pulidora tablas", family="PULIDORA", unit="M2", sort_order=100),
    MachineDefinition(id="disco_puente_terzago", name="Disco Puente Terzago", family="DISCO PUENTE", unit="M2", sort_order=110),
    MachineDefinition(id="disco_puente_gomez", name="Disco Puente Gomez", family="DISCO PUENTE", unit="M2", sort_order=120),
    MachineDefinition(id="disco_puente_canigo", name="Disco Puente Canigo", family="DISCO PUENTE", unit="M2", sort_order=130),
    MachineDefinition(id="control_numerico_donatoni", name="Control numerico Donatoni", family="CONTROL NUMERICO", unit="M2", sort_order=140),
    MachineDefinition(id="pulidora_losas", name="Pulidora losas", family="PULIDORA", unit="M2", sort_order=150),
    MachineDefinition(id="biseladora", name="Biseladora", family="BISELADORA", unit="M2", sort_order=160),
    MachineDefinition(id="recuperadora", name="Recuperadora", family="RECUPERADORA", unit="M2", sort_order=170),
    MachineDefinition(id="taller", name="Taller", family="TALLER", unit="M2", sort_order=180),
]


def machine_by_id() -> dict[str, MachineDefinition]:
    return {machine.id: machine for machine in MACHINES}
