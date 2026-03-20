"""Analytics Agent - statistical analysis, anomaly detection, and trend analysis."""

from __future__ import annotations

import logging
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class AnalyticsAgent(AgentBase):
    """Generates statistical summaries, detects anomalies and trends, and produces narrative reports."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="analytics",
            description="Performs statistical analysis, anomaly/trend detection, correlation analysis, and narrative generation via Ollama.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Run analytics on provided data."""
        payload = message.payload
        data = payload.get("data")  # list of dicts
        file_path = payload.get("file_path", "")
        analysis_type = payload.get("analysis_type", "full")

        if not data and not file_path:
            return {"error": "No data or file_path provided"}

        # Load data into Polars
        import polars as pl

        if data and isinstance(data, list):
            df = pl.DataFrame(data)
        elif file_path:
            df = self._load_dataframe(file_path)
            if df is None:
                return {"error": f"Could not load data from {file_path}"}
        else:
            return {"error": "Invalid data format"}

        results: dict[str, Any] = {"file_path": file_path}

        if analysis_type in ("full", "summary"):
            results["summary"] = self._statistical_summary(df)

        if analysis_type in ("full", "anomalies"):
            results["anomalies"] = self._detect_anomalies(df)

        if analysis_type in ("full", "trends"):
            results["trends"] = self._detect_trends(df)

        if analysis_type in ("full", "correlations"):
            results["correlations"] = self._correlation_analysis(df)

        # Generate narrative summary via Ollama
        if analysis_type == "full":
            results["narrative"] = await self._generate_narrative(results)

        return results

    @staticmethod
    def _load_dataframe(file_path: str) -> Any:
        """Load a file into a Polars DataFrame."""
        import polars as pl
        import os

        ext = os.path.splitext(file_path)[1].lower()
        try:
            if ext in (".csv", ".tsv"):
                sep = "\t" if ext == ".tsv" else ","
                return pl.read_csv(file_path, separator=sep, ignore_errors=True)
            elif ext == ".parquet":
                return pl.read_parquet(file_path)
            elif ext in (".xlsx", ".xls"):
                return pl.read_excel(file_path)
            elif ext == ".json":
                return pl.read_json(file_path)
            elif ext == ".jsonl":
                return pl.read_ndjson(file_path)
        except Exception as exc:
            logger.error("Failed to load %s: %s", file_path, exc)
        return None

    @staticmethod
    def _statistical_summary(df: Any) -> dict[str, Any]:
        """Generate a statistical summary for all columns."""
        import polars as pl

        summary: dict[str, Any] = {
            "row_count": df.height,
            "column_count": df.width,
            "columns": {},
        }

        for col_name in df.columns:
            col = df[col_name]
            col_summary: dict[str, Any] = {
                "dtype": str(col.dtype),
                "null_count": col.null_count(),
                "unique_count": col.n_unique(),
            }

            if col.dtype in (
                pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
                pl.Float32, pl.Float64,
            ):
                col_summary["min"] = col.min()
                col_summary["max"] = col.max()
                col_summary["mean"] = round(col.mean(), 4) if col.mean() is not None else None
                col_summary["median"] = col.median()
                col_summary["std"] = round(col.std(), 4) if col.std() is not None else None

                # Percentiles
                try:
                    col_summary["q25"] = col.quantile(0.25)
                    col_summary["q75"] = col.quantile(0.75)
                except Exception:
                    pass

            elif col.dtype in (pl.Utf8, pl.String):
                non_null = col.drop_nulls()
                if non_null.len() > 0:
                    lengths = non_null.str.len_chars()
                    col_summary["avg_length"] = round(lengths.mean(), 2) if lengths.mean() is not None else None

                    # Top values
                    try:
                        value_counts = non_null.value_counts().sort("count", descending=True).head(10)
                        col_summary["top_values"] = value_counts.to_dicts()
                    except Exception:
                        pass

            summary["columns"][col_name] = col_summary

        return summary

    @staticmethod
    def _detect_anomalies(df: Any) -> list[dict[str, Any]]:
        """Detect anomalies using the IQR method for numeric columns."""
        import polars as pl

        anomalies: list[dict[str, Any]] = []

        for col_name in df.columns:
            col = df[col_name]
            if col.dtype not in (
                pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
                pl.Float32, pl.Float64,
            ):
                continue

            try:
                q1 = col.quantile(0.25)
                q3 = col.quantile(0.75)
                if q1 is None or q3 is None:
                    continue

                iqr = q3 - q1
                lower_bound = q1 - 1.5 * iqr
                upper_bound = q3 + 1.5 * iqr

                outlier_count = int(((col < lower_bound) | (col > upper_bound)).sum())

                if outlier_count > 0:
                    anomalies.append({
                        "column": col_name,
                        "method": "IQR",
                        "lower_bound": round(lower_bound, 4),
                        "upper_bound": round(upper_bound, 4),
                        "outlier_count": outlier_count,
                        "outlier_pct": round(outlier_count / df.height * 100, 2),
                    })
            except Exception:
                continue

        return anomalies

    @staticmethod
    def _detect_trends(df: Any) -> list[dict[str, Any]]:
        """Detect trends in time-series-like data."""
        import polars as pl

        trends: list[dict[str, Any]] = []

        # Find date/datetime columns
        date_cols = [
            c for c in df.columns
            if df[c].dtype in (pl.Date, pl.Datetime)
        ]

        if not date_cols:
            return trends

        # Find numeric columns for trend detection
        numeric_cols = [
            c for c in df.columns
            if df[c].dtype in (
                pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                pl.Float32, pl.Float64,
            )
        ]

        for date_col in date_cols:
            for num_col in numeric_cols:
                try:
                    sorted_df = df.sort(date_col).drop_nulls([date_col, num_col])
                    if sorted_df.height < 3:
                        continue

                    values = sorted_df[num_col].to_list()
                    n = len(values)

                    # Simple linear trend (slope of least squares)
                    x_mean = (n - 1) / 2
                    y_mean = sum(values) / n
                    numerator = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
                    denominator = sum((i - x_mean) ** 2 for i in range(n))

                    if denominator > 0:
                        slope = numerator / denominator
                        direction = "increasing" if slope > 0 else "decreasing" if slope < 0 else "stable"

                        # Strength of trend (R-squared)
                        y_pred = [y_mean + slope * (i - x_mean) for i in range(n)]
                        ss_res = sum((v - p) ** 2 for v, p in zip(values, y_pred))
                        ss_tot = sum((v - y_mean) ** 2 for v in values)
                        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

                        trends.append({
                            "date_column": date_col,
                            "value_column": num_col,
                            "direction": direction,
                            "slope": round(slope, 6),
                            "r_squared": round(r_squared, 4),
                            "strength": "strong" if r_squared > 0.7 else "moderate" if r_squared > 0.3 else "weak",
                        })
                except Exception:
                    continue

        return trends

    @staticmethod
    def _correlation_analysis(df: Any) -> list[dict[str, Any]]:
        """Compute pairwise correlations between numeric columns."""
        import polars as pl

        numeric_cols = [
            c for c in df.columns
            if df[c].dtype in (
                pl.Int8, pl.Int16, pl.Int32, pl.Int64,
                pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
                pl.Float32, pl.Float64,
            )
        ]

        if len(numeric_cols) < 2:
            return []

        correlations: list[dict[str, Any]] = []

        for i in range(len(numeric_cols)):
            for j in range(i + 1, len(numeric_cols)):
                col_a = numeric_cols[i]
                col_b = numeric_cols[j]
                try:
                    corr = df.select(pl.corr(col_a, col_b)).item()
                    if corr is not None:
                        correlations.append({
                            "column_a": col_a,
                            "column_b": col_b,
                            "correlation": round(corr, 4),
                            "strength": (
                                "strong" if abs(corr) > 0.7
                                else "moderate" if abs(corr) > 0.3
                                else "weak"
                            ),
                        })
                except Exception:
                    continue

        # Sort by absolute correlation
        correlations.sort(key=lambda c: abs(c["correlation"]), reverse=True)
        return correlations

    async def _generate_narrative(self, results: dict[str, Any]) -> str:
        """Generate a narrative summary using Ollama."""
        try:
            from services.ollama_client import OllamaClient

            client = OllamaClient()

            # Build prompt from results
            prompt_parts = ["Summarize the following data analysis results in 2-3 paragraphs:\n"]

            if "summary" in results:
                summary = results["summary"]
                prompt_parts.append(
                    f"Dataset: {summary.get('row_count', 0)} rows, "
                    f"{summary.get('column_count', 0)} columns."
                )

            if "anomalies" in results and results["anomalies"]:
                prompt_parts.append(
                    f"Anomalies detected in {len(results['anomalies'])} columns."
                )

            if "trends" in results and results["trends"]:
                prompt_parts.append(
                    f"Trends found: {len(results['trends'])} time-series patterns."
                )

            if "correlations" in results and results["correlations"]:
                strong = [c for c in results["correlations"] if c["strength"] == "strong"]
                prompt_parts.append(
                    f"Correlations: {len(strong)} strong correlations found."
                )

            prompt = "\n".join(prompt_parts)

            response = await client.chat(
                messages=[{"role": "user", "content": prompt}],
                model="llama3",
            )
            return response.get("content", "Narrative generation failed.")
        except Exception as exc:
            logger.warning("Narrative generation failed: %s", exc)
            return f"Narrative generation unavailable: {exc}"
