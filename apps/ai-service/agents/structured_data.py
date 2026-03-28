"""Structured Data Agent - parses JSON, XML, YAML, TOML, INI files."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

MAX_ROWS = 50_000
MAX_FLATTEN_DEPTH = 5


def _flatten_dict(obj: dict, prefix: str = "", sep: str = ".", depth: int = 0) -> dict:
    """Recursively flatten a nested dict using dot-notation keys."""
    items: dict[str, Any] = {}
    for key, val in obj.items():
        new_key = f"{prefix}{sep}{key}" if prefix else key
        if isinstance(val, dict) and depth < MAX_FLATTEN_DEPTH:
            items.update(_flatten_dict(val, new_key, sep, depth + 1))
        elif isinstance(val, list) and val and isinstance(val[0], dict) and depth < MAX_FLATTEN_DEPTH:
            # Store complex nested arrays as JSON strings
            items[new_key] = json.dumps(val, default=str, ensure_ascii=False)
        else:
            items[new_key] = val
    return items


def _find_data_array(obj: dict) -> list[dict] | None:
    """Find the largest array of dicts inside a wrapper object.

    Handles patterns like {"data": [...], "meta": {...}} or
    {"results": [...], "count": 42}.
    """
    best: list | None = None
    best_len = 0
    for val in obj.values():
        if isinstance(val, list) and len(val) > best_len:
            if val and isinstance(val[0], dict):
                best = val
                best_len = len(val)
    return best


def _to_columnar(records: list[dict], fmt: str) -> dict[str, Any]:
    """Convert a list of (possibly nested) dicts to {columns, rows} format."""
    if not records:
        return {"columns": [], "rows": [], "row_count": 0, "format": fmt}

    # Flatten each record
    flat = [_flatten_dict(r) if isinstance(r, dict) else {"value": r} for r in records[:MAX_ROWS]]

    # Collect union of all keys (preserving insertion order)
    seen: dict[str, None] = {}
    for row in flat:
        for k in row:
            seen.setdefault(k, None)
    columns = list(seen)

    # Normalise each row to have all columns
    rows = [{c: row.get(c) for c in columns} for row in flat]

    return {"columns": columns, "rows": rows, "row_count": len(rows), "format": fmt}


def _structurize(data: Any, fmt: str) -> dict[str, Any]:
    """Route arbitrary parsed data to the right flattening strategy."""
    # List of dicts — most common tabular case
    if isinstance(data, list):
        if data and isinstance(data[0], dict):
            return _to_columnar(data, fmt)
        # List of scalars
        return _to_columnar([{"value": v} for v in data], fmt)

    # Dict — look for a wrapped array first
    if isinstance(data, dict):
        arr = _find_data_array(data)
        if arr:
            return _to_columnar(arr, fmt)
        # Single dict — flatten to one row
        return _to_columnar([data], fmt)

    # Scalar
    return {"columns": ["value"], "rows": [{"value": data}], "row_count": 1, "format": fmt}


class StructuredDataAgent(AgentBase):
    def __init__(self) -> None:
        super().__init__(
            agent_name="structured_data",
            description="Parses JSON, XML, YAML, TOML, INI files into structured data.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        file_path = payload.get("file_path", "")
        file_type = payload.get("file_type", "")
        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}
        return await self.process_file(file_path, file_type)

    async def process_file(self, file_path: str, file_type: str = "") -> dict[str, Any]:
        ext = os.path.splitext(file_path)[1].lower()
        if not file_type:
            file_type = {".json": "json", ".jsonl": "jsonl", ".xml": "xml",
                         ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
                         ".ini": "ini"}.get(ext, "json")
        try:
            if file_type in ("json", "jsonl"):
                return self._parse_json(file_path, file_type)
            elif file_type == "xml":
                return self._parse_xml(file_path)
            elif file_type == "yaml":
                return self._parse_yaml(file_path)
            elif file_type == "toml":
                return self._parse_toml(file_path)
            else:
                return self._parse_json(file_path, "json")
        except Exception as exc:
            return {"error": str(exc)}

    def _parse_json(self, path: str, fmt: str) -> dict[str, Any]:
        with open(path, "r", encoding="utf-8") as f:
            if fmt == "jsonl":
                records = [json.loads(line) for line in f if line.strip()]
            else:
                data = json.load(f)
                return _structurize(data, fmt)

        return _structurize(records, fmt)

    def _parse_xml(self, path: str) -> dict[str, Any]:
        try:
            import xmltodict
            with open(path, "r", encoding="utf-8") as f:
                data = xmltodict.parse(f.read())
            # xmltodict wraps in a root element — unwrap one level
            if isinstance(data, dict) and len(data) == 1:
                data = next(iter(data.values()))
            return _structurize(data, "xml")
        except ImportError:
            return {"error": "xmltodict not installed"}

    def _parse_yaml(self, path: str) -> dict[str, Any]:
        try:
            import yaml
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            return _structurize(data, "yaml")
        except ImportError:
            return {"error": "pyyaml not installed"}

    def _parse_toml(self, path: str) -> dict[str, Any]:
        try:
            import toml as toml_lib
            with open(path, "r", encoding="utf-8") as f:
                data = toml_lib.load(f)
            return _structurize(data, "toml")
        except ImportError:
            return {"error": "toml not installed"}
