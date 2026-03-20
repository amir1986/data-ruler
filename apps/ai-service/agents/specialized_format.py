"""Specialized Format Agent - handles GIS, scientific, and domain-specific formats."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class SpecializedFormatAgent(AgentBase):
    def __init__(self) -> None:
        super().__init__(
            agent_name="specialized_format",
            description="Handles GIS (GeoJSON, Shapefile), scientific (HDF5, NetCDF), and other specialized formats.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        file_path = payload.get("file_path", "")
        file_type = payload.get("file_type", "")
        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        if file_type == "geojson" or file_path.endswith(".geojson"):
            return self._parse_geojson(file_path)
        else:
            return {"format": file_type, "status": "metadata_only", "size": os.path.getsize(file_path)}

    def _parse_geojson(self, path: str) -> dict[str, Any]:
        try:
            with open(path, "r") as f:
                data = json.load(f)
            features = data.get("features", [])
            return {
                "format": "geojson",
                "type": data.get("type"),
                "feature_count": len(features),
                "properties": list(features[0].get("properties", {}).keys()) if features else [],
            }
        except Exception as exc:
            return {"error": str(exc)}
