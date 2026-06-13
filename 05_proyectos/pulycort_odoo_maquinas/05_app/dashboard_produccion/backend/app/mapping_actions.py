from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from app.models import UnknownMappingActionUpdate


MappingActionState = dict[str, str | None]


class MappingActionStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    def get(self, kind: str, machine_id: str, code: str) -> MappingActionState | None:
        return self._read().get(_key(kind, machine_id, code))

    def update(self, payload: UnknownMappingActionUpdate) -> MappingActionState:
        data = self._read()
        item: MappingActionState = {
            "action": payload.action,
            "note": _clean(payload.note),
            "mapped_label": _clean(payload.mapped_label),
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        }
        data[_key(payload.kind, payload.machine_id, payload.code)] = item
        self._write(data)
        return item

    def _read(self) -> dict[str, MappingActionState]:
        if not self.path.exists():
            return {}
        try:
            loaded = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        if not isinstance(loaded, dict):
            return {}
        items = loaded.get("items", loaded)
        if not isinstance(items, dict):
            return {}
        return {str(key): value for key, value in items.items() if isinstance(value, dict)}

    def _write(self, items: dict[str, MappingActionState]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "updated_at": datetime.now().isoformat(timespec="seconds"),
            "items": items,
        }
        temp_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temp_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        temp_path.replace(self.path)


def _key(kind: str, machine_id: str, code: str) -> str:
    return "|".join([kind.strip().lower(), machine_id.strip().lower(), code.strip().lower()])


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None
