"""Database Importer Agent - imports SQLite, DuckDB, and SQL dumps."""

from __future__ import annotations

import logging
import os
import sqlite3
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")


class DatabaseImporterAgent(AgentBase):
    def __init__(self) -> None:
        super().__init__(
            agent_name="database_importer",
            description="Imports SQLite, DuckDB databases and SQL dump files.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        file_path = payload.get("file_path", "")
        file_type = payload.get("file_type", "")
        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}
        return await self.process_file(file_path, file_type)

    async def process_file(self, file_path: str, file_type: str = "") -> dict[str, Any]:
        if file_type in ("sqlite", "sqlite3", "db") or file_path.endswith((".db", ".sqlite", ".sqlite3")):
            return self._import_sqlite(file_path)
        elif file_type == "sql_dump" or file_path.endswith(".sql"):
            return self._import_sql_dump(file_path)
        else:
            return {"error": f"Unsupported database type: {file_type}"}

    def _import_sqlite(self, path: str) -> dict[str, Any]:
        try:
            conn = sqlite3.connect(path)
            tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            result = {"format": "sqlite", "tables": []}
            for (tbl,) in tables:
                cols = conn.execute(f'PRAGMA table_info("{tbl}")').fetchall()
                count = conn.execute(f'SELECT COUNT(*) FROM "{tbl}"').fetchone()[0]
                sample = conn.execute(f'SELECT * FROM "{tbl}" LIMIT 10').fetchall()
                col_names = [c[1] for c in cols]
                result["tables"].append({
                    "name": tbl,
                    "columns": col_names,
                    "row_count": count,
                    "column_info": [{"name": c[1], "type": c[2], "notnull": bool(c[3]), "pk": bool(c[5])} for c in cols],
                    "rows": [dict(zip(col_names, row)) for row in sample],
                })
            conn.close()
            return result
        except Exception as exc:
            return {"error": str(exc)}

    def _import_sql_dump(self, path: str) -> dict[str, Any]:
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                sql_content = f.read()
            # Create in-memory DB and execute the dump
            conn = sqlite3.connect(":memory:")
            conn.executescript(sql_content)
            tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            result = {"format": "sql_dump", "tables": []}
            for (tbl,) in tables:
                cols = conn.execute(f'PRAGMA table_info("{tbl}")').fetchall()
                count = conn.execute(f'SELECT COUNT(*) FROM "{tbl}"').fetchone()[0]
                result["tables"].append({
                    "name": tbl,
                    "columns": [c[1] for c in cols],
                    "row_count": count,
                })
            conn.close()
            return result
        except Exception as exc:
            return {"error": str(exc)}
