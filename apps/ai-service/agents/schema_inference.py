"""Schema Inference Agent - infers column types, detects patterns, computes quality scores."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage
from services.ollama_client import chat_completion

logger = logging.getLogger(__name__)

# Regex patterns for type detection
PATTERNS = {
    "email": re.compile(r'^[\w.+-]+@[\w-]+\.[\w.]+$'),
    "url": re.compile(r'^https?://\S+$'),
    "phone": re.compile(r'^[\+]?[\d\s\-\(\)]{7,20}$'),
    "uuid": re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I),
    "ipv4": re.compile(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$'),
    "date_iso": re.compile(r'^\d{4}-\d{2}-\d{2}'),
    "date_us": re.compile(r'^\d{1,2}/\d{1,2}/\d{2,4}$'),
    "boolean": re.compile(r'^(true|false|yes|no|1|0|t|f|y|n)$', re.I),
    "integer": re.compile(r'^-?\d+$'),
    "float": re.compile(r'^-?\d+\.\d+$'),
    "currency": re.compile(r'^[\$\€\£\¥]\s*[\d,]+\.?\d*$'),
    "percentage": re.compile(r'^-?\d+\.?\d*\s*%$'),
    "zip_code": re.compile(r'^\d{5}(-\d{4})?$'),
}


class SchemaInferenceAgent(AgentBase):
    """Infers column types, detects semantic patterns, computes data quality scores."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="schema_inference",
            description="Infers column data types, detects semantic patterns (email, URL, date), and computes data quality scores.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        columns = payload.get("columns", [])
        rows = payload.get("rows", [])

        if not columns or not rows:
            return {"error": "No columns or rows provided"}

        schema = []
        quality_issues = []
        total_score = 0

        for col in columns:
            values = [row.get(col) if isinstance(row, dict) else None for row in rows]
            col_info = self._analyze_column(col, values)
            schema.append(col_info)
            total_score += col_info.get("quality_score", 0)
            if col_info.get("issues"):
                quality_issues.extend(col_info["issues"])

        avg_score = total_score / len(schema) if schema else 0

        # Use LLM for semantic understanding
        llm_insights = await self._llm_schema_insights(schema, rows[:10])

        return {
            "schema": schema,
            "quality_profile": {
                "score": round(avg_score, 2),
                "issues": quality_issues,
                "column_count": len(schema),
                "row_count": len(rows),
            },
            "llm_insights": llm_insights,
        }

    def _analyze_column(self, name: str, values: list) -> dict[str, Any]:
        """Analyze a single column's values for type inference and quality."""
        non_null = [v for v in values if v is not None and str(v).strip() != ""]
        total = len(values)
        null_count = total - len(non_null)
        null_ratio = null_count / total if total > 0 else 0

        if not non_null:
            return {
                "name": name,
                "inferred_type": "empty",
                "semantic_type": None,
                "null_ratio": 1.0,
                "quality_score": 0,
                "issues": [f"Column '{name}' is entirely empty"],
            }

        # Sample values for type detection
        sample = [str(v) for v in non_null[:500]]
        unique_count = len(set(sample))
        cardinality = unique_count / len(sample) if sample else 0

        # Detect type via pattern matching
        inferred_type, semantic_type = self._detect_type(sample)

        # Quality scoring
        issues = []
        score = 100

        if null_ratio > 0.5:
            score -= 30
            issues.append(f"High null ratio ({null_ratio:.0%}) in '{name}'")
        elif null_ratio > 0.1:
            score -= 10

        if cardinality < 0.01 and len(sample) > 100:
            score -= 10
            issues.append(f"Very low cardinality in '{name}' ({unique_count} unique values)")

        # Check for mixed types
        type_counts: dict[str, int] = {}
        for v in sample[:100]:
            for pname, pattern in PATTERNS.items():
                if pattern.match(v):
                    type_counts[pname] = type_counts.get(pname, 0) + 1
                    break
        if len(type_counts) > 2:
            score -= 15
            issues.append(f"Mixed types detected in '{name}'")

        return {
            "name": name,
            "inferred_type": inferred_type,
            "semantic_type": semantic_type,
            "null_count": null_count,
            "null_ratio": round(null_ratio, 4),
            "unique_count": unique_count,
            "cardinality": round(cardinality, 4),
            "sample_values": sample[:5],
            "quality_score": max(0, score),
            "issues": issues,
        }

    @staticmethod
    def _detect_type(sample: list[str]) -> tuple[str, str | None]:
        """Detect the most likely type from a sample of string values."""
        type_votes: dict[str, int] = {}
        for v in sample[:200]:
            for pname, pattern in PATTERNS.items():
                if pattern.match(v.strip()):
                    type_votes[pname] = type_votes.get(pname, 0) + 1
                    break

        if not type_votes:
            return ("text", None)

        best = max(type_votes, key=type_votes.get)
        confidence = type_votes[best] / len(sample[:200])

        if confidence < 0.5:
            return ("text", None)

        type_mapping = {
            "integer": ("integer", None),
            "float": ("float", None),
            "boolean": ("boolean", None),
            "email": ("text", "email"),
            "url": ("text", "url"),
            "phone": ("text", "phone"),
            "uuid": ("text", "uuid"),
            "ipv4": ("text", "ip_address"),
            "date_iso": ("datetime", "date"),
            "date_us": ("datetime", "date"),
            "currency": ("float", "currency"),
            "percentage": ("float", "percentage"),
            "zip_code": ("text", "zip_code"),
        }
        return type_mapping.get(best, ("text", best))

    async def _llm_schema_insights(
        self, schema: list[dict], sample_rows: list
    ) -> dict[str, Any]:
        """Use cloud LLM for semantic understanding of the schema."""
        schema_summary = json.dumps(
            [{"name": s["name"], "type": s["inferred_type"], "semantic": s.get("semantic_type")}
             for s in schema], default=str
        )[:2000]
        sample = json.dumps(sample_rows, default=str)[:1500]

        try:
            raw = await chat_completion(
                messages=[{"role": "user", "content": (
                    f"Analyze this data schema and sample:\n"
                    f"Schema: {schema_summary}\n"
                    f"Sample: {sample}\n\n"
                    "Provide: table_description, suggested_primary_key, "
                    "potential_foreign_keys, data_domain, recommended_indices"
                )}],
                system="You are a database schema analyst. Respond in valid JSON only.",
                temperature=0.2,
                max_tokens=500,
                model_tier="fast",
                json_mode=True,
            )
            return json.loads(raw)
        except Exception as exc:
            logger.warning("LLM schema insights failed: %s", exc)
            return {}
