"""Specialized Format Agent - handles geospatial, log, code, and config files."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

# Common log format patterns
LOG_PATTERNS: dict[str, str] = {
    "apache_combined": (
        r'^(?P<ip>\S+) \S+ \S+ \[(?P<timestamp>[^\]]+)\] '
        r'"(?P<method>\S+) (?P<path>\S+) \S+" (?P<status>\d+) (?P<size>\S+)'
    ),
    "apache_common": (
        r'^(?P<ip>\S+) \S+ \S+ \[(?P<timestamp>[^\]]+)\] '
        r'"(?P<request>[^"]+)" (?P<status>\d+) (?P<size>\S+)'
    ),
    "nginx": (
        r'^(?P<ip>\S+) - \S+ \[(?P<timestamp>[^\]]+)\] '
        r'"(?P<request>[^"]+)" (?P<status>\d+) (?P<size>\d+)'
    ),
    "syslog": (
        r'^(?P<timestamp>\w+\s+\d+\s+\d+:\d+:\d+) '
        r'(?P<host>\S+) (?P<service>\S+?)(\[(?P<pid>\d+)\])?: (?P<message>.*)'
    ),
    "json_log": r'^\{.*"(level|severity|msg|message)".*\}$',
    "iso_timestamp": (
        r'^(?P<timestamp>\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\s]*)\s+'
        r'(?P<level>\w+)\s+(?P<message>.*)'
    ),
}


class SpecializedFormatAgent(AgentBase):
    """Handles geospatial, log, code, and configuration file formats."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="specialized_format",
            description="Processes GeoJSON, log files, code files, and config files (INI, env, properties).",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Process a specialized format file."""
        payload = message.payload
        file_path: str = payload.get("file_path", "")
        extension: str = payload.get("extension", "")
        mime_type: str = payload.get("mime_type", "")

        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        ext = extension or os.path.splitext(file_path)[1].lower()

        try:
            if ext == ".geojson" or mime_type == "application/geo+json":
                return await self._parse_geojson(file_path)
            elif ext == ".log" or mime_type == "text/log":
                return await self._parse_log(file_path)
            elif ext == ".ini":
                return await self._parse_ini(file_path)
            elif ext == ".env":
                return await self._parse_env(file_path)
            elif ext == ".properties":
                return await self._parse_properties(file_path)
            elif ext in (
                ".py", ".js", ".ts", ".java", ".rs", ".go", ".c", ".cpp",
                ".h", ".rb", ".php", ".swift", ".kt", ".scala", ".sh",
            ):
                return await self._parse_code(file_path, ext)
            else:
                return await self._parse_generic_text(file_path, ext)
        except Exception as exc:
            self.logger.error("Failed to parse specialized format %s: %s", file_path, exc)
            return {"error": str(exc), "file_path": file_path}

    async def _parse_geojson(self, file_path: str) -> dict[str, Any]:
        """Parse a GeoJSON file."""
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        geo_type = data.get("type", "Unknown")
        features: list[dict[str, Any]] = []
        geometry_types: dict[str, int] = {}
        properties_schema: dict[str, set[str]] = {}

        if geo_type == "FeatureCollection":
            raw_features = data.get("features", [])
            for feat in raw_features:
                geom = feat.get("geometry", {})
                geom_type = geom.get("type", "Unknown")
                geometry_types[geom_type] = geometry_types.get(geom_type, 0) + 1

                props = feat.get("properties", {})
                for key, value in (props or {}).items():
                    if key not in properties_schema:
                        properties_schema[key] = set()
                    properties_schema[key].add(type(value).__name__)

            features = raw_features[:20]  # Preview

        elif geo_type == "Feature":
            geom = data.get("geometry", {})
            geometry_types[geom.get("type", "Unknown")] = 1
            features = [data]

        schema = [
            {"name": k, "dtype": "|".join(sorted(v))}
            for k, v in properties_schema.items()
        ]

        return {
            "format": "geojson",
            "geo_type": geo_type,
            "feature_count": len(data.get("features", [])) if geo_type == "FeatureCollection" else 1,
            "geometry_types": geometry_types,
            "properties_schema": schema,
            "preview": features,
            "file_path": file_path,
        }

    async def _parse_log(self, file_path: str) -> dict[str, Any]:
        """Parse a log file, detecting common formats."""
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        total_lines = len(lines)
        sample_lines = lines[:1000]

        # Detect log format
        detected_format = None
        parsed_entries: list[dict[str, str]] = []

        for fmt_name, pattern in LOG_PATTERNS.items():
            matched = 0
            entries: list[dict[str, str]] = []
            for line in sample_lines[:50]:
                match = re.match(pattern, line.strip())
                if match:
                    matched += 1
                    entries.append(match.groupdict())

            if matched > len(sample_lines[:50]) * 0.5:  # >50% match rate
                detected_format = fmt_name
                parsed_entries = entries
                break

        # Level distribution
        level_counts: dict[str, int] = {}
        if parsed_entries:
            for entry in parsed_entries:
                level = entry.get("level", entry.get("status", "unknown"))
                level_counts[level] = level_counts.get(level, 0) + 1

        return {
            "format": "log",
            "detected_log_format": detected_format,
            "total_lines": total_lines,
            "parsed_sample_count": len(parsed_entries),
            "level_distribution": level_counts,
            "preview": parsed_entries[:20] if parsed_entries else [
                {"raw": line.strip()} for line in sample_lines[:20]
            ],
            "file_path": file_path,
        }

    async def _parse_ini(self, file_path: str) -> dict[str, Any]:
        """Parse an INI configuration file."""
        import configparser

        config = configparser.ConfigParser()
        config.read(file_path, encoding="utf-8")

        sections: dict[str, dict[str, str]] = {}
        for section in config.sections():
            sections[section] = dict(config[section])

        # Include DEFAULT section if it has values
        if config.defaults():
            sections["DEFAULT"] = dict(config.defaults())

        return {
            "format": "ini",
            "section_count": len(sections),
            "sections": sections,
            "total_keys": sum(len(v) for v in sections.values()),
            "file_path": file_path,
        }

    async def _parse_env(self, file_path: str) -> dict[str, Any]:
        """Parse a .env file."""
        variables: dict[str, str] = {}

        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip("'\"")
                    variables[key] = value

        return {
            "format": "env",
            "variable_count": len(variables),
            "variables": {k: "***" if self._is_sensitive_key(k) else v for k, v in variables.items()},
            "file_path": file_path,
        }

    async def _parse_properties(self, file_path: str) -> dict[str, Any]:
        """Parse a Java-style properties file."""
        properties: dict[str, str] = {}

        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or line.startswith("!"):
                    continue
                for sep in ("=", ":"):
                    if sep in line:
                        key, _, value = line.partition(sep)
                        properties[key.strip()] = value.strip()
                        break

        return {
            "format": "properties",
            "property_count": len(properties),
            "properties": properties,
            "file_path": file_path,
        }

    async def _parse_code(self, file_path: str, ext: str) -> dict[str, Any]:
        """Parse a code file, extracting basic structure."""
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        lines = content.split("\n")
        lang = self._ext_to_language(ext)

        # Extract basic structure
        structure: dict[str, list[str]] = {
            "imports": [],
            "classes": [],
            "functions": [],
        }

        for line in lines:
            stripped = line.strip()

            # Import detection
            if stripped.startswith(("import ", "from ", "#include", "use ", "require", "using ")):
                structure["imports"].append(stripped)

            # Class detection
            class_match = re.match(r'^(?:export\s+)?(?:class|struct|enum|interface)\s+(\w+)', stripped)
            if class_match:
                structure["classes"].append(class_match.group(1))

            # Function detection
            func_patterns = [
                r'^(?:export\s+)?(?:async\s+)?(?:def|fn|func|function)\s+(\w+)',
                r'^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)',
                r'^(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)?(\w+)\s*\(',
            ]
            for pat in func_patterns:
                func_match = re.match(pat, stripped)
                if func_match:
                    structure["functions"].append(func_match.group(1))
                    break

        return {
            "format": "code",
            "language": lang,
            "line_count": len(lines),
            "text_length": len(content),
            "structure": {
                "import_count": len(structure["imports"]),
                "class_count": len(structure["classes"]),
                "function_count": len(structure["functions"]),
                "classes": structure["classes"],
                "functions": structure["functions"][:50],
            },
            "full_text": content,
            "file_path": file_path,
        }

    async def _parse_generic_text(self, file_path: str, ext: str) -> dict[str, Any]:
        """Fallback parser for unrecognized text formats."""
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        return {
            "format": "text",
            "extension": ext,
            "line_count": content.count("\n") + 1,
            "text_length": len(content),
            "full_text": content,
            "file_path": file_path,
        }

    @staticmethod
    def _ext_to_language(ext: str) -> str:
        """Map file extension to language name."""
        lang_map = {
            ".py": "python", ".js": "javascript", ".ts": "typescript",
            ".java": "java", ".rs": "rust", ".go": "go",
            ".c": "c", ".cpp": "c++", ".h": "c-header",
            ".rb": "ruby", ".php": "php", ".swift": "swift",
            ".kt": "kotlin", ".scala": "scala", ".sh": "shell",
        }
        return lang_map.get(ext, "unknown")

    @staticmethod
    def _is_sensitive_key(key: str) -> bool:
        """Check if an env variable key looks sensitive."""
        sensitive_patterns = (
            "password", "secret", "key", "token", "auth",
            "credential", "private", "api_key", "apikey",
        )
        key_lower = key.lower()
        return any(p in key_lower for p in sensitive_patterns)
