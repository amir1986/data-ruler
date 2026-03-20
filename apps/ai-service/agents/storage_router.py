"""Storage Router Agent - routes data to the appropriate storage backend."""

from __future__ import annotations

import logging
import os
import sqlite3
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")


class StorageRouterAgent(AgentBase):
    """Routes processed data to SQLite, DuckDB, filesystem, or vector store."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="storage_router",
            description="Routes data to optimal storage backend based on data type and size.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        user_id = payload.get("user_id", "")
        file_id = payload.get("file_id", "")
        columns = payload.get("columns", [])
        rows = payload.get("rows", [])
        category = payload.get("category", "tabular")

        if not user_id:
            return {"error": "user_id required"}

        if category in ("tabular", "structured_data", "spreadsheet") and columns and rows:
            return await self._store_sqlite(user_id, file_id, columns, rows)
        elif category == "document":
            return {"storage": "filesystem", "status": "stored_as_document"}
        elif category == "media":
            return {"storage": "filesystem", "status": "stored_as_media"}
        else:
            return {"storage": "filesystem", "status": "stored"}

    async def _store_sqlite(
        self, user_id: str, file_id: str, columns: list[str], rows: list[dict]
    ) -> dict[str, Any]:
        user_db = os.path.join(DATABASE_PATH, user_id, "user_data.db")
        os.makedirs(os.path.dirname(user_db), exist_ok=True)

        table_name = f"file_{file_id.replace('-', '_')}" if file_id else "imported_data"
        conn = sqlite3.connect(user_db)
        try:
            col_defs = ", ".join(f'"{c}" TEXT' for c in columns)
            conn.execute(f'CREATE TABLE IF NOT EXISTS "{table_name}" ({col_defs})')

            placeholders = ", ".join(["?"] * len(columns))
            for row in rows:
                values = [str(row.get(c, "")) if row.get(c) is not None else None for c in columns]
                conn.execute(f'INSERT INTO "{table_name}" VALUES ({placeholders})', values)
            conn.commit()

            return {
                "storage": "sqlite",
                "table_name": table_name,
                "db_path": user_db,
                "row_count": len(rows),
                "status": "stored",
            }
        except Exception as exc:
            return {"error": str(exc)}
        finally:
            conn.close()
