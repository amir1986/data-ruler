"""Relationship Mining Agent - discovers foreign keys and joinable columns."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage
from services.ollama_client import chat_completion

logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")


class RelationshipMiningAgent(AgentBase):
    """Discovers foreign key relationships and joinable columns across tables."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="relationship_mining",
            description="Mines relationships between tables: foreign keys, joinable columns, shared value patterns.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        user_id = payload.get("user_id", "")

        if not user_id:
            return {"error": "user_id required"}

        # Load all table schemas
        tables = self._load_table_schemas(user_id)
        if not tables:
            return {"error": "No tables found", "relationships": []}

        # Use LLM to suggest relationships
        relationships = await self._discover_relationships(tables)
        return {"relationships": relationships, "table_count": len(tables)}

    def _load_table_schemas(self, user_id: str) -> list[dict[str, Any]]:
        user_db = os.path.join(DATABASE_PATH, user_id, "user_data.db")
        if not os.path.exists(user_db):
            return []

        conn = sqlite3.connect(user_db)
        try:
            tables = []
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            for row in cursor:
                tbl = row[0]
                cols = conn.execute(f'PRAGMA table_info("{tbl}")').fetchall()
                sample = conn.execute(f'SELECT * FROM "{tbl}" LIMIT 5').fetchall()
                tables.append({
                    "name": tbl,
                    "columns": [{"name": c[1], "type": c[2]} for c in cols],
                    "sample_values": [list(r) for r in sample],
                })
            return tables
        finally:
            conn.close()

    async def _discover_relationships(self, tables: list[dict]) -> list[dict[str, Any]]:
        tables_json = json.dumps(tables, default=str)[:4000]
        try:
            raw = await chat_completion(
                messages=[{"role": "user", "content": f"Discover relationships between these tables:\n{tables_json}"}],
                system=(
                    "You are a database relationship expert. Analyze table schemas and sample data to discover:\n"
                    "1. Foreign key relationships\n2. Joinable columns (same values)\n3. Naming pattern matches\n\n"
                    "Respond with JSON: {\"relationships\": [{\"from_table\": \"\", \"from_column\": \"\", "
                    "\"to_table\": \"\", \"to_column\": \"\", \"type\": \"foreign_key|inferred|naming\", "
                    "\"confidence\": 0.9}]}"
                ),
                temperature=0.2,
                max_tokens=1000,
                model_tier="code",
                json_mode=True,
            )
            result = json.loads(raw)
            return result.get("relationships", [])
        except Exception as exc:
            logger.warning("LLM relationship discovery failed: %s", exc)
            return []
