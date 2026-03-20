"""Visualization Agent - generates ECharts configurations for dashboards."""

from __future__ import annotations

import logging
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

# Color palettes
PALETTES: dict[str, list[str]] = {
    "default": [
        "#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de",
        "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc", "#48b8d0",
    ],
    "warm": [
        "#ff6b6b", "#feca57", "#ff9ff3", "#54a0ff", "#5f27cd",
        "#01a3a4", "#f368e0", "#ff9f43", "#ee5a24", "#0abde3",
    ],
    "cool": [
        "#2d3436", "#636e72", "#00b894", "#00cec9", "#0984e3",
        "#6c5ce7", "#b2bec3", "#dfe6e9", "#55efc4", "#81ecec",
    ],
}

# Chart type selection rules
CHART_RULES: list[dict[str, Any]] = [
    {"condition": "single_numeric", "chart": "histogram"},
    {"condition": "two_numeric", "chart": "scatter"},
    {"condition": "categorical_numeric", "chart": "bar"},
    {"condition": "time_numeric", "chart": "line"},
    {"condition": "categorical_only", "chart": "pie"},
    {"condition": "many_categories", "chart": "treemap"},
    {"condition": "geographic", "chart": "map"},
]


class VisualizationAgent(AgentBase):
    """Generates ECharts configuration objects for data visualization."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="visualization",
            description="Selects chart types, generates ECharts configs, and positions dashboard layouts.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Generate visualization configurations from data context."""
        payload = message.payload
        columns = payload.get("columns", [])  # [{name, dtype, inferred_type}]
        data = payload.get("data")  # list of dicts (preview rows)
        chart_request = payload.get("chart_type")  # Optional explicit request
        palette_name = payload.get("palette", "default")

        if not columns:
            return {"error": "No column information provided"}

        palette = PALETTES.get(palette_name, PALETTES["default"])

        # Auto-select charts
        if chart_request:
            charts = [self._generate_chart(chart_request, columns, data, palette)]
        else:
            charts = self._auto_select_charts(columns, data, palette)

        # Layout positioning
        layout = self._compute_layout(charts)

        return {
            "charts": charts,
            "layout": layout,
            "palette": palette_name,
        }

    def _auto_select_charts(
        self,
        columns: list[dict[str, Any]],
        data: list[dict[str, Any]] | None,
        palette: list[str],
    ) -> list[dict[str, Any]]:
        """Automatically select appropriate chart types based on column types."""
        charts: list[dict[str, Any]] = []

        numeric_cols = [c for c in columns if c.get("inferred_type") in ("numeric",)]
        categorical_cols = [c for c in columns if c.get("inferred_type") in ("categorical",)]
        datetime_cols = [c for c in columns if c.get("inferred_type") in ("datetime",)]

        # Time series line charts
        if datetime_cols and numeric_cols:
            for num_col in numeric_cols[:3]:
                charts.append(
                    self._generate_chart(
                        "line", columns, data, palette,
                        x_col=datetime_cols[0]["name"],
                        y_col=num_col["name"],
                    )
                )

        # Distribution histograms for numeric columns
        for num_col in numeric_cols[:3]:
            charts.append(
                self._generate_chart(
                    "histogram", columns, data, palette,
                    x_col=num_col["name"],
                )
            )

        # Scatter plots for numeric pairs
        if len(numeric_cols) >= 2:
            charts.append(
                self._generate_chart(
                    "scatter", columns, data, palette,
                    x_col=numeric_cols[0]["name"],
                    y_col=numeric_cols[1]["name"],
                )
            )

        # Bar charts for categorical + numeric
        if categorical_cols and numeric_cols:
            charts.append(
                self._generate_chart(
                    "bar", columns, data, palette,
                    x_col=categorical_cols[0]["name"],
                    y_col=numeric_cols[0]["name"],
                )
            )

        # Pie chart for low-cardinality categorical
        for cat_col in categorical_cols[:1]:
            charts.append(
                self._generate_chart(
                    "pie", columns, data, palette,
                    x_col=cat_col["name"],
                )
            )

        return charts if charts else [self._generate_fallback_chart(columns, data, palette)]

    def _generate_chart(
        self,
        chart_type: str,
        columns: list[dict[str, Any]],
        data: list[dict[str, Any]] | None,
        palette: list[str],
        x_col: str | None = None,
        y_col: str | None = None,
    ) -> dict[str, Any]:
        """Generate an ECharts configuration object for a specific chart type."""
        if chart_type == "line":
            return self._echart_line(x_col or "", y_col or "", data, palette)
        elif chart_type == "bar":
            return self._echart_bar(x_col or "", y_col or "", data, palette)
        elif chart_type == "scatter":
            return self._echart_scatter(x_col or "", y_col or "", data, palette)
        elif chart_type == "pie":
            return self._echart_pie(x_col or "", data, palette)
        elif chart_type == "histogram":
            return self._echart_histogram(x_col or "", data, palette)
        else:
            return self._echart_bar(x_col or "", y_col or "", data, palette)

    @staticmethod
    def _echart_line(
        x_col: str, y_col: str, data: list[dict[str, Any]] | None, palette: list[str]
    ) -> dict[str, Any]:
        """Generate ECharts line chart config."""
        x_data = [str(row.get(x_col, "")) for row in (data or [])]
        y_data = [row.get(y_col, 0) for row in (data or [])]

        return {
            "chart_type": "line",
            "title": f"{y_col} over {x_col}",
            "echarts_option": {
                "title": {"text": f"{y_col} over {x_col}"},
                "tooltip": {"trigger": "axis"},
                "xAxis": {"type": "category", "data": x_data},
                "yAxis": {"type": "value"},
                "series": [{
                    "name": y_col,
                    "type": "line",
                    "data": y_data,
                    "smooth": True,
                    "itemStyle": {"color": palette[0]},
                }],
                "color": palette,
            },
        }

    @staticmethod
    def _echart_bar(
        x_col: str, y_col: str, data: list[dict[str, Any]] | None, palette: list[str]
    ) -> dict[str, Any]:
        """Generate ECharts bar chart config."""
        # Aggregate data by category
        aggregated: dict[str, float] = {}
        for row in (data or []):
            key = str(row.get(x_col, ""))
            val = row.get(y_col, 0)
            if isinstance(val, (int, float)):
                aggregated[key] = aggregated.get(key, 0) + val

        categories = list(aggregated.keys())[:20]
        values = [aggregated[k] for k in categories]

        return {
            "chart_type": "bar",
            "title": f"{y_col} by {x_col}",
            "echarts_option": {
                "title": {"text": f"{y_col} by {x_col}"},
                "tooltip": {"trigger": "axis"},
                "xAxis": {"type": "category", "data": categories, "axisLabel": {"rotate": 30}},
                "yAxis": {"type": "value"},
                "series": [{
                    "name": y_col,
                    "type": "bar",
                    "data": values,
                    "itemStyle": {"color": palette[0]},
                }],
                "color": palette,
            },
        }

    @staticmethod
    def _echart_scatter(
        x_col: str, y_col: str, data: list[dict[str, Any]] | None, palette: list[str]
    ) -> dict[str, Any]:
        """Generate ECharts scatter plot config."""
        points = []
        for row in (data or []):
            x_val = row.get(x_col)
            y_val = row.get(y_col)
            if isinstance(x_val, (int, float)) and isinstance(y_val, (int, float)):
                points.append([x_val, y_val])

        return {
            "chart_type": "scatter",
            "title": f"{y_col} vs {x_col}",
            "echarts_option": {
                "title": {"text": f"{y_col} vs {x_col}"},
                "tooltip": {"trigger": "item"},
                "xAxis": {"type": "value", "name": x_col},
                "yAxis": {"type": "value", "name": y_col},
                "series": [{
                    "type": "scatter",
                    "data": points[:1000],
                    "itemStyle": {"color": palette[0]},
                }],
                "color": palette,
            },
        }

    @staticmethod
    def _echart_pie(
        col: str, data: list[dict[str, Any]] | None, palette: list[str]
    ) -> dict[str, Any]:
        """Generate ECharts pie chart config."""
        counts: dict[str, int] = {}
        for row in (data or []):
            val = str(row.get(col, ""))
            counts[val] = counts.get(val, 0) + 1

        pie_data = [
            {"value": v, "name": k}
            for k, v in sorted(counts.items(), key=lambda x: -x[1])[:10]
        ]

        return {
            "chart_type": "pie",
            "title": f"Distribution of {col}",
            "echarts_option": {
                "title": {"text": f"Distribution of {col}"},
                "tooltip": {"trigger": "item"},
                "series": [{
                    "type": "pie",
                    "radius": "60%",
                    "data": pie_data,
                }],
                "color": palette,
            },
        }

    @staticmethod
    def _echart_histogram(
        col: str, data: list[dict[str, Any]] | None, palette: list[str]
    ) -> dict[str, Any]:
        """Generate ECharts histogram config (binned bar chart)."""
        values = [
            row.get(col) for row in (data or [])
            if isinstance(row.get(col), (int, float))
        ]

        if not values:
            return {"chart_type": "histogram", "title": f"Histogram of {col}", "echarts_option": {}}

        min_val = min(values)
        max_val = max(values)
        num_bins = min(30, max(5, len(values) // 10))
        bin_width = (max_val - min_val) / num_bins if num_bins > 0 and max_val != min_val else 1

        bins = [0] * num_bins
        labels = []
        for i in range(num_bins):
            low = min_val + i * bin_width
            high = low + bin_width
            labels.append(f"{low:.1f}")
            for v in values:
                if low <= v < high or (i == num_bins - 1 and v == max_val):
                    bins[i] += 1

        return {
            "chart_type": "histogram",
            "title": f"Distribution of {col}",
            "echarts_option": {
                "title": {"text": f"Distribution of {col}"},
                "tooltip": {"trigger": "axis"},
                "xAxis": {"type": "category", "data": labels},
                "yAxis": {"type": "value", "name": "Count"},
                "series": [{
                    "type": "bar",
                    "data": bins,
                    "itemStyle": {"color": palette[0]},
                    "barWidth": "90%",
                }],
                "color": palette,
            },
        }

    @staticmethod
    def _generate_fallback_chart(
        columns: list[dict[str, Any]],
        data: list[dict[str, Any]] | None,
        palette: list[str],
    ) -> dict[str, Any]:
        """Generate a simple table/summary when no charts apply."""
        return {
            "chart_type": "table",
            "title": "Data Preview",
            "echarts_option": {},
            "table_data": (data or [])[:50],
            "columns": [c["name"] for c in columns],
        }

    @staticmethod
    def _compute_layout(charts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Compute grid layout positions for dashboard widgets."""
        layout: list[dict[str, Any]] = []
        cols_per_row = 2
        widget_width = 6  # Grid units (12-column grid)
        widget_height = 4

        for idx, chart in enumerate(charts):
            row = idx // cols_per_row
            col = idx % cols_per_row
            layout.append({
                "chart_index": idx,
                "title": chart.get("title", f"Chart {idx}"),
                "x": col * widget_width,
                "y": row * widget_height,
                "w": widget_width,
                "h": widget_height,
            })

        return layout
