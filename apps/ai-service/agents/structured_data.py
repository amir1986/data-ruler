"""Structured Data Agent - parses JSON, XML, YAML, TOML, INI files."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


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
                records = data if isinstance(data, list) else [data]

        if records and isinstance(records[0], dict):
            columns = list(records[0].keys())
            rows = records
        else:
            columns = ["value"]
            rows = [{"value": str(r)} for r in records]

        return {"columns": columns, "rows": rows[:50000], "row_count": len(rows), "format": fmt}

    def _parse_xml(self, path: str) -> dict[str, Any]:
        try:
            import xmltodict
            with open(path, "r", encoding="utf-8") as f:
                data = xmltodict.parse(f.read())
            return {"data": data, "format": "xml", "columns": [], "rows": []}
        except ImportError:
            return {"error": "xmltodict not installed"}

    def _parse_yaml(self, path: str) -> dict[str, Any]:
        try:
            import yaml
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            if isinstance(data, list) and data and isinstance(data[0], dict):
                return {"columns": list(data[0].keys()), "rows": data, "row_count": len(data), "format": "yaml"}
            return {"data": data, "format": "yaml", "columns": [], "rows": []}
        except ImportError:
            return {"error": "pyyaml not installed"}

    def _parse_toml(self, path: str) -> dict[str, Any]:
        try:
            import toml as toml_lib
            with open(path, "r", encoding="utf-8") as f:
                data = toml_lib.load(f)
            return {"data": data, "format": "toml", "columns": [], "rows": []}
        except ImportError:
            return {"error": "toml not installed"}
