"""Analytics Agent - statistical analysis, anomaly detection, trend analysis via cloud LLM."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from typing import Any

from core.agent_base import AgentBase, AgentContract
from models.schemas import AgentMessage
from services.ollama_client import chat_completion

logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")

ANALYTICS_SYSTEM = """You are a data analytics expert. Analyze the provided data and produce:

1. **Summary Statistics**: Count, mean, median, min, max, std dev for numeric columns
2. **Distribution Analysis**: Identify skewness, outliers, value frequencies for key columns
3. **Anomaly Detection**: Flag unusual values, patterns, or data quality issues
4. **Trend Analysis**: Identify trends if time-series data is present
5. **Correlations**: Note any obvious correlations between columns
6. **Recommendations**: Suggest further analyses or visualizations

Respond in valid JSON:
{
  "summary_statistics": {"column_name": {"count": N, "mean": N, "min": N, "max": N, "std": N}},
  "distributions": [{"column": "name", "type": "normal|skewed|uniform|bimodal", "notes": "..."}],
  "anomalies": [{"column": "name", "description": "...", "severity": "low|medium|high"}],
  "trends": [{"description": "...", "columns": ["col1", "col2"]}],
  "correlations": [{"columns": ["col1", "col2"], "strength": "strong|moderate|weak", "direction": "positive|negative"}],
  "recommendations": ["...", "..."],
  "narrative": "A 2-3 sentence natural language summary of the data."
}"""


class AnalyticsAgent(AgentBase):
    """Statistical analysis, anomaly detection, and trend analysis via cloud LLM."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="analytics",
            description="Performs statistical analysis, anomaly/trend detection, correlation analysis, and narrative generation via cloud LLM.",
            contract=AgentContract(
                optional_inputs=("data", "file_id", "user_id", "table_name"),
                output_keys=("local_statistics", "llm_analysis", "row_count", "column_count"),
            ),
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        data = payload.get("data")
        file_id = payload.get("file_id")
        user_id = payload.get("user_id")
        table_name = payload.get("table_name")

        # Load data from DB if not provided directly
        if not data and user_id and (file_id or table_name):
            data = self._load_data_from_db(user_id, file_id, table_name)

        if not data:
            return {"error": "No data provided for analysis"}

        # Compute basic stats locally first
        local_stats = self._compute_local_stats(data)

        # Use LLM for deeper analysis
        llm_analysis = await self._llm_analyze(data, local_stats)

        return {
            "local_statistics": local_stats,
            "llm_analysis": llm_analysis,
            "row_count": len(data),
            "column_count": len(data[0]) if data else 0,
        }

    def _load_data_from_db(
        self, user_id: str, file_id: str | None, table_name: str | None
    ) -> list[dict[str, Any]]:
        """Load data from user's SQLite database."""
        user_db = os.path.join(DATABASE_PATH, user_id, "user_data.db")
        if not os.path.exists(user_db):
            return []

        conn = sqlite3.connect(user_db)
        conn.row_factory = sqlite3.Row
        try:
            tbl = table_name or (f"file_{file_id.replace('-', '_')}" if file_id else None)
            if not tbl:
                return []
            cursor = conn.execute(f'SELECT * FROM "{tbl}" LIMIT 1000')
            return [dict(row) for row in cursor.fetchall()]
        except Exception as exc:
            logger.error("Failed to load data: %s", exc)
            return []
        finally:
            conn.close()

    def _compute_local_stats(self, data: list[dict]) -> dict[str, Any]:
        """Compute basic statistics locally without LLM."""
        if not data:
            return {}

        columns = list(data[0].keys())
        stats: dict[str, Any] = {}

        for col in columns:
            values = [row.get(col) for row in data if row.get(col) is not None]
            if not values:
                stats[col] = {"count": 0, "null_count": len(data)}
                continue

            # Try numeric analysis
            numeric_values = []
            for v in values:
                try:
                    numeric_values.append(float(v))
                except (ValueError, TypeError):
                    pass

            if numeric_values and len(numeric_values) > len(values) * 0.5:
                sorted_nums = sorted(numeric_values)
                n = len(sorted_nums)
                mean_val = sum(sorted_nums) / n
                stats[col] = {
                    "type": "numeric",
                    "count": len(values),
                    "null_count": len(data) - len(values),
                    "min": sorted_nums[0],
                    "max": sorted_nums[-1],
                    "mean": round(mean_val, 4),
                    "median": sorted_nums[n // 2],
                    "unique_count": len(set(sorted_nums)),
                }
            else:
                # Categorical analysis
                unique = set(str(v) for v in values)
                stats[col] = {
                    "type": "categorical",
                    "count": len(values),
                    "null_count": len(data) - len(values),
                    "unique_count": len(unique),
                    "sample_values": list(unique)[:5],
                }

        return stats

    async def _llm_analyze(
        self, data: list[dict], local_stats: dict
    ) -> dict[str, Any]:
        """Use cloud LLM for deeper analysis."""
        # Prepare data sample for LLM
        sample = data[:50]  # First 50 rows
        sample_json = json.dumps(sample, default=str)[:3000]
        stats_json = json.dumps(local_stats, default=str)[:2000]

        try:
            raw = await chat_completion(
                messages=[{"role": "user", "content": (
                    f"Analyze this dataset.\n\n"
                    f"Local statistics:\n{stats_json}\n\n"
                    f"Data sample (first 50 rows):\n{sample_json}"
                )}],
                system=ANALYTICS_SYSTEM,
                temperature=0.3,
                max_tokens=1500,
                model_tier="chat",
                json_mode=True,
            )
            return json.loads(raw)
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("LLM analysis failed: %s", exc)
            return {
                "narrative": "LLM analysis unavailable. See local_statistics for basic analysis.",
                "recommendations": ["Try again later or check your API key configuration."],
            }
