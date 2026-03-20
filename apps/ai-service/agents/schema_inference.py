"""Schema Inference Agent - detects column types, quality profiles, and PII."""

from __future__ import annotations

import logging
import re
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

# PII detection patterns
PII_PATTERNS: dict[str, str] = {
    "email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    "phone_us": r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "ssn": r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b",
    "ip_address": r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
    "date_of_birth": r"\b(?:dob|date.?of.?birth|birthdate|birth.?date)\b",
}


class SchemaInferenceAgent(AgentBase):
    """Infers schema, profiles data quality, and detects PII."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="schema_inference",
            description="Detects column types, computes quality profiles, and scans for PII patterns.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Analyze schema and data quality from provided data."""
        payload = message.payload
        data = payload.get("data")  # list of dicts (rows)
        schema = payload.get("schema")  # list of {name, dtype}
        file_path = payload.get("file_path", "")

        # If data is provided inline, profile it directly
        if data and isinstance(data, list) and isinstance(data[0], dict):
            return await self._profile_dicts(data, file_path)

        # If a file path is provided, attempt to load with Polars
        if file_path:
            return await self._profile_from_file(file_path, schema)

        # If only schema is provided, do type inference on schema
        if schema:
            return self._infer_from_schema(schema)

        return {"error": "No data, schema, or file_path provided"}

    async def _profile_dicts(
        self, data: list[dict[str, Any]], file_path: str
    ) -> dict[str, Any]:
        """Profile a list of dictionaries."""
        import polars as pl

        df = pl.DataFrame(data)
        return self._profile_dataframe(df, file_path)

    async def _profile_from_file(
        self, file_path: str, schema: list[dict[str, str]] | None
    ) -> dict[str, Any]:
        """Load a file with Polars and profile it."""
        import polars as pl
        import os

        ext = os.path.splitext(file_path)[1].lower()

        try:
            if ext in (".csv", ".tsv"):
                sep = "\t" if ext == ".tsv" else ","
                df = pl.read_csv(file_path, separator=sep, infer_schema_length=10000, ignore_errors=True)
            elif ext == ".parquet":
                df = pl.read_parquet(file_path)
            elif ext in (".xlsx", ".xls"):
                df = pl.read_excel(file_path, infer_schema_length=10000)
            elif ext == ".json":
                df = pl.read_json(file_path)
            elif ext == ".jsonl":
                df = pl.read_ndjson(file_path)
            else:
                return {"error": f"Unsupported format for profiling: {ext}"}
        except Exception as exc:
            return {"error": f"Failed to load {file_path}: {exc}"}

        return self._profile_dataframe(df, file_path)

    def _profile_dataframe(self, df: Any, file_path: str) -> dict[str, Any]:
        """Generate a complete profile for a Polars DataFrame."""
        import polars as pl

        row_count = df.height
        col_count = df.width

        columns: list[dict[str, Any]] = []
        pii_findings: list[dict[str, str]] = []

        for col_name in df.columns:
            col = df[col_name]
            col_dtype = str(col.dtype)
            inferred_type = self._infer_semantic_type(col, col_name, col_dtype)

            profile: dict[str, Any] = {
                "name": col_name,
                "polars_dtype": col_dtype,
                "inferred_type": inferred_type,
                "null_count": col.null_count(),
                "null_pct": round(col.null_count() / row_count * 100, 2) if row_count > 0 else 0,
                "unique_count": col.n_unique(),
                "unique_pct": round(col.n_unique() / row_count * 100, 2) if row_count > 0 else 0,
            }

            # Numeric statistics
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
                profile["zeros"] = int((col == 0).sum())

            # String statistics
            elif col.dtype == pl.Utf8 or col.dtype == pl.String:
                non_null = col.drop_nulls()
                if non_null.len() > 0:
                    lengths = non_null.str.len_chars()
                    profile["min_length"] = lengths.min()
                    profile["max_length"] = lengths.max()
                    profile["avg_length"] = round(lengths.mean(), 2) if lengths.mean() is not None else None

                    # Sample values for pattern detection
                    sample = non_null.head(1000).to_list()
                    patterns = self._detect_patterns(sample)
                    profile["patterns"] = patterns

                    # PII scanning
                    pii = self._scan_pii(col_name, sample)
                    if pii:
                        pii_findings.extend(pii)
                        profile["pii_detected"] = [p["type"] for p in pii]

            # Boolean statistics
            elif col.dtype == pl.Boolean:
                profile["true_count"] = int(col.sum()) if col.sum() is not None else 0
                profile["false_count"] = row_count - profile["true_count"] - col.null_count()

            # Date statistics
            elif col.dtype in (pl.Date, pl.Datetime):
                profile["min"] = str(col.min()) if col.min() is not None else None
                profile["max"] = str(col.max()) if col.max() is not None else None

            columns.append(profile)

        # Dataset-level metrics
        try:
            duplicate_count = row_count - df.unique().height
        except Exception:
            duplicate_count = 0

        quality_score = self._compute_quality_score(columns, row_count)

        return {
            "row_count": row_count,
            "column_count": col_count,
            "duplicate_count": duplicate_count,
            "quality_score": quality_score,
            "columns": columns,
            "pii_findings": pii_findings,
            "file_path": file_path,
        }

    @staticmethod
    def _infer_semantic_type(col: Any, col_name: str, dtype_str: str) -> str:
        """Infer the semantic type of a column."""
        import polars as pl

        name_lower = col_name.lower()

        # Boolean
        if col.dtype == pl.Boolean:
            return "boolean"

        # Date/datetime
        if col.dtype in (pl.Date, pl.Datetime):
            return "datetime"

        # Numeric types
        if col.dtype in (
            pl.Int8, pl.Int16, pl.Int32, pl.Int64,
            pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64,
            pl.Float32, pl.Float64,
        ):
            # Check if it looks like an ID
            if any(kw in name_lower for kw in ("id", "_id", "key", "code")):
                return "identifier"
            return "numeric"

        # String-based inference
        if col.dtype in (pl.Utf8, pl.String):
            sample = col.drop_nulls().head(100).to_list()
            if not sample:
                return "text"

            # Email
            if all(re.match(PII_PATTERNS["email"], str(v)) for v in sample[:10] if v):
                return "email"

            # Date strings
            date_pattern = r"^\d{4}[-/]\d{2}[-/]\d{2}"
            if all(re.match(date_pattern, str(v)) for v in sample[:10] if v):
                return "datetime"

            # Categorical (low cardinality)
            unique_ratio = col.n_unique() / max(col.len(), 1)
            if unique_ratio < 0.05 and col.n_unique() < 50:
                return "categorical"

            # Check average length for text vs short string
            avg_len = sum(len(str(v)) for v in sample) / max(len(sample), 1)
            if avg_len > 100:
                return "text"
            return "categorical" if unique_ratio < 0.3 else "text"

        return "unknown"

    @staticmethod
    def _detect_patterns(sample: list[str]) -> list[dict[str, Any]]:
        """Detect common patterns in string values."""
        patterns: list[dict[str, Any]] = []

        pattern_checks = [
            ("email", PII_PATTERNS["email"]),
            ("phone", PII_PATTERNS["phone_us"]),
            ("url", r"^https?://\S+"),
            ("date_iso", r"^\d{4}-\d{2}-\d{2}"),
            ("uuid", r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"),
            ("numeric_string", r"^-?\d+\.?\d*$"),
        ]

        for name, pattern in pattern_checks:
            match_count = sum(1 for v in sample if re.match(pattern, str(v), re.IGNORECASE))
            if match_count > len(sample) * 0.5:
                patterns.append({
                    "pattern": name,
                    "match_rate": round(match_count / len(sample), 3),
                })

        return patterns

    @staticmethod
    def _scan_pii(col_name: str, sample: list[str]) -> list[dict[str, str]]:
        """Scan a column for PII patterns."""
        findings: list[dict[str, str]] = []

        # Check column name for PII hints
        name_lower = col_name.lower()
        pii_name_hints = {
            "email": ["email", "e_mail", "e-mail"],
            "phone": ["phone", "tel", "mobile", "cell"],
            "ssn": ["ssn", "social_security", "social_sec"],
            "name": ["first_name", "last_name", "full_name", "surname"],
            "address": ["address", "street", "city", "zip", "postal"],
        }

        for pii_type, hints in pii_name_hints.items():
            if any(h in name_lower for h in hints):
                findings.append({"type": pii_type, "source": "column_name", "column": col_name})

        # Check values
        for pii_type in ("email", "phone_us", "ssn", "credit_card"):
            pattern = PII_PATTERNS[pii_type]
            match_count = sum(1 for v in sample[:200] if re.search(pattern, str(v)))
            if match_count > len(sample[:200]) * 0.3:
                findings.append({
                    "type": pii_type,
                    "source": "value_pattern",
                    "column": col_name,
                    "match_rate": str(round(match_count / len(sample[:200]), 3)),
                })

        return findings

    @staticmethod
    def _compute_quality_score(
        columns: list[dict[str, Any]], row_count: int
    ) -> float:
        """Compute an overall data quality score (0-100)."""
        if not columns or row_count == 0:
            return 0.0

        scores: list[float] = []
        for col in columns:
            col_score = 100.0

            # Penalize for nulls
            null_pct = col.get("null_pct", 0)
            col_score -= null_pct * 0.5

            # Penalize for low uniqueness (potential constant columns)
            unique_pct = col.get("unique_pct", 100)
            if unique_pct < 0.1:
                col_score -= 20

            scores.append(max(0, col_score))

        return round(sum(scores) / len(scores), 2)

    @staticmethod
    def _infer_from_schema(schema: list[dict[str, str]]) -> dict[str, Any]:
        """Infer semantic types from schema information alone."""
        columns = []
        for col_info in schema:
            name = col_info.get("name", "")
            dtype = col_info.get("dtype", "")
            name_lower = name.lower()

            inferred = "unknown"
            if "int" in dtype.lower() or "float" in dtype.lower():
                inferred = "numeric"
            elif "bool" in dtype.lower():
                inferred = "boolean"
            elif "date" in dtype.lower() or "time" in dtype.lower():
                inferred = "datetime"
            elif "str" in dtype.lower() or "utf" in dtype.lower() or "string" in dtype.lower():
                if any(kw in name_lower for kw in ("email",)):
                    inferred = "email"
                elif any(kw in name_lower for kw in ("id", "_id", "key")):
                    inferred = "identifier"
                else:
                    inferred = "text"

            columns.append({
                "name": name,
                "dtype": dtype,
                "inferred_type": inferred,
            })

        return {"columns": columns, "source": "schema_only"}
