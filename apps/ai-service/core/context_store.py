"""Per-user workspace context used by agents."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

logger = logging.getLogger("context_store")


@dataclass
class TableInfo:
    """Metadata about a registered table / dataframe."""

    table_id: UUID
    name: str
    columns: list[dict[str, str]]  # [{"name": ..., "dtype": ...}, ...]
    row_count: int
    source_file_id: UUID | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Relationship:
    """An edge in the table relationship graph."""

    from_table: str
    from_column: str
    to_table: str
    to_column: str
    rel_type: str = "foreign_key"  # or "inferred"
    confidence: float = 1.0


@dataclass
class AgentContext:
    """Mutable workspace context for a single user session.

    Agents read and write to this object to share state without
    coupling to each other directly.
    """

    context_id: UUID = field(default_factory=uuid4)

    # Table registry --------------------------------------------------
    tables: dict[str, TableInfo] = field(default_factory=dict)

    # Relationship graph ----------------------------------------------
    relationships: list[Relationship] = field(default_factory=list)

    # File catalog ----------------------------------------------------
    file_catalog: dict[UUID, dict[str, Any]] = field(default_factory=dict)

    # Processing state ------------------------------------------------
    processing_tasks: dict[UUID, dict[str, Any]] = field(default_factory=dict)

    # General-purpose cache -------------------------------------------
    cache: dict[str, Any] = field(default_factory=dict)

    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    # -----------------------------------------------------------------
    # Table helpers
    # -----------------------------------------------------------------

    def register_table(self, info: TableInfo) -> None:
        self.tables[info.name] = info
        self._touch()
        logger.debug("Registered table '%s' (%d rows)", info.name, info.row_count)

    def unregister_table(self, name: str) -> None:
        self.tables.pop(name, None)
        self._touch()

    def get_table(self, name: str) -> TableInfo | None:
        return self.tables.get(name)

    # -----------------------------------------------------------------
    # Relationship helpers
    # -----------------------------------------------------------------

    def add_relationship(self, rel: Relationship) -> None:
        self.relationships.append(rel)
        self._touch()

    def get_relationships_for(self, table_name: str) -> list[Relationship]:
        return [
            r
            for r in self.relationships
            if r.from_table == table_name or r.to_table == table_name
        ]

    # -----------------------------------------------------------------
    # File catalog helpers
    # -----------------------------------------------------------------

    def register_file(self, file_id: UUID, metadata: dict[str, Any]) -> None:
        self.file_catalog[file_id] = metadata
        self._touch()

    def get_file(self, file_id: UUID) -> dict[str, Any] | None:
        return self.file_catalog.get(file_id)

    # -----------------------------------------------------------------
    # Cache helpers
    # -----------------------------------------------------------------

    def cache_set(self, key: str, value: Any) -> None:
        self.cache[key] = value
        self._touch()

    def cache_get(self, key: str, default: Any = None) -> Any:
        return self.cache.get(key, default)

    # -----------------------------------------------------------------
    # Internal
    # -----------------------------------------------------------------

    def _touch(self) -> None:
        self.updated_at = datetime.utcnow()


class ContextStore:
    """Registry of per-user ``AgentContext`` instances with TTL eviction."""

    _MAX_CONTEXTS = 500
    _TTL_SECONDS = 3600  # 1 hour

    def __init__(self) -> None:
        self._contexts: dict[UUID, AgentContext] = {}

    def get_or_create(self, context_id: UUID | None = None) -> AgentContext:
        self._evict_stale()
        if context_id and context_id in self._contexts:
            ctx = self._contexts[context_id]
            ctx._touch()
            return ctx
        ctx = AgentContext(context_id=context_id or uuid4())
        self._contexts[ctx.context_id] = ctx
        logger.info("Created new context %s", ctx.context_id)
        return ctx

    def get(self, context_id: UUID) -> AgentContext | None:
        return self._contexts.get(context_id)

    def remove(self, context_id: UUID) -> None:
        self._contexts.pop(context_id, None)

    def list_contexts(self) -> list[UUID]:
        return list(self._contexts.keys())

    def _evict_stale(self) -> None:
        """Remove contexts older than TTL or exceeding max count."""
        now = datetime.utcnow()
        expired = [
            cid for cid, ctx in self._contexts.items()
            if (now - ctx.updated_at).total_seconds() > self._TTL_SECONDS
        ]
        for cid in expired:
            del self._contexts[cid]
        if expired:
            logger.info("Evicted %d stale contexts", len(expired))
        # Hard cap — evict oldest if still over limit
        if len(self._contexts) > self._MAX_CONTEXTS:
            by_age = sorted(self._contexts.items(), key=lambda x: x[1].updated_at)
            to_remove = len(self._contexts) - self._MAX_CONTEXTS
            for cid, _ in by_age[:to_remove]:
                del self._contexts[cid]
            logger.info("Evicted %d contexts (over cap)", to_remove)
