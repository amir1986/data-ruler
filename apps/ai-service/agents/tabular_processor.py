"""Tabular Processing Agent - parses CSV, XLSX, Parquet into structured data."""

from __future__ import annotations

import csv
import io
import json
import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

MAX_ROWS = 50000  # Maximum rows to process in memory


class TabularProcessorAgent(AgentBase):
    """Parses tabular files and returns columns + rows."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="tabular_processor",
            description="Parses CSV, XLSX, XLS, Parquet, Feather, TSV, and ODS files into structured data.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        file_path: str = payload.get("file_path", "")
        file_type: str = payload.get("file_type", "")

        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        return await self.process_file(file_path, file_type)

    async def process_file(self, file_path: str, file_type: str = "") -> dict[str, Any]:
        """Process a tabular file and return columns + rows."""
        if not file_type:
            ext = os.path.splitext(file_path)[1].lower()
            type_map = {".csv": "csv", ".tsv": "tsv", ".xlsx": "xlsx",
                        ".xls": "xls", ".parquet": "parquet", ".feather": "feather"}
            file_type = type_map.get(ext, "csv")

        try:
            if file_type == "csv":
                return self._parse_csv(file_path, delimiter=",")
            elif file_type == "tsv":
                return self._parse_csv(file_path, delimiter="\t")
            elif file_type in ("xlsx", "xls"):
                return self._parse_excel(file_path)
            elif file_type == "parquet":
                return self._parse_parquet(file_path)
            elif file_type == "feather":
                return self._parse_feather(file_path)
            else:
                return self._parse_csv(file_path, delimiter=",")
        except Exception as exc:
            return {"error": str(exc)}

    def _parse_csv(self, file_path: str, delimiter: str = ",") -> dict[str, Any]:
        """Parse CSV/TSV files."""
        rows = []
        columns = []
        try:
            # Detect encoding
            with open(file_path, "rb") as f:
                raw = f.read(8192)
            encoding = "utf-8"
            try:
                raw.decode("utf-8")
            except UnicodeDecodeError:
                encoding = "latin-1"

            with open(file_path, "r", encoding=encoding, errors="replace") as f:
                # Sniff dialect
                sample = f.read(8192)
                f.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=f"{delimiter};|\t")
                except csv.Error:
                    dialect = csv.excel
                    dialect.delimiter = delimiter

                reader = csv.DictReader(f, dialect=dialect)
                columns = reader.fieldnames or []
                for i, row in enumerate(reader):
                    if i >= MAX_ROWS:
                        break
                    rows.append(dict(row))

            return {
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "format": "csv",
                "encoding": encoding,
            }
        except Exception as exc:
            return {"error": f"CSV parse error: {exc}"}

    def _parse_excel(self, file_path: str) -> dict[str, Any]:
        """Parse XLSX/XLS files using openpyxl."""
        try:
            import openpyxl
            wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
            sheets_data = {}

            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                rows_iter = ws.iter_rows(values_only=True)

                # First row = headers
                header_row = next(rows_iter, None)
                if not header_row:
                    continue
                columns = [str(h) if h is not None else f"col_{i}" for i, h in enumerate(header_row)]

                rows = []
                for i, row in enumerate(rows_iter):
                    if i >= MAX_ROWS:
                        break
                    rows.append({columns[j]: (str(v) if v is not None else None) for j, v in enumerate(row) if j < len(columns)})

                sheets_data[sheet_name] = {
                    "columns": columns,
                    "rows": rows,
                    "row_count": len(rows),
                }

            wb.close()

            # Return first sheet as primary
            if sheets_data:
                first = next(iter(sheets_data.values()))
                first["format"] = "xlsx"
                first["sheets"] = list(sheets_data.keys())
                first["all_sheets"] = sheets_data
                return first

            return {"error": "No sheets found in workbook"}
        except Exception as exc:
            return {"error": f"Excel parse error: {exc}"}

    def _parse_parquet(self, file_path: str) -> dict[str, Any]:
        """Parse Parquet files using pyarrow."""
        try:
            import pyarrow.parquet as pq
            table = pq.read_table(file_path)
            columns = table.column_names

            rows = []
            batch = table.to_pydict()
            n_rows = min(table.num_rows, MAX_ROWS)
            for i in range(n_rows):
                row = {col: str(batch[col][i]) if batch[col][i] is not None else None for col in columns}
                rows.append(row)

            return {
                "columns": columns,
                "rows": rows,
                "row_count": n_rows,
                "format": "parquet",
                "total_rows": table.num_rows,
            }
        except Exception as exc:
            return {"error": f"Parquet parse error: {exc}"}

    def _parse_feather(self, file_path: str) -> dict[str, Any]:
        """Parse Feather files using pyarrow."""
        try:
            import pyarrow.feather as feather
            table = feather.read_table(file_path)
            columns = table.column_names

            rows = []
            batch = table.to_pydict()
            n_rows = min(table.num_rows, MAX_ROWS)
            for i in range(n_rows):
                row = {col: str(batch[col][i]) if batch[col][i] is not None else None for col in columns}
                rows.append(row)

            return {
                "columns": columns,
                "rows": rows,
                "row_count": n_rows,
                "format": "feather",
            }
        except Exception as exc:
            return {"error": f"Feather parse error: {exc}"}
