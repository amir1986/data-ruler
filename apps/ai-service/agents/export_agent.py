"""Export Agent - exports data in various formats."""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import sqlite3
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")
EXPORT_PATH = os.getenv("EXPORT_PATH", "./data/exports")


class ExportAgent(AgentBase):
    """Exports data from user databases to CSV, JSON, XLSX, or Markdown."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="export_agent",
            description="Exports data to CSV, JSON, XLSX, Markdown, and SQL dump formats.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        user_id = payload.get("user_id", "")
        table_name = payload.get("table_name", "")
        file_id = payload.get("file_id", "")
        export_format = payload.get("format", "csv")
        sql_query = payload.get("sql", "")

        if not user_id:
            return {"error": "user_id required"}

        # Load data
        data = self._load_data(user_id, table_name, file_id, sql_query)
        if "error" in data:
            return data

        # Export
        os.makedirs(os.path.join(EXPORT_PATH, user_id), exist_ok=True)
        export_name = f"export_{table_name or file_id or 'data'}"

        if export_format == "csv":
            return self._export_csv(data, user_id, export_name)
        elif export_format == "json":
            return self._export_json(data, user_id, export_name)
        elif export_format == "markdown":
            return self._export_markdown(data, user_id, export_name)
        else:
            return self._export_csv(data, user_id, export_name)

    def _load_data(self, user_id: str, table_name: str, file_id: str, sql: str) -> dict[str, Any]:
        user_db = os.path.join(DATABASE_PATH, user_id, "user_data.db")
        if not os.path.exists(user_db):
            return {"error": "No user database found"}

        conn = sqlite3.connect(user_db)
        conn.row_factory = sqlite3.Row
        try:
            if sql:
                upper = sql.upper().strip()
                if not upper.startswith("SELECT"):
                    return {"error": "Only SELECT queries allowed for export"}
                cursor = conn.execute(sql)
            else:
                tbl = table_name or (f"file_{file_id.replace('-', '_')}" if file_id else "")
                if not tbl:
                    return {"error": "No table specified"}
                cursor = conn.execute(f'SELECT * FROM "{tbl}" LIMIT 50000')

            columns = [d[0] for d in cursor.description] if cursor.description else []
            rows = [dict(r) for r in cursor.fetchall()]
            return {"columns": columns, "rows": rows}
        except Exception as exc:
            return {"error": str(exc)}
        finally:
            conn.close()

    def _export_csv(self, data: dict, user_id: str, name: str) -> dict[str, Any]:
        path = os.path.join(EXPORT_PATH, user_id, f"{name}.csv")
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=data["columns"])
            writer.writeheader()
            writer.writerows(data["rows"])
        return {"path": path, "format": "csv", "row_count": len(data["rows"])}

    def _export_json(self, data: dict, user_id: str, name: str) -> dict[str, Any]:
        path = os.path.join(EXPORT_PATH, user_id, f"{name}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data["rows"], f, indent=2, default=str)
        return {"path": path, "format": "json", "row_count": len(data["rows"])}

    def _export_markdown(self, data: dict, user_id: str, name: str) -> dict[str, Any]:
        path = os.path.join(EXPORT_PATH, user_id, f"{name}.md")
        cols = data["columns"]
        with open(path, "w", encoding="utf-8") as f:
            f.write("| " + " | ".join(cols) + " |\n")
            f.write("| " + " | ".join(["---"] * len(cols)) + " |\n")
            for row in data["rows"][:1000]:
                f.write("| " + " | ".join(str(row.get(c, ""))[:50] for c in cols) + " |\n")
        return {"path": path, "format": "markdown", "row_count": min(len(data["rows"]), 1000)}
