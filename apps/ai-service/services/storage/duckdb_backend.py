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
