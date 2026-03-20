"""SQLite storage backend for user data."""

import logging
import os
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")


def get_user_db(user_id: str) -> sqlite3.Connection:
    """Get a connection to the user's data database."""
    user_dir = os.path.join(DATABASE_PATH, user_id)
    os.makedirs(user_dir, exist_ok=True)
    db_path = os.path.join(user_dir, "user_data.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def create_table(
    user_id: str,
    table_name: str,
    columns: list[dict[str, str]],
) -> bool:
    """Create a table in the user's database."""
    conn = get_user_db(user_id)
    try:
        col_defs = []
        for col in columns:
            name = col["name"].replace('"', '""')
            col_type = col.get("type", "TEXT")
            col_defs.append(f'"{name}" {col_type}')

        sql = f'CREATE TABLE IF NOT EXISTS "{table_name}" ({", ".join(col_defs)})'
        conn.execute(sql)
        conn.commit()
        return True
    except Exception as e:
        logger.error(f"Create table failed: {e}")
        return False
    finally:
        conn.close()


def insert_rows(
    user_id: str,
    table_name: str,
    columns: list[str],
    rows: list[dict[str, Any]],
    batch_size: int = 1000,
) -> int:
    """Insert rows into a table. Returns number of rows inserted."""
    conn = get_user_db(user_id)
    inserted = 0
    try:
        placeholders = ", ".join(["?"] * len(columns))
        sql = f'INSERT INTO "{table_name}" VALUES ({placeholders})'

        batch = []
        for row in rows:
            values = [row.get(c) for c in columns]
            batch.append(values)
            if len(batch) >= batch_size:
                conn.executemany(sql, batch)
                inserted += len(batch)
                batch = []

        if batch:
            conn.executemany(sql, batch)
            inserted += len(batch)

        conn.commit()
        return inserted
    except Exception as e:
        logger.error(f"Insert failed: {e}")
        conn.rollback()
        return inserted
    finally:
        conn.close()


def query_table(
    user_id: str,
    sql: str,
    params: tuple = (),
    limit: int = 1000,
) -> dict[str, Any]:
    """Execute a read-only query against the user's database."""
    conn = get_user_db(user_id)
    try:
        # Enforce read-only
        upper = sql.strip().upper()
        if not upper.startswith("SELECT"):
            return {"error": "Only SELECT queries are allowed", "columns": [], "rows": []}

        cursor = conn.execute(sql, params)
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = [dict(row) for row in cursor.fetchmany(limit)]

        return {"columns": columns, "rows": rows, "row_count": len(rows)}
    except Exception as e:
        logger.error(f"Query failed: {e}")
        return {"error": str(e), "columns": [], "rows": []}
    finally:
        conn.close()


def get_table_preview(
    user_id: str,
    table_name: str,
    limit: int = 100,
) -> dict[str, Any]:
    """Get a preview of a table."""
    return query_table(user_id, f'SELECT * FROM "{table_name}" LIMIT ?', (limit,))


def list_tables(user_id: str) -> list[dict[str, Any]]:
    """List all tables in the user's database."""
    conn = get_user_db(user_id)
    try:
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()

        result = []
        for table in tables:
            name = table["name"]
            count = conn.execute(f'SELECT COUNT(*) as c FROM "{name}"').fetchone()["c"]
            schema = conn.execute(f'PRAGMA table_info("{name}")').fetchall()
            cols = [{"name": c["name"], "type": c["type"]} for c in schema]
            result.append({"name": name, "row_count": count, "columns": cols})

        return result
    except Exception as e:
        logger.error(f"List tables failed: {e}")
        return []
    finally:
        conn.close()
