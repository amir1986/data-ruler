"""Archive Processor Agent - extracts ZIP, TAR, GZIP archives."""

from __future__ import annotations

import logging
import os
import tarfile
import zipfile
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

UPLOAD_PATH = os.getenv("UPLOAD_PATH", "./data/uploads")
MAX_EXTRACT_SIZE = 1024 * 1024 * 1024  # 1 GB


class ArchiveProcessorAgent(AgentBase):
    def __init__(self) -> None:
        super().__init__(
            agent_name="archive_processor",
            description="Extracts ZIP, TAR, GZIP, BZ2, 7z archives safely.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        file_path = payload.get("file_path", "")
        file_type = payload.get("file_type", "")
        user_id = payload.get("user_id", "")

        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        extract_dir = os.path.join(UPLOAD_PATH, user_id or "temp", "extracted", os.path.basename(file_path))
        os.makedirs(extract_dir, exist_ok=True)

        if file_type == "zip" or file_path.endswith(".zip"):
            return self._extract_zip(file_path, extract_dir)
        elif file_type in ("tar", "gzip") or any(file_path.endswith(e) for e in (".tar", ".tar.gz", ".tgz")):
            return self._extract_tar(file_path, extract_dir)
        else:
            return {"error": f"Unsupported archive type: {file_type}"}

    def _extract_zip(self, path: str, dest: str) -> dict[str, Any]:
        try:
            with zipfile.ZipFile(path, "r") as zf:
                total_size = sum(i.file_size for i in zf.infolist())
                if total_size > MAX_EXTRACT_SIZE:
                    return {"error": f"Archive too large: {total_size / 1024 / 1024:.0f} MB"}
                # Security: skip files with path traversal
                safe_members = [m for m in zf.namelist() if not m.startswith("/") and ".." not in m]
                for member in safe_members:
                    zf.extract(member, dest)
                return {
                    "extracted_to": dest,
                    "file_count": len(safe_members),
                    "files": safe_members[:100],
                    "total_size": total_size,
                }
        except Exception as exc:
            return {"error": str(exc)}

    def _extract_tar(self, path: str, dest: str) -> dict[str, Any]:
        try:
            with tarfile.open(path, "r:*") as tf:
                safe_members = [m for m in tf.getmembers() if not m.name.startswith("/") and ".." not in m.name]
                total_size = sum(m.size for m in safe_members)
                if total_size > MAX_EXTRACT_SIZE:
                    return {"error": f"Archive too large: {total_size / 1024 / 1024:.0f} MB"}
                tf.extractall(dest, members=safe_members)
                return {
                    "extracted_to": dest,
                    "file_count": len(safe_members),
                    "files": [m.name for m in safe_members[:100]],
                    "total_size": total_size,
                }
        except Exception as exc:
            return {"error": str(exc)}
