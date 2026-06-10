from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    database_url: str
    app_refresh_seconds: int
    shift_schedule: str
    sql_table_config: Path
    sql_row_limit: int
    cors_origins: tuple[str, ...]

    @property
    def data_mode(self) -> str:
        if not self.database_url or self.database_url.startswith("mock://"):
            return "mock"
        return "sql"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    origins = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174").split(",")
        if origin.strip()
    )
    return Settings(
        database_url=os.getenv("DATABASE_URL", "mock://pulycort"),
        app_refresh_seconds=_int_env("APP_REFRESH_SECONDS", 30),
        shift_schedule=os.getenv("SHIFT_SCHEDULE", ""),
        sql_table_config=Path(
            os.getenv(
                "SQL_TABLE_CONFIG",
                str(BASE_DIR / "config" / "sql_tables.example.json"),
            )
        ),
        sql_row_limit=_int_env("SQL_ROW_LIMIT", 5000),
        cors_origins=origins,
    )
