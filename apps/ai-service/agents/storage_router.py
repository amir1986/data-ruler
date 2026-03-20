"""Storage Router Agent - routes data to the appropriate storage backend."""

from __future__ import annotations

import logging
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

# Thresholds
LARGE_DATASET_ROWS = 10_000_000  # 10M rows -> DuckDB
MAX_SQLITE_ROWS = 10_000_000


class StorageRouterAgent(AgentBase):
    """Routes data to SQLite, DuckDB, vector store, or filesystem based on characteristics."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="storage_router",
            description="Routes data to the optimal storage backend and manages the central catalog.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Determine storage target and persist data."""
        payload = message.payload
        category = payload.get("category", "")
        row_count = payload.get("row_count", 0)
        data = payload.get("data")
        schema = payload.get("schema", [])
        file_path = payload.get("file_path", "")
        file_id = payload.get("file_id", "")
        table_name = payload.get("table_name", "")
        full_text = payload.get("full_text", "")

        # Determine routing
        backend = self._determine_backend(category, row_count, full_text)

        self.logger.info(
            "Routing file_id=%s category=%s rows=%d -> backend=%s",
            file_id, category, row_count, backend,
        )

        result: dict[str, Any] = {
            "backend": backend,
            "category": category,
            "file_id": file_id,
            "file_path": file_path,
        }

        try:
            if backend == "sqlite":
                result.update(
                    await self._store_sqlite(table_name, schema, data, row_count)
                )
            elif backend == "duckdb":
                result.update(
                    await self._store_duckdb(table_name, schema, data, file_path, row_count)
                )
            elif backend == "vector":
                result.update(
                    await self._store_vector(file_id, full_text, payload)
                )
            elif backend == "filesystem":
                result.update(
                    await self._store_filesystem(file_id, file_path, payload)
                )
            else:
                result["error"] = f"Unknown backend: {backend}"
        except Exception as exc:
            self.logger.error("Storage routing failed: %s", exc)
            result["error"] = str(exc)

        # Update catalog entry
        result["catalog_entry"] = self._build_catalog_entry(result, payload)

        return result

    @staticmethod
    def _determine_backend(
        category: str, row_count: int, full_text: str
    ) -> str:
        """Determine the storage backend based on data characteristics."""
        if category == "tabular":
            if row_count > LARGE_DATASET_ROWS:
                return "duckdb"
            return "sqlite"
        elif category in ("document", "structured_data"):
            if full_text:
                return "vector"
            return "sqlite"
        elif category in ("media", "archive"):
            return "filesystem"
        elif category == "database":
            return "sqlite"
        else:
            return "filesystem"

    async def _store_sqlite(
        self,
        table_name: str,
        schema: list[dict[str, str]],
        data: Any,
        row_count: int,
    ) -> dict[str, Any]:
        """Store tabular data in SQLite."""
        from services.storage.sqlite_backend import SQLiteBackend

        backend = SQLiteBackend()

        if not table_name:
            table_name = f"table_{id(data)}"

        # Create table from schema
        await backend.create_table(table_name, schema)

        # Insert data
        if data and isinstance(data, list):
            inserted = await backend.insert_rows(table_name, data)
        else:
            inserted = 0

        return {
            "table_name": table_name,
            "rows_inserted": inserted,
            "storage": "sqlite",
        }

    async def _store_duckdb(
        self,
        table_name: str,
        schema: list[dict[str, str]],
        data: Any,
        file_path: str,
        row_count: int,
    ) -> dict[str, Any]:
        """Store large tabular data in DuckDB."""
        from services.storage.duckdb_backend import DuckDBBackend

        backend = DuckDBBackend()

        if not table_name:
            table_name = f"table_{id(data)}"

        # For large files, ingest directly from file
        if file_path:
            await backend.ingest_from_file(table_name, file_path)
        elif data:
            await backend.create_table(table_name, schema)
            await backend.insert_rows(table_name, data)

        return {
            "table_name": table_name,
            "row_count": row_count,
            "storage": "duckdb",
        }

    async def _store_vector(
        self,
        file_id: str,
        full_text: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Store text content in vector store for RAG."""
        from services.storage.vector_backend import VectorBackend

        backend = VectorBackend()

        metadata = {
            "file_id": file_id,
            "file_path": payload.get("file_path", ""),
            "format": payload.get("format", ""),
        }

        doc_id = await backend.index_document(
            collection_name=f"docs_{file_id}",
            text=full_text,
            metadata=metadata,
        )

        return {
            "document_id": doc_id,
            "text_length": len(full_text),
            "storage": "vector",
        }

    async def _store_filesystem(
        self,
        file_id: str,
        file_path: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Store binary/media files on the filesystem."""
        from services.storage.filesystem_backend import FilesystemBackend

        backend = FilesystemBackend()

        stored_path = await backend.store_file(
            file_id=file_id,
            source_path=file_path,
            metadata=payload,
        )

        return {
            "stored_path": stored_path,
            "storage": "filesystem",
        }

    @staticmethod
    def _build_catalog_entry(
        result: dict[str, Any], payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Build a catalog entry for the central file registry."""
        return {
            "file_id": result.get("file_id", ""),
            "file_path": result.get("file_path", ""),
            "backend": result.get("backend", ""),
            "table_name": result.get("table_name"),
            "document_id": result.get("document_id"),
            "stored_path": result.get("stored_path"),
            "category": result.get("category", ""),
            "row_count": payload.get("row_count", 0),
            "column_count": payload.get("column_count", 0),
        }
