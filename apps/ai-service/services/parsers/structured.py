"""Structured data parsers for JSON, XML, YAML, TOML."""

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def flatten_dict(d: dict, parent_key: str = "", sep: str = ".") -> dict:
    """Flatten a nested dictionary."""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep).items())
        elif isinstance(v, list):
            if len(v) > 0 and isinstance(v[0], dict):
                # Array of objects - don't flatten, keep as JSON
                items.append((new_key, json.dumps(v)))
            else:
                items.append((new_key, json.dumps(v)))
        else:
            items.append((new_key, v))
    return dict(items)


def parse_json(file_path: str) -> dict[str, Any]:
    """Parse a JSON file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, list):
            if len(data) > 0 and isinstance(data[0], dict):
                # Array of objects -> tabular
                columns = list(set().union(*(d.keys() for d in data if isinstance(d, dict))))
                rows = [{c: row.get(c) for c in columns} for row in data if isinstance(row, dict)]
                return {
                    "columns": columns,
                    "rows": rows,
                    "row_count": len(rows),
                    "structure": "array_of_objects",
                }
            return {
                "text": json.dumps(data, indent=2)[:10000],
                "structure": "array",
                "item_count": len(data),
            }
        elif isinstance(data, dict):
            # Try to flatten
            flat = flatten_dict(data)
            columns = list(flat.keys())
            rows = [flat]
            return {
                "columns": columns,
                "rows": rows,
                "row_count": 1,
                "structure": "object",
                "nesting_depth": _get_depth(data),
            }
        return {"text": str(data)[:10000], "structure": "primitive"}
    except Exception as e:
        logger.error(f"JSON parse failed: {e}")
        return {"text": "", "error": str(e)}


def parse_jsonl(file_path: str) -> dict[str, Any]:
    """Parse a JSONL (JSON Lines) file."""
    try:
        rows = []
        columns_set: set[str] = set()
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    obj = json.loads(line)
                    if isinstance(obj, dict):
                        rows.append(obj)
                        columns_set.update(obj.keys())

        columns = list(columns_set)
        return {"columns": columns, "rows": rows, "row_count": len(rows)}
    except Exception as e:
        logger.error(f"JSONL parse failed: {e}")
        return {"text": "", "error": str(e)}


def parse_xml(file_path: str) -> dict[str, Any]:
    """Parse an XML file."""
    try:
        import xmltodict
        with open(file_path, "r", encoding="utf-8") as f:
            data = xmltodict.parse(f.read())
        flat = flatten_dict(data)
        return {
            "columns": list(flat.keys()),
            "rows": [flat],
            "row_count": 1,
            "text": json.dumps(data, indent=2)[:10000],
        }
    except Exception as e:
        logger.error(f"XML parse failed: {e}")
        return {"text": "", "error": str(e)}


def parse_yaml(file_path: str) -> dict[str, Any]:
    """Parse a YAML file."""
    try:
        import yaml
        with open(file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if isinstance(data, dict):
            flat = flatten_dict(data)
            return {
                "columns": list(flat.keys()),
                "rows": [flat],
                "row_count": 1,
            }
        elif isinstance(data, list):
            if len(data) > 0 and isinstance(data[0], dict):
                columns = list(set().union(*(d.keys() for d in data if isinstance(d, dict))))
                rows = [{c: row.get(c) for c in columns} for row in data if isinstance(row, dict)]
                return {"columns": columns, "rows": rows, "row_count": len(rows)}
        return {"text": str(data)[:10000]}
    except Exception as e:
        logger.error(f"YAML parse failed: {e}")
        return {"text": "", "error": str(e)}


def parse_toml(file_path: str) -> dict[str, Any]:
    """Parse a TOML file."""
    try:
        import tomllib
        with open(file_path, "rb") as f:
            data = tomllib.load(f)
        flat = flatten_dict(data)
        return {"columns": list(flat.keys()), "rows": [flat], "row_count": 1}
    except ImportError:
        try:
            import toml
            with open(file_path, "r") as f:
                data = toml.load(f)
            flat = flatten_dict(data)
            return {"columns": list(flat.keys()), "rows": [flat], "row_count": 1}
        except Exception as e:
            return {"text": "", "error": str(e)}
    except Exception as e:
        logger.error(f"TOML parse failed: {e}")
        return {"text": "", "error": str(e)}


def _get_depth(obj: Any, current: int = 0) -> int:
    if isinstance(obj, dict):
        return max((_get_depth(v, current + 1) for v in obj.values()), default=current)
    elif isinstance(obj, list) and obj and isinstance(obj[0], dict):
        return max((_get_depth(v, current + 1) for v in obj), default=current)
    return current


PARSERS = {
    "json": parse_json,
    "jsonl": parse_jsonl,
    "ndjson": parse_jsonl,
    "xml": parse_xml,
    "yaml": parse_yaml,
    "yml": parse_yaml,
    "toml": parse_toml,
}


def parse_structured(file_path: str, file_type: str) -> dict[str, Any]:
    parser = PARSERS.get(file_type.lower(), parse_json)
    return parser(file_path)
