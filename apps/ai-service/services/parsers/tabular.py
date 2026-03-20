"""Tabular file parsers using Polars and Pandas fallback."""

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def parse_csv(file_path: str) -> dict[str, Any]:
    """Parse a CSV file and return columns + rows."""
    try:
        import polars as pl
        df = pl.read_csv(file_path, infer_schema_length=10000, ignore_errors=True)
        columns = df.columns
        rows = df.to_dicts()
        return {"columns": columns, "rows": rows, "row_count": len(rows)}
    except Exception as e:
        logger.warning(f"Polars CSV parse failed, trying pandas: {e}")
        try:
            import pandas as pd
            df = pd.read_csv(file_path, on_bad_lines="skip")
            columns = list(df.columns)
            rows = df.fillna("").to_dict("records")
            return {"columns": columns, "rows": rows, "row_count": len(rows)}
        except Exception as e2:
            logger.error(f"CSV parse failed: {e2}")
            return {"columns": [], "rows": [], "error": str(e2)}


def parse_tsv(file_path: str) -> dict[str, Any]:
    """Parse a TSV file."""
    try:
        import polars as pl
        df = pl.read_csv(file_path, separator="\t", infer_schema_length=10000, ignore_errors=True)
        return {"columns": df.columns, "rows": df.to_dicts(), "row_count": len(df)}
    except Exception as e:
        logger.error(f"TSV parse failed: {e}")
        return {"columns": [], "rows": [], "error": str(e)}


def parse_xlsx(file_path: str) -> dict[str, Any]:
    """Parse an Excel file (XLSX/XLS)."""
    try:
        import polars as pl
        # Try to read all sheets
        sheets = pl.read_excel(file_path, sheet_id=0)
        if isinstance(sheets, pl.DataFrame):
            return {
                "columns": sheets.columns,
                "rows": sheets.to_dicts(),
                "row_count": len(sheets),
            }
        # Multiple sheets
        all_data = {}
        for name, df in sheets.items():
            all_data[name] = {
                "columns": df.columns,
                "rows": df.to_dicts(),
                "row_count": len(df),
            }
        # Return first sheet as primary
        first_key = list(all_data.keys())[0]
        result = all_data[first_key]
        result["sheets"] = all_data
        return result
    except Exception as e:
        logger.warning(f"Polars Excel parse failed, trying pandas: {e}")
        try:
            import pandas as pd
            df = pd.read_excel(file_path, engine="openpyxl")
            columns = list(df.columns)
            rows = df.fillna("").to_dict("records")
            return {"columns": columns, "rows": rows, "row_count": len(rows)}
        except Exception as e2:
            logger.error(f"Excel parse failed: {e2}")
            return {"columns": [], "rows": [], "error": str(e2)}


def parse_parquet(file_path: str) -> dict[str, Any]:
    """Parse a Parquet file."""
    try:
        import polars as pl
        df = pl.read_parquet(file_path)
        return {"columns": df.columns, "rows": df.to_dicts(), "row_count": len(df)}
    except Exception as e:
        logger.error(f"Parquet parse failed: {e}")
        return {"columns": [], "rows": [], "error": str(e)}


def parse_json_tabular(file_path: str) -> dict[str, Any]:
    """Parse a JSON file as tabular data (array of objects)."""
    import json
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            columns = list(data[0].keys())
            # Collect all unique columns
            for row in data[:100]:
                for k in row.keys():
                    if k not in columns:
                        columns.append(k)
            rows = [{c: row.get(c) for c in columns} for row in data]
            return {"columns": columns, "rows": rows, "row_count": len(rows)}
        elif isinstance(data, dict):
            # Single object - make it one row
            columns = list(data.keys())
            return {"columns": columns, "rows": [data], "row_count": 1}
        else:
            return {"columns": [], "rows": [], "error": "JSON is not tabular"}
    except Exception as e:
        logger.error(f"JSON tabular parse failed: {e}")
        return {"columns": [], "rows": [], "error": str(e)}


PARSERS = {
    "csv": parse_csv,
    "tsv": parse_tsv,
    "xlsx": parse_xlsx,
    "xls": parse_xlsx,
    "parquet": parse_parquet,
    "json": parse_json_tabular,
}


def parse_tabular_file(file_path: str, file_type: str) -> dict[str, Any]:
    """Parse any tabular file based on its type."""
    parser = PARSERS.get(file_type.lower())
    if parser:
        return parser(file_path)
    # Fallback: try CSV
    return parse_csv(file_path)
