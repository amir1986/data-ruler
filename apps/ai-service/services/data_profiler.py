"""Data profiling service - column-level statistics, quality scoring, and pattern detection."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)


class DataProfiler:
    """Profiles tabular data using Polars for column-level statistics and quality scoring."""

    async def profile_file(self, file_path: str) -> dict[str, Any]:
        """Profile a tabular file and return comprehensive statistics."""
        import polars as pl

        ext = os.path.splitext(file_path)[1].lower()

        try:
            if ext in (".csv", ".tsv"):
                sep = "\t" if ext == ".tsv" else ","
                df = pl.read_csv(file_path, separator=sep, infer_schema_length=10000, ignore_errors=True)
            elif ext == ".parquet":
                df = pl.read_parquet(file_path)
            elif ext in (".xlsx", ".xls"):
                df = pl.read_excel(file_path)
            elif ext == ".json":
                df = pl.read_json(file_path)
            elif ext == ".jsonl":
                df = pl.read_ndjson(file_path)
            else:
                return {"error": f"Unsupported format: {ext}"}
        except Exception as exc:
            return {"error": f"Failed to load {file_path}: {exc}"}

        return self.profile_dataframe(df)

    def profile_dataframe(self, df: Any) -> dict[str, Any]:
        """Profile a Polars DataFrame."""
        import polars as pl

        row_count = df.height
        col_count = df.width

        columns: list[dict[str, Any]] = []

        for col_name in df.columns:
            col = df[col_name]
            col_profile = self._profile_column(col, col_name, row_count)
            columns.append(col_profile)

        # Dataset-level metrics
        try:
            duplicate_count = row_count - df.unique().height
        except Exception:
            duplicate_count = 0

        # Compute overall quality score
        quality_score = self._compute_quality_score(columns, row_count)

        # Memory estimate
        try:
            estimated_size = df.estimated_size("mb")
        except Exception:
            estimated_size = None

        return {
            "row_count": row_count,
            "column_count": col_count,
            "duplicate_count": duplicate_count,
            "duplicate_pct": round(duplicate_count / row_count * 100, 2) if row_count > 0 else 0,
            "quality_score": quality_score,
            "estimated_size_mb": estimated_size,
            "columns": columns,
        }

    @staticmethod
    def _profile_column(col: Any, col_name: str, row_count: int) -> dict[str, Any]:
        """Profile a single column."""
        import polars as pl

        profile: dict[str, Any] = {
            "name": col_name,
            "dtype": str(col.dtype),
            "null_count": col.null_count(),
            "null_pct": round(col.null_count() / row_count * 100, 2) if row_count > 0 else 0,
            "unique_count": col.n_unique(),
            "unique_pct": round(col.n_unique() / row_count * 100, 2) if row_count > 0 else 0,
        }

        # Numeric
        if col.dtype in (
            pl.Int8, pl.Int16, pl.Int32, pl.Int64,
            pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
            pl.Float32, pl.Float64,
        ):
            profile["min"] = col.min()
            profile["max"] = col.max()
            profile["mean"] = round(col.mean(), 4) if col.mean() is not None else None
            profile["std"] = round(col.std(), 4) if col.std() is not None else None
            profile["median"] = col.median()
            try:
                profile["q25"] = col.quantile(0.25)
                profile["q75"] = col.quantile(0.75)
            except Exception:
                pass
            profile["zeros"] = int((col == 0).sum())
            profile["negatives"] = int((col < 0).sum())

        # String
        elif col.dtype in (pl.Utf8, pl.String):
            non_null = col.drop_nulls()
            if non_null.len() > 0:
                lengths = non_null.str.len_chars()
                profile["min_length"] = lengths.min()
                profile["max_length"] = lengths.max()
                profile["avg_length"] = round(lengths.mean(), 2) if lengths.mean() is not None else None
                profile["empty_count"] = int((non_null == "").sum())

                # Top values
                try:
                    vc = non_null.value_counts().sort("count", descending=True).head(10)
                    profile["top_values"] = vc.to_dicts()
                except Exception:
                    pass

                # Pattern detection
                sample = non_null.head(500).to_list()
                profile["patterns"] = DataProfiler._detect_patterns(sample)

        # Boolean
        elif col.dtype == pl.Boolean:
            profile["true_count"] = int(col.sum()) if col.sum() is not None else 0
            profile["false_count"] = row_count - profile["true_count"] - col.null_count()

        # Date
        elif col.dtype in (pl.Date, pl.Datetime):
            profile["min"] = str(col.min()) if col.min() is not None else None
            profile["max"] = str(col.max()) if col.max() is not None else None

        return profile

    @staticmethod
    def _detect_patterns(sample: list[str]) -> list[dict[str, Any]]:
        """Detect common patterns in string samples."""
        patterns = []
        checks = [
            ("email", r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"),
            ("url", r"^https?://\S+"),
            ("phone", r"^\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$"),
            ("date_iso", r"^\d{4}-\d{2}-\d{2}"),
            ("uuid", r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"),
            ("numeric_string", r"^-?\d+\.?\d*$"),
            ("zip_code", r"^\d{5}(-\d{4})?$"),
        ]

        for name, pattern in checks:
            match_count = sum(1 for v in sample if re.match(pattern, str(v), re.IGNORECASE))
            rate = match_count / max(len(sample), 1)
            if rate > 0.5:
                patterns.append({"pattern": name, "match_rate": round(rate, 3)})

        return patterns

    @staticmethod
    def _compute_quality_score(columns: list[dict[str, Any]], row_count: int) -> float:
        """Compute a 0-100 data quality score."""
        if not columns or row_count == 0:
            return 0.0

        scores: list[float] = []
        for col in columns:
            score = 100.0

            # Penalize nulls
            null_pct = col.get("null_pct", 0)
            score -= null_pct * 0.5

            # Penalize constant columns
            unique_pct = col.get("unique_pct", 100)
            if unique_pct < 0.1 and row_count > 10:
                score -= 20

            # Penalize all-empty strings
            if col.get("empty_count", 0) > 0:
                empty_pct = col["empty_count"] / row_count * 100
                score -= empty_pct * 0.3

            scores.append(max(0, score))

        return round(sum(scores) / len(scores), 2)
