"""Database Import Agent - imports data from SQLite, SQL dumps, and MongoDB exports."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class DatabaseImportAgent(AgentBase):
    """Imports and enumerates schemas from database files and dumps."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="database_importer",
            description="Imports data from SQLite databases, SQL dumps, and JSON/BSON MongoDB exports.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Process a database file and return schemas + data."""
        payload = message.payload
        file_path: str = payload.get("file_path", "")
        extension: str = payload.get("extension", "")
        mime_type: str = payload.get("mime_type", "")

        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        ext = extension or os.path.splitext(file_path)[1].lower()

        try:
            if ext in (".db", ".sqlite", ".sqlite3") or mime_type == "application/x-sqlite3":
                return await self._import_sqlite(file_path)
            elif ext == ".sql":
                return await self._import_sql_dump(file_path)
            elif ext == ".bson":
                return await self._import_bson(file_path)
            elif ext in (".json", ".jsonl"):
                return await self._import_mongo_json(file_path, ext)
            else:
                return {"error": f"Unsupported database format: {ext}"}
        except Exception as exc:
            self.logger.error("Failed to import database %s: %s", file_path, exc)
            return {"error": str(exc), "file_path": file_path}

    async def _import_sqlite(self, file_path: str) -> dict[str, Any]:
        """Open a SQLite database and enumerate tables, views, and schemas."""
        conn = sqlite3.connect(file_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row

        try:
            cursor = conn.cursor()

            # Get tables
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
            tables = [row[0] for row in cursor.fetchall()]

            # Get views
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='view'"
            )
            views = [row[0] for row in cursor.fetchall()]

            # Get schema and sample data for each table
            table_schemas: list[dict[str, Any]] = []
            for table_name in tables:
                # Get column info
                cursor.execute(f"PRAGMA table_info('{table_name}')")
                columns = [
                    {
                        "name": row[1],
                        "dtype": row[2],
                        "nullable": not row[3],
                        "default": row[4],
                        "primary_key": bool(row[5]),
                    }
                    for row in cursor.fetchall()
                ]

                # Get row count
                cursor.execute(f"SELECT COUNT(*) FROM '{table_name}'")
                row_count = cursor.fetchone()[0]

                # Get foreign keys
                cursor.execute(f"PRAGMA foreign_key_list('{table_name}')")
                foreign_keys = [
                    {
                        "from_column": row[3],
                        "to_table": row[2],
                        "to_column": row[4],
                    }
                    for row in cursor.fetchall()
                ]

                # Get indexes
                cursor.execute(f"PRAGMA index_list('{table_name}')")
                indexes = [
                    {"name": row[1], "unique": bool(row[2])}
                    for row in cursor.fetchall()
                ]

                # Preview data
                cursor.execute(f"SELECT * FROM '{table_name}' LIMIT 100")
                preview_columns = [desc[0] for desc in cursor.description]
                preview_rows = [dict(zip(preview_columns, row)) for row in cursor.fetchall()]

                table_schemas.append({
                    "table_name": table_name,
                    "columns": columns,
                    "row_count": row_count,
                    "foreign_keys": foreign_keys,
                    "indexes": indexes,
                    "preview": preview_rows,
                })

            # View schemas
            view_schemas: list[dict[str, Any]] = []
            for view_name in views:
                cursor.execute(
                    "SELECT sql FROM sqlite_master WHERE type='view' AND name=?",
                    (view_name,),
                )
                row = cursor.fetchone()
                view_schemas.append({
                    "view_name": view_name,
                    "sql": row[0] if row else "",
                })

            total_rows = sum(t["row_count"] for t in table_schemas)

            return {
                "format": "sqlite",
                "table_count": len(tables),
                "view_count": len(views),
                "tables": table_schemas,
                "views": view_schemas,
                "total_rows": total_rows,
                "file_path": file_path,
            }
        finally:
            conn.close()

    async def _import_sql_dump(self, file_path: str) -> dict[str, Any]:
        """Parse a SQL dump file using sqlparse."""
        import sqlparse

        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            sql_content = f.read()

        statements = sqlparse.parse(sql_content)

        create_tables: list[dict[str, Any]] = []
        insert_count = 0
        other_count = 0

        for stmt in statements:
            stmt_type = stmt.get_type()
            sql_text = str(stmt).strip()
            if not sql_text:
                continue

            if stmt_type == "CREATE":
                # Extract table name
                tokens = [t for t in stmt.tokens if not t.is_whitespace]
                table_name = ""
                for i, token in enumerate(tokens):
                    if token.ttype is sqlparse.tokens.Keyword and token.value.upper() == "TABLE":
                        if i + 1 < len(tokens):
                            table_name = str(tokens[i + 1]).strip("`\"'() ")
                            break

                create_tables.append({
                    "table_name": table_name,
                    "sql": sql_text[:2000],  # Limit SQL preview
                })
            elif stmt_type == "INSERT":
                insert_count += 1
            else:
                other_count += 1

        return {
            "format": "sql_dump",
            "statement_count": len(statements),
            "create_tables": create_tables,
            "table_count": len(create_tables),
            "insert_count": insert_count,
            "other_statement_count": other_count,
            "file_path": file_path,
        }

    async def _import_bson(self, file_path: str) -> dict[str, Any]:
        """Parse a BSON MongoDB export file."""
        try:
            import bson

            with open(file_path, "rb") as f:
                raw = f.read()

            documents: list[dict[str, Any]] = []
            offset = 0
            while offset < len(raw):
                try:
                    doc = bson.BSON(raw[offset:]).decode()
                    documents.append(doc)
                    # Move offset by document size (first 4 bytes = int32 length)
                    doc_size = int.from_bytes(raw[offset:offset + 4], "little")
                    offset += doc_size
                except Exception:
                    break

            flattened = [self._flatten_document(doc) for doc in documents[:100]]

            # Infer schema from first N documents
            schema = self._infer_schema_from_documents(documents[:1000])

            return {
                "format": "bson",
                "document_count": len(documents),
                "schema": schema,
                "preview": flattened,
                "file_path": file_path,
            }
        except ImportError:
            return {"error": "bson/pymongo not installed", "file_path": file_path}

    async def _import_mongo_json(self, file_path: str, ext: str) -> dict[str, Any]:
        """Parse JSON/JSONL MongoDB exports and flatten documents."""
        documents: list[dict[str, Any]] = []

        if ext == ".jsonl":
            with open(file_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            documents.append(json.loads(line))
                        except json.JSONDecodeError:
                            continue
        else:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                documents = data
            elif isinstance(data, dict):
                documents = [data]

        flattened = [self._flatten_document(doc) for doc in documents[:100]]
        schema = self._infer_schema_from_documents(documents[:1000])

        return {
            "format": "mongo_json",
            "document_count": len(documents),
            "schema": schema,
            "preview": flattened,
            "file_path": file_path,
        }

    @staticmethod
    def _flatten_document(
        doc: dict[str, Any], prefix: str = "", separator: str = "."
    ) -> dict[str, Any]:
        """Recursively flatten a nested document."""
        flat: dict[str, Any] = {}
        for key, value in doc.items():
            full_key = f"{prefix}{separator}{key}" if prefix else key
            if isinstance(value, dict):
                flat.update(
                    DatabaseImportAgent._flatten_document(value, full_key, separator)
                )
            elif isinstance(value, list):
                flat[full_key] = str(value)
            else:
                flat[full_key] = value
        return flat

    @staticmethod
    def _infer_schema_from_documents(
        documents: list[dict[str, Any]],
    ) -> list[dict[str, str]]:
        """Infer a schema from a list of documents by collecting field types."""
        field_types: dict[str, set[str]] = {}

        for doc in documents:
            flat = DatabaseImportAgent._flatten_document(doc)
            for key, value in flat.items():
                dtype = type(value).__name__
                if key not in field_types:
                    field_types[key] = set()
                field_types[key].add(dtype)

        return [
            {"name": key, "dtype": "|".join(sorted(types))}
            for key, types in field_types.items()
        ]
