"""Export Agent - exports data to CSV, JSON, and XLSX formats."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class ExportAgent(AgentBase):
    """Exports data to various file formats."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="export_agent",
            description="Exports data to CSV, JSON, and XLSX formats using Polars and openpyxl.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Export data to the requested format."""
        payload = message.payload
        data = payload.get("data")  # list of dicts
        format_type = payload.get("format", "csv")
        output_dir = payload.get("output_dir", "/tmp/exports")
        filename = payload.get("filename", "export")
        table_name = payload.get("table_name", "")
        query = payload.get("query", "")

        os.makedirs(output_dir, exist_ok=True)

        # If a query is provided, fetch data from storage
        if query and not data:
            data = await self._fetch_data(query, payload.get("backend", "sqlite"))

        if not data:
            return {"error": "No data to export"}

        try:
            if format_type == "csv":
                return await self._export_csv(data, output_dir, filename)
            elif format_type == "json":
                return await self._export_json(data, output_dir, filename)
            elif format_type == "xlsx":
                return await self._export_xlsx(data, output_dir, filename)
            else:
                return {"error": f"Unsupported export format: {format_type}"}
        except Exception as exc:
            self.logger.error("Export failed: %s", exc)
            return {"error": str(exc)}

    async def _export_csv(
        self, data: list[dict[str, Any]], output_dir: str, filename: str
    ) -> dict[str, Any]:
        """Export data to CSV using Polars."""
        import polars as pl

        df = pl.DataFrame(data)
        output_path = os.path.join(output_dir, f"{filename}.csv")
        df.write_csv(output_path)

        return {
            "format": "csv",
            "output_path": output_path,
            "row_count": df.height,
            "column_count": df.width,
            "file_size": os.path.getsize(output_path),
        }

    async def _export_json(
        self, data: list[dict[str, Any]], output_dir: str, filename: str
    ) -> dict[str, Any]:
        """Export data to JSON."""
        output_path = os.path.join(output_dir, f"{filename}.json")

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)

        return {
            "format": "json",
            "output_path": output_path,
            "record_count": len(data),
            "file_size": os.path.getsize(output_path),
        }

    async def _export_xlsx(
        self, data: list[dict[str, Any]], output_dir: str, filename: str
    ) -> dict[str, Any]:
        """Export data to XLSX using openpyxl."""
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Data"

        if not data:
            return {"error": "No data to export"}

        # Write headers
        headers = list(data[0].keys())
        for col_idx, header in enumerate(headers, 1):
            ws.cell(row=1, column=col_idx, value=header)

        # Write data rows
        for row_idx, row in enumerate(data, 2):
            for col_idx, header in enumerate(headers, 1):
                value = row.get(header)
                # Convert non-serializable types
                if isinstance(value, (list, dict)):
                    value = str(value)
                ws.cell(row=row_idx, column=col_idx, value=value)

        output_path = os.path.join(output_dir, f"{filename}.xlsx")
        wb.save(output_path)

        return {
            "format": "xlsx",
            "output_path": output_path,
            "row_count": len(data),
            "column_count": len(headers),
            "file_size": os.path.getsize(output_path),
        }

    async def _fetch_data(
        self, query: str, backend: str
    ) -> list[dict[str, Any]] | None:
        """Fetch data from a storage backend using a query."""
        try:
            if backend == "sqlite":
                from services.storage.sqlite_backend import SQLiteBackend

                storage = SQLiteBackend()
                result = await storage.execute_query(query)
                columns = result.get("columns", [])
                rows = result.get("rows", [])
                return [dict(zip(columns, row)) for row in rows]
            elif backend == "duckdb":
                from services.storage.duckdb_backend import DuckDBBackend

                storage = DuckDBBackend()
                result = await storage.execute_query(query)
                columns = result.get("columns", [])
                rows = result.get("rows", [])
                return [dict(zip(columns, row)) for row in rows]
        except Exception as exc:
            self.logger.error("Failed to fetch data: %s", exc)
        return None
