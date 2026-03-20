"""Visualization Agent - generates ECharts configurations via cloud LLM."""

from __future__ import annotations

import json
import logging
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage
from services.ollama_client import chat_completion

logger = logging.getLogger(__name__)

PALETTES = {
    "default": [
        "#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de",
        "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc", "#48b8d0",
    ],
}

VIZ_SYSTEM = """You are a data visualization expert. Generate Apache ECharts option configurations.

Given data and a user request, produce a valid ECharts option JSON object. Follow these rules:
1. Choose the best chart type (bar, line, pie, scatter, heatmap, etc.) based on the data
2. Always include: title, tooltip, legend, grid, xAxis, yAxis (where applicable), series
3. Use the color palette: ["#5470c6","#91cc75","#fac858","#ee6666","#73c0de","#3ba272","#fc8452","#9a60b4"]
4. Make charts responsive with grid: {left: '3%', right: '4%', bottom: '3%', containLabel: true}
5. Include data labels for key values
6. Use reasonable axis formatting (%, currency, dates, etc.)

Respond with ONLY valid JSON — no explanation, no markdown:
{
  "chart_type": "bar|line|pie|scatter|heatmap|treemap|radar|funnel|gauge",
  "title": "Chart Title",
  "echarts_option": { ... full ECharts option object ... },
  "description": "Brief description of what the chart shows"
}"""


class VisualizationAgent(AgentBase):
    """Generates ECharts configurations for dashboards using cloud LLM."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="visualization",
            description="Generates ECharts chart configurations from data using cloud LLM intelligence.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        data = payload.get("data", [])
        columns = payload.get("columns", [])
        chart_request = payload.get("chart_request", "")
        analytics_result = payload.get("analytics_result", {})
        schema_context = payload.get("schema_context", "")

        if not data and not analytics_result:
            return self._default_chart()

        # Prepare data summary for LLM
        data_summary = self._summarize_data(data, columns, analytics_result)

        try:
            raw = await chat_completion(
                messages=[{"role": "user", "content": (
                    f"Create a visualization for this data.\n\n"
                    f"User request: {chart_request or 'Auto-select the best chart type'}\n\n"
                    f"Data summary:\n{data_summary}\n\n"
                    f"Schema context: {schema_context}"
                )}],
                system=VIZ_SYSTEM,
                temperature=0.3,
                max_tokens=2000,
                model_tier="code",
                json_mode=True,
            )
            chart_config = json.loads(raw)
            return {
                "chart_type": chart_config.get("chart_type", "bar"),
                "title": chart_config.get("title", "Data Visualization"),
                "echarts_option": chart_config.get("echarts_option", {}),
                "description": chart_config.get("description", ""),
                "status": "success",
            }
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("LLM chart generation failed: %s — using auto-chart", exc)
            return self._auto_chart(data, columns)

    def _summarize_data(
        self, data: list[dict], columns: list[str], analytics: dict
    ) -> str:
        """Create a compact data summary for the LLM."""
        parts = []
        if columns:
            parts.append(f"Columns: {', '.join(columns[:20])}")
        if data:
            parts.append(f"Row count: {len(data)}")
            sample = json.dumps(data[:10], default=str)[:1500]
            parts.append(f"Sample rows:\n{sample}")
        if analytics:
            stats = json.dumps(analytics, default=str)[:1000]
            parts.append(f"Analytics:\n{stats}")
        return "\n".join(parts)

    def _auto_chart(self, data: list[dict], columns: list[str]) -> dict[str, Any]:
        """Fallback: generate a simple bar chart without LLM."""
        if not data:
            return self._default_chart()

        cols = columns or list(data[0].keys())
        # Find first numeric column and first categorical column
        cat_col = None
        num_col = None
        for col in cols:
            values = [row.get(col) for row in data[:20] if row.get(col) is not None]
            if not values:
                continue
            try:
                [float(v) for v in values]
                if num_col is None:
                    num_col = col
            except (ValueError, TypeError):
                if cat_col is None:
                    cat_col = col

        if not num_col:
            return self._default_chart()

        cat_col = cat_col or cols[0]
        categories = [str(row.get(cat_col, ""))[:20] for row in data[:20]]
        values = []
        for row in data[:20]:
            try:
                values.append(float(row.get(num_col, 0)))
            except (ValueError, TypeError):
                values.append(0)

        return {
            "chart_type": "bar",
            "title": f"{num_col} by {cat_col}",
            "echarts_option": {
                "title": {"text": f"{num_col} by {cat_col}", "left": "center"},
                "tooltip": {"trigger": "axis"},
                "grid": {"left": "3%", "right": "4%", "bottom": "3%", "containLabel": True},
                "xAxis": {"type": "category", "data": categories},
                "yAxis": {"type": "value"},
                "series": [{"data": values, "type": "bar", "color": PALETTES["default"][0]}],
            },
            "description": f"Bar chart showing {num_col} by {cat_col}",
            "status": "fallback",
        }

    @staticmethod
    def _default_chart() -> dict[str, Any]:
        return {
            "chart_type": "empty",
            "title": "No Data",
            "echarts_option": {
                "title": {"text": "No data available", "left": "center", "top": "center"},
            },
            "description": "No data provided for visualization",
            "status": "empty",
        }
