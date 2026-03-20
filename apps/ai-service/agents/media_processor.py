"""Media Processor Agent - handles images, audio, video metadata extraction."""

from __future__ import annotations

import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

THUMBNAIL_PATH = os.getenv("THUMBNAIL_PATH", "./data/thumbnails")


class MediaProcessorAgent(AgentBase):
    def __init__(self) -> None:
        super().__init__(
            agent_name="media_processor",
            description="Extracts metadata and generates thumbnails for images, audio, and video files.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        file_path = payload.get("file_path", "")
        file_type = payload.get("file_type", "")
        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        size = os.path.getsize(file_path)
        result: dict[str, Any] = {
            "file_path": file_path,
            "file_type": file_type,
            "size_bytes": size,
        }

        if file_type == "image" or any(file_path.lower().endswith(e) for e in (".png", ".jpg", ".jpeg", ".gif", ".webp")):
            result.update(self._process_image(file_path))
        elif file_type in ("audio", "video"):
            result["metadata"] = {"note": "Audio/video metadata extraction requires ffprobe"}

        return result

    def _process_image(self, path: str) -> dict[str, Any]:
        try:
            from PIL import Image
            img = Image.open(path)
            meta = {
                "width": img.width,
                "height": img.height,
                "mode": img.mode,
                "format": img.format,
            }
            # Generate thumbnail
            os.makedirs(THUMBNAIL_PATH, exist_ok=True)
            thumb_path = os.path.join(THUMBNAIL_PATH, f"thumb_{os.path.basename(path)}.png")
            img.thumbnail((256, 256))
            img.save(thumb_path, "PNG")
            meta["thumbnail_path"] = thumb_path
            return {"metadata": meta}
        except ImportError:
            return {"metadata": {"note": "Pillow not installed"}}
        except Exception as exc:
            return {"metadata": {"error": str(exc)}}
