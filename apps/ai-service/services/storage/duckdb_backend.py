"""DuckDB storage backend for large/analytical datasets."""

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")


def get_user_duckdb(user_id: str):
    """Get a DuckDB connection for the user."""
    import duckdb
    user_dir = os.path.join(DATABASE_PATH, user_id)
    os.makedirs(user_dir, exist_ok=True)
    db_path = os.path.join(user_dir, "analytics.duckdb")
    return duckdb.connect(db_path)


def create_table_from_parquet(user_id: str, table_name: str, parquet_path: str) -> bool:
    """Create a DuckDB table from a Parquet file."""
    try:
        conn = get_user_duckdb(user_id)
        conn.execute(f'CREATE TABLE IF NOT EXISTS "{table_name}" AS SELECT * FROM read_parquet(?)', [parquet_path])
        conn.close()
        return True
    except Exception as e:
        logger.error(f"DuckDB create from parquet failed: {e}")
        return False


def create_table_from_csv(user_id: str, table_name: str, csv_path: str) -> bool:
    """Create a DuckDB table from a CSV file."""
    try:
        conn = get_user_duckdb(user_id)
        conn.execute(f'CREATE TABLE IF NOT EXISTS "{table_name}" AS SELECT * FROM read_csv_auto(?)', [csv_path])
        conn.close()
        return True
    except Exception as e:
        logger.error(f"DuckDB create from CSV failed: {e}")
        return False


def query(user_id: str, sql: str, limit: int = 1000) -> dict[str, Any]:
    """Execute a read-only query against DuckDB."""
    try:
        upper = sql.strip().upper()
        if not upper.startswith("SELECT"):
            return {"error": "Only SELECT queries allowed", "columns": [], "rows": []}

        conn = get_user_duckdb(user_id)
        result = conn.execute(f"{sql} LIMIT {limit}").fetchdf()
        conn.close()

        columns = list(result.columns)
        rows = result.to_dict("records")
        return {"columns": columns, "rows": rows, "row_count": len(rows)}
    except Exception as e:
        logger.error(f"DuckDB query failed: {e}")
        return {"error": str(e), "columns": [], "rows": []}


# ---------------------------------------------------------------------------
# Class-based wrapper (used by agents)
# ---------------------------------------------------------------------------

class DuckDBBackend:
    """Async-compatible DuckDB backend wrapper used by agents."""

    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path or os.path.join(DATABASE_PATH, "default", "analytics.duckdb")
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

    def _connect(self) -> Any:
        import duckdb

        return duckdb.connect(self.db_path)

    async def create_table(
        self, table_name: str, schema: list[dict[str, str]]
    ) -> None:
        """Create a table from a schema list of {name, dtype}."""
        conn = self._connect()
        try:
            col_defs = []
            for col in schema:
                name = col["name"].replace('"', '""')
                dtype = col.get("dtype", col.get("type", "VARCHAR"))
                col_defs.append(f'"{name}" {dtype}')
            sql = f'CREATE TABLE IF NOT EXISTS "{table_name}" ({", ".join(col_defs)})'
            conn.execute(sql)
        finally:
            conn.close()

    async def insert_rows(
        self, table_name: str, rows: list[dict[str, Any]]
    ) -> int:
        """Insert rows using DuckDB."""
        if not rows:
            return 0
        import duckdb

        conn = self._connect()
        try:
            import polars as pl

            df = pl.DataFrame(rows)
            conn.execute(f'INSERT INTO "{table_name}" SELECT * FROM df')
            return len(rows)
        finally:
            conn.close()

    async def ingest_from_file(self, table_name: str, file_path: str) -> None:
        """Ingest data directly from a file (CSV, Parquet, etc.)."""
        conn = self._connect()
        ext = os.path.splitext(file_path)[1].lower()
        try:
            if ext == ".parquet":
                conn.execute(
                    f'CREATE TABLE IF NOT EXISTS "{table_name}" AS SELECT * FROM read_parquet(?)',
                    [file_path],
                )
            elif ext in (".csv", ".tsv"):
                conn.execute(
                    f'CREATE TABLE IF NOT EXISTS "{table_name}" AS SELECT * FROM read_csv_auto(?)',
                    [file_path],
                )
            elif ext == ".json":
                conn.execute(
                    f'CREATE TABLE IF NOT EXISTS "{table_name}" AS SELECT * FROM read_json_auto(?)',
                    [file_path],
                )
            else:
                conn.execute(
                    f'CREATE TABLE IF NOT EXISTS "{table_name}" AS SELECT * FROM read_csv_auto(?)',
                    [file_path],
                )
        finally:
            conn.close()

    async def execute_query(
        self, sql: str, parameters: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Execute a read-only SQL query."""
        conn = self._connect()
        try:
            result = conn.execute(sql).fetchdf()
            columns = list(result.columns)
            rows = result.to_dict("records")
            return {"columns": columns, "rows": rows, "row_count": len(rows)}
        except Exception as exc:
            return {"error": str(exc), "columns": [], "rows": [], "row_count": 0}
        finally:
            conn.close()
