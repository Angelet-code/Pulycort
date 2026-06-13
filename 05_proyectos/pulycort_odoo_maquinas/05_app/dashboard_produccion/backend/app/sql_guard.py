from __future__ import annotations

import re


IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
# Las tablas admiten un prefijo de esquema (ej. dbo.registro_telar_1).
TABLE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$")


def assert_safe_identifier(identifier: str) -> str:
    if not IDENTIFIER_RE.match(identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier!r}")
    return identifier


def assert_safe_table_name(identifier: str) -> str:
    if not TABLE_RE.match(identifier):
        raise ValueError(f"Unsafe SQL table name: {identifier!r}")
    return identifier


def assert_select_only(sql: str) -> str:
    normalized = " ".join(sql.strip().split()).lower()
    if not normalized.startswith("select "):
        raise ValueError("Only SELECT statements are allowed.")
    blocked = [" insert ", " update ", " delete ", " drop ", " alter ", " truncate ", " exec ", " merge "]
    if any(token in f" {normalized} " for token in blocked):
        raise ValueError("Query contains a blocked SQL keyword.")
    return sql

