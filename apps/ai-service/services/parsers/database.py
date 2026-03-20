"""Database file parsers for SQLite, SQL dumps, etc."""

import logging
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)


def parse_sqlite(file_path: str) -> dict[str, Any]:
    """Parse a SQLite database file."""
    try:
        conn = sqlite3.connect(f"file:{file_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row

        # Get all tables
        tables_cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        table_names = [row["name"] for row in tables_cursor]

        tables = []
        for table_name in table_names:
            # Get schema
            schema_cursor = conn.execute(f'PRAGMA table_info("{table_name}")')
            columns = []
            for col in schema_cursor:
                columns.append({
                    "name": col["name"],
                    "type": col["type"],
                    "is_primary_key": bool(col["pk"]),
                    "is_nullable": not bool(col["notnull"]),
                    "default": col["dflt_value"],
                })

            # Get row count
            count_cursor = conn.execute(f'SELECT COUNT(*) as cnt FROM "{table_name}"')
            row_count = count_cursor.fetchone()["cnt"]

            # Sample data
            sample_cursor = conn.execute(f'SELECT * FROM "{table_name}" LIMIT 100')
            col_names = [desc[0] for desc in sample_cursor.description]
            sample_rows = [dict(row) for row in sample_cursor]

            tables.append({
                "name": table_name,
                "columns": columns,
                "row_count": row_count,
                "sample_rows": sample_rows,
                "column_names": col_names,
            })

        conn.close()

        return {
            "tables": tables,
            "table_count": len(tables),
            "total_rows": sum(t["row_count"] for t in tables),
        }
    except Exception as e:
        logger.error(f"SQLite parse failed: {e}")
        return {"tables": [], "error": str(e)}


def parse_sql_dump(file_path: str) -> dict[str, Any]:
    """Parse a SQL dump file to extract schema and data."""
    try:
        import sqlparse

        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            sql_content = f.read()

        statements = sqlparse.split(sql_content)
        create_statements = []
        insert_count = 0

        for stmt in statements:
            parsed = sqlparse.parse(stmt)[0] if stmt.strip() else None
            if parsed:
                stmt_type = parsed.get_type()
                if stmt_type == "CREATE":
                    create_statements.append(stmt.strip())
                elif stmt_type == "INSERT":
                    insert_count += 1

        return {
            "text": sql_content[:10000],  # First 10KB for preview
            "create_statements": create_statements,
            "insert_count": insert_count,
            "total_statements": len(statements),
            "char_count": len(sql_content),
        }
    except Exception as e:
        logger.error(f"SQL dump parse failed: {e}")
        return {"text": "", "error": str(e)}


PARSERS = {
    "sqlite": parse_sqlite,
    "sqlite3": parse_sqlite,
    "db": parse_sqlite,
    "sql": parse_sql_dump,
}


def parse_database(file_path: str, file_type: str) -> dict[str, Any]:
    """Parse any database file."""
    parser = PARSERS.get(file_type.lower(), parse_sqlite)
    return parser(file_path)
