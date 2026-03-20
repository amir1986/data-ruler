"""Validation & Security Agent - validates files for threats, sanitizes inputs."""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB

BLOCKED_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".com", ".scr", ".pif", ".vbs", ".vbe",
    ".js", ".jse", ".wsf", ".wsh", ".ps1", ".psm1", ".msi", ".msp",
    ".dll", ".sys", ".drv", ".cpl", ".inf", ".reg",
}

BLOCKED_MIME_PREFIXES = [
    "application/x-executable",
    "application/x-msdos-program",
    "application/x-msdownload",
]


class ValidationSecurityAgent(AgentBase):
    """Validates uploaded files for security threats and data integrity."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="validation_security",
            description="Validates files for security threats (executables, oversized files, malicious content) and computes integrity hashes.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        file_path = payload.get("file_path", "")
        original_name = payload.get("original_name", "")

        if not file_path or not os.path.exists(file_path):
            return {"valid": False, "error": "File not found"}

        issues = []

        # Check file size
        size = os.path.getsize(file_path)
        if size > MAX_FILE_SIZE:
            issues.append(f"File too large: {size / 1024 / 1024:.0f} MB (max {MAX_FILE_SIZE / 1024 / 1024:.0f} MB)")

        if size == 0:
            issues.append("File is empty")

        # Check extension
        ext = os.path.splitext(original_name or file_path)[1].lower()
        if ext in BLOCKED_EXTENSIONS:
            issues.append(f"Blocked file extension: {ext}")

        # Check for null bytes in text files (possible injection)
        text_extensions = {".csv", ".tsv", ".json", ".xml", ".yaml", ".yml", ".txt", ".md", ".html"}
        if ext in text_extensions:
            try:
                with open(file_path, "rb") as f:
                    header = f.read(8192)
                if b"\x00" in header:
                    issues.append("Null bytes detected in text file (possible binary or injection)")
            except Exception:
                pass

        # Compute SHA-256 hash
        sha256 = self._compute_hash(file_path)

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "sha256": sha256,
            "size_bytes": size,
            "extension": ext,
        }

    @staticmethod
    def _compute_hash(file_path: str) -> str:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
