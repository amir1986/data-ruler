"""Relationship Mining Agent - discovers relationships between tables."""

from __future__ import annotations

import logging
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class RelationshipMiningAgent(AgentBase):
    """Discovers relationships between tables using name matching and value overlap."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="relationship_mining",
            description="Finds foreign key relationships via column name fuzzy matching and value overlap analysis.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Analyze tables to find potential relationships."""
        payload = message.payload
        tables = payload.get("tables", [])
        # tables: list of {name, columns: [{name, dtype}], sample_values: {col: [values]}}

        if not tables or len(tables) < 2:
            return {
                "relationships": [],
                "note": "Need at least two tables to find relationships",
            }

        relationships: list[dict[str, Any]] = []

        # Compare all table pairs
        for i in range(len(tables)):
            for j in range(i + 1, len(tables)):
                table_a = tables[i]
                table_b = tables[j]
                rels = self._find_relationships(table_a, table_b)
                relationships.extend(rels)

        # Sort by confidence
        relationships.sort(key=lambda r: r["confidence"], reverse=True)

        return {
            "relationships": relationships,
            "table_count": len(tables),
            "relationship_count": len(relationships),
        }

    def _find_relationships(
        self, table_a: dict[str, Any], table_b: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Find potential relationships between two tables."""
        relationships: list[dict[str, Any]] = []
        a_name = table_a.get("name", "table_a")
        b_name = table_b.get("name", "table_b")
        a_cols = table_a.get("columns", [])
        b_cols = table_b.get("columns", [])
        a_samples = table_a.get("sample_values", {})
        b_samples = table_b.get("sample_values", {})

        for a_col in a_cols:
            for b_col in b_cols:
                a_col_name = a_col["name"]
                b_col_name = b_col["name"]
                a_dtype = a_col.get("dtype", "")
                b_dtype = b_col.get("dtype", "")

                # Skip if types are incompatible
                if not self._types_compatible(a_dtype, b_dtype):
                    continue

                # Name similarity
                name_score = self._name_similarity(a_col_name, b_col_name)

                # Value overlap (Jaccard similarity)
                value_score = 0.0
                if a_col_name in a_samples and b_col_name in b_samples:
                    value_score = self._jaccard_similarity(
                        a_samples[a_col_name], b_samples[b_col_name]
                    )

                # Combined confidence
                confidence = self._compute_confidence(
                    name_score, value_score, a_col_name, b_col_name
                )

                if confidence >= 0.3:
                    rel_type = self._infer_relationship_type(
                        a_col_name, b_col_name, a_name, b_name
                    )
                    relationships.append({
                        "from_table": a_name,
                        "from_column": a_col_name,
                        "to_table": b_name,
                        "to_column": b_col_name,
                        "confidence": round(confidence, 3),
                        "name_similarity": round(name_score, 3),
                        "value_overlap": round(value_score, 3),
                        "relationship_type": rel_type,
                    })

        return relationships

    @staticmethod
    def _name_similarity(name_a: str, name_b: str) -> float:
        """Compute similarity between column names using Levenshtein-like approach."""
        a = name_a.lower().strip()
        b = name_b.lower().strip()

        # Exact match
        if a == b:
            return 1.0

        # Common FK patterns: table_id <-> id, user_id <-> id
        a_parts = a.replace("-", "_").split("_")
        b_parts = b.replace("-", "_").split("_")

        # Check if one is a prefix of the other + "id"
        if a.endswith("_id") and a[:-3] == b:
            return 0.9
        if b.endswith("_id") and b[:-3] == a:
            return 0.9
        if a == "id" and b.endswith("_id"):
            return 0.85
        if b == "id" and a.endswith("_id"):
            return 0.85

        # Levenshtein distance
        distance = RelationshipMiningAgent._levenshtein(a, b)
        max_len = max(len(a), len(b))
        if max_len == 0:
            return 0.0

        similarity = 1.0 - (distance / max_len)

        # Boost if they share significant tokens
        shared_tokens = set(a_parts) & set(b_parts)
        if shared_tokens - {"id", "the", "a", "an"}:
            similarity = max(similarity, 0.7)

        return similarity

    @staticmethod
    def _levenshtein(s1: str, s2: str) -> int:
        """Compute the Levenshtein distance between two strings."""
        if len(s1) < len(s2):
            return RelationshipMiningAgent._levenshtein(s2, s1)

        if len(s2) == 0:
            return len(s1)

        prev_row = list(range(len(s2) + 1))
        for i, c1 in enumerate(s1):
            curr_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = prev_row[j + 1] + 1
                deletions = curr_row[j] + 1
                substitutions = prev_row[j] + (c1 != c2)
                curr_row.append(min(insertions, deletions, substitutions))
            prev_row = curr_row

        return prev_row[-1]

    @staticmethod
    def _jaccard_similarity(values_a: list[Any], values_b: list[Any]) -> float:
        """Compute Jaccard similarity between two sets of values."""
        set_a = set(str(v) for v in values_a if v is not None)
        set_b = set(str(v) for v in values_b if v is not None)

        if not set_a or not set_b:
            return 0.0

        intersection = set_a & set_b
        union = set_a | set_b

        return len(intersection) / len(union) if union else 0.0

    @staticmethod
    def _types_compatible(dtype_a: str, dtype_b: str) -> bool:
        """Check if two column types are compatible for a relationship."""
        a = dtype_a.lower()
        b = dtype_b.lower()

        numeric_types = {"int", "float", "decimal", "number", "i64", "i32", "f64", "f32", "u64", "u32"}
        string_types = {"str", "string", "text", "varchar", "utf8", "utf-8"}

        a_is_numeric = any(t in a for t in numeric_types)
        b_is_numeric = any(t in b for t in numeric_types)
        a_is_string = any(t in a for t in string_types)
        b_is_string = any(t in b for t in string_types)

        if a_is_numeric and b_is_numeric:
            return True
        if a_is_string and b_is_string:
            return True
        # Allow string-to-numeric if one looks like an ID
        return False

    @staticmethod
    def _compute_confidence(
        name_score: float, value_score: float, col_a: str, col_b: str
    ) -> float:
        """Compute overall relationship confidence."""
        # Weighted combination
        confidence = name_score * 0.4 + value_score * 0.6

        # Boost for common FK naming patterns
        a_lower = col_a.lower()
        b_lower = col_b.lower()
        if a_lower.endswith("_id") or b_lower.endswith("_id"):
            confidence += 0.1
        if a_lower == "id" or b_lower == "id":
            confidence += 0.05

        return min(confidence, 1.0)

    @staticmethod
    def _infer_relationship_type(
        col_a: str, col_b: str, table_a: str, table_b: str
    ) -> str:
        """Infer whether the relationship is a foreign key, shared key, etc."""
        a_lower = col_a.lower()
        b_lower = col_b.lower()

        if a_lower == "id" or b_lower == "id":
            return "foreign_key"
        if a_lower.endswith("_id") or b_lower.endswith("_id"):
            return "foreign_key"
        return "inferred"
