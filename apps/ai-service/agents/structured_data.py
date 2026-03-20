"""Structured Data Agent - parses JSON, JSONL, XML, YAML, and TOML files."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class StructuredDataAgent(AgentBase):
    """Parses structured data formats with automatic flattening."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="structured_data",
            description="Parses JSON, JSONL, XML, YAML, and TOML with nesting detection and flattening.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Process a structured data file."""
        payload = message.payload
        file_path: str = payload.get("file_path", "")
        extension: str = payload.get("extension", "")

        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        ext = extension or os.path.splitext(file_path)[1].lower()

        try:
            if ext == ".json":
                return await self._parse_json(file_path)
            elif ext == ".jsonl":
                return await self._parse_jsonl(file_path)
            elif ext == ".xml":
                return await self._parse_xml(file_path)
            elif ext in (".yaml", ".yml"):
                return await self._parse_yaml(file_path)
            elif ext == ".toml":
                return await self._parse_toml(file_path)
            else:
                # Try JSON as default
                return await self._parse_json(file_path)
        except Exception as exc:
            self.logger.error("Failed to parse structured data %s: %s", file_path, exc)
            return {"error": str(exc), "file_path": file_path}

    async def _parse_json(self, file_path: str) -> dict[str, Any]:
        """Parse a JSON file with flattening."""
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        nesting_depth = self._measure_depth(data)
        is_array = isinstance(data, list)
        record_count = len(data) if is_array else 1

        # Flatten if it is an array of objects
        flattened: list[dict[str, Any]] = []
        schema: list[dict[str, str]] = []

        if is_array and data and isinstance(data[0], dict):
            flattened = [self._flatten(item) for item in data[:100]]
            schema = self._infer_schema(data[:1000])
        elif isinstance(data, dict):
            flattened = [self._flatten(data)]
            schema = self._infer_schema([data])

        return {
            "format": "json",
            "is_array": is_array,
            "record_count": record_count,
            "nesting_depth": nesting_depth,
            "schema": schema,
            "preview": flattened,
            "file_path": file_path,
        }

    async def _parse_jsonl(self, file_path: str) -> dict[str, Any]:
        """Parse a JSONL (JSON Lines) file."""
        records: list[dict[str, Any]] = []
        parse_errors = 0

        with open(file_path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    parse_errors += 1

        flattened = [self._flatten(r) for r in records[:100]]
        schema = self._infer_schema(records[:1000])

        return {
            "format": "jsonl",
            "record_count": len(records),
            "parse_errors": parse_errors,
            "nesting_depth": max(self._measure_depth(r) for r in records[:100]) if records else 0,
            "schema": schema,
            "preview": flattened,
            "file_path": file_path,
        }

    async def _parse_xml(self, file_path: str) -> dict[str, Any]:
        """Parse an XML file using xmltodict."""
        try:
            import xmltodict

            with open(file_path, "r", encoding="utf-8") as f:
                data = xmltodict.parse(f.read())
        except ImportError:
            # Fallback to stdlib ElementTree
            import xml.etree.ElementTree as ET

            tree = ET.parse(file_path)
            root = tree.getroot()
            data = self._etree_to_dict(root)

        nesting_depth = self._measure_depth(data)

        # Try to flatten
        flattened = [self._flatten(data)]
        schema = self._infer_schema([data])

        return {
            "format": "xml",
            "nesting_depth": nesting_depth,
            "schema": schema,
            "preview": flattened,
            "file_path": file_path,
        }

    async def _parse_yaml(self, file_path: str) -> dict[str, Any]:
        """Parse a YAML file."""
        import yaml

        with open(file_path, "r", encoding="utf-8") as f:
            # Use safe_load_all for multi-document YAML
            documents = list(yaml.safe_load_all(f))

        # Filter out None documents
        documents = [d for d in documents if d is not None]

        if len(documents) == 1:
            data = documents[0]
        else:
            data = documents

        nesting_depth = self._measure_depth(data)
        is_array = isinstance(data, list)
        record_count = len(data) if is_array else 1

        flattened: list[dict[str, Any]] = []
        schema: list[dict[str, str]] = []

        if is_array and data and isinstance(data[0], dict):
            flattened = [self._flatten(item) for item in data[:100]]
            schema = self._infer_schema(data[:1000])
        elif isinstance(data, dict):
            flattened = [self._flatten(data)]
            schema = self._infer_schema([data])

        return {
            "format": "yaml",
            "is_array": is_array,
            "record_count": record_count,
            "document_count": len(documents),
            "nesting_depth": nesting_depth,
            "schema": schema,
            "preview": flattened,
            "file_path": file_path,
        }

    async def _parse_toml(self, file_path: str) -> dict[str, Any]:
        """Parse a TOML file."""
        try:
            import tomllib

            with open(file_path, "rb") as f:
                data = tomllib.load(f)
        except ImportError:
            import tomli as tomllib  # type: ignore[no-redef]

            with open(file_path, "rb") as f:
                data = tomllib.load(f)

        nesting_depth = self._measure_depth(data)
        flattened = [self._flatten(data)]
        schema = self._infer_schema([data])

        return {
            "format": "toml",
            "nesting_depth": nesting_depth,
            "schema": schema,
            "preview": flattened,
            "file_path": file_path,
        }

    @staticmethod
    def _flatten(
        obj: Any, prefix: str = "", separator: str = "."
    ) -> dict[str, Any]:
        """Recursively flatten a nested structure."""
        flat: dict[str, Any] = {}
        if isinstance(obj, dict):
            for key, value in obj.items():
                full_key = f"{prefix}{separator}{key}" if prefix else key
                if isinstance(value, dict):
                    flat.update(StructuredDataAgent._flatten(value, full_key, separator))
                elif isinstance(value, list):
                    if value and isinstance(value[0], dict):
                        for i, item in enumerate(value[:10]):
                            flat.update(
                                StructuredDataAgent._flatten(
                                    item, f"{full_key}[{i}]", separator
                                )
                            )
                        flat[f"{full_key}.__count"] = len(value)
                    else:
                        flat[full_key] = value
                else:
                    flat[full_key] = value
        else:
            flat[prefix or "value"] = obj
        return flat

    @staticmethod
    def _measure_depth(obj: Any, current: int = 0) -> int:
        """Measure the maximum nesting depth of a structure."""
        if isinstance(obj, dict):
            if not obj:
                return current + 1
            return max(
                StructuredDataAgent._measure_depth(v, current + 1)
                for v in obj.values()
            )
        elif isinstance(obj, list):
            if not obj:
                return current + 1
            return max(
                StructuredDataAgent._measure_depth(item, current + 1)
                for item in obj[:100]
            )
        return current

    @staticmethod
    def _infer_schema(records: list[Any]) -> list[dict[str, str]]:
        """Infer a flat schema from a list of records."""
        field_types: dict[str, set[str]] = {}

        for record in records:
            if isinstance(record, dict):
                flat = StructuredDataAgent._flatten(record)
                for key, value in flat.items():
                    if key not in field_types:
                        field_types[key] = set()
                    field_types[key].add(type(value).__name__)

        return [
            {"name": key, "dtype": "|".join(sorted(types))}
            for key, types in field_types.items()
        ]

    @staticmethod
    def _etree_to_dict(element: Any) -> dict[str, Any]:
        """Convert an ElementTree element to a dict (fallback for XML parsing)."""
        result: dict[str, Any] = {}

        # Attributes
        if element.attrib:
            result["@attributes"] = dict(element.attrib)

        # Text content
        if element.text and element.text.strip():
            if len(element) == 0:
                return {element.tag: element.text.strip()}
            result["#text"] = element.text.strip()

        # Children
        children: dict[str, list[Any]] = {}
        for child in element:
            child_dict = StructuredDataAgent._etree_to_dict(child)
            tag = child.tag
            if tag in children:
                children[tag].append(child_dict.get(tag, child_dict))
            else:
                children[tag] = [child_dict.get(tag, child_dict)]

        for tag, items in children.items():
            result[tag] = items if len(items) > 1 else items[0]

        return {element.tag: result} if result else {element.tag: ""}
