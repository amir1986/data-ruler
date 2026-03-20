"""Validation & Security Agent - validates files and scans for threats."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

# Limits
MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024  # 5 GB
MAX_FILENAME_LENGTH = 255
DANGEROUS_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".com", ".scr", ".pif", ".msi",
    ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".ps1",
    ".dll", ".sys", ".drv",
}

# PII patterns
PII_PATTERNS: dict[str, re.Pattern[str]] = {
    "email": re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
    "phone_us": re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "credit_card": re.compile(r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b"),
    "ip_address": re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
}


class ValidationSecurityAgent(AgentBase):
    """Validates file safety and scans for security concerns."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="validation_security",
            description="Validates file sizes, sanitizes filenames, detects archive bombs, and scans for PII.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Validate a file for security and safety concerns."""
        payload = message.payload
        file_path = payload.get("file_path", "")
        filename = payload.get("filename", "")
        scan_pii = payload.get("scan_pii", False)

        if not file_path:
            return {"error": "No file_path provided"}

        if not filename:
            filename = os.path.basename(file_path)

        results: dict[str, Any] = {
            "file_path": file_path,
            "original_filename": filename,
            "is_safe": True,
            "warnings": [],
            "errors": [],
        }

        # Step 1: File size validation
        size_result = self._validate_file_size(file_path)
        results["file_size"] = size_result
        if not size_result.get("valid"):
            results["is_safe"] = False
            results["errors"].append(size_result.get("reason", "File size invalid"))

        # Step 2: Filename sanitization
        sanitized = self._sanitize_filename(filename)
        results["sanitized_filename"] = sanitized["filename"]
        if sanitized.get("warnings"):
            results["warnings"].extend(sanitized["warnings"])

        # Step 3: Extension check
        ext_result = self._check_extension(filename)
        results["extension_check"] = ext_result
        if ext_result.get("is_dangerous"):
            results["is_safe"] = False
            results["errors"].append(f"Dangerous file extension: {ext_result['extension']}")

        # Step 4: Archive bomb detection (for archives)
        ext = os.path.splitext(filename)[1].lower()
        if ext in (".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".tar.gz", ".tgz"):
            bomb_result = self._detect_archive_bomb(file_path, ext)
            results["archive_check"] = bomb_result
            if bomb_result.get("is_bomb"):
                results["is_safe"] = False
                results["errors"].append("Potential archive bomb detected")

        # Step 5: PII scanning (optional)
        if scan_pii and os.path.exists(file_path):
            pii_result = self._scan_pii(file_path)
            results["pii_scan"] = pii_result
            if pii_result.get("findings"):
                results["warnings"].append(
                    f"PII detected: {len(pii_result['findings'])} pattern(s) found"
                )

        return results

    @staticmethod
    def _validate_file_size(file_path: str) -> dict[str, Any]:
        """Validate file size against limits."""
        if not os.path.exists(file_path):
            return {"valid": False, "reason": "File does not exist", "size": 0}

        size = os.path.getsize(file_path)
        if size == 0:
            return {"valid": False, "reason": "File is empty", "size": 0}
        if size > MAX_FILE_SIZE:
            return {
                "valid": False,
                "reason": f"File exceeds maximum size ({size} > {MAX_FILE_SIZE})",
                "size": size,
            }

        return {"valid": True, "size": size}

    @staticmethod
    def _sanitize_filename(filename: str) -> dict[str, Any]:
        """Sanitize a filename for safe storage."""
        warnings: list[str] = []
        original = filename

        # Remove path separators
        filename = os.path.basename(filename)

        # Remove null bytes
        filename = filename.replace("\x00", "")

        # Replace dangerous characters
        filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", filename)

        # Remove leading/trailing dots and spaces
        filename = filename.strip(". ")

        # Truncate if too long
        if len(filename) > MAX_FILENAME_LENGTH:
            name, ext = os.path.splitext(filename)
            filename = name[: MAX_FILENAME_LENGTH - len(ext)] + ext
            warnings.append("Filename truncated to fit length limit")

        # Ensure not empty
        if not filename:
            filename = "unnamed_file"
            warnings.append("Filename was empty after sanitization")

        if filename != original:
            warnings.append(f"Filename sanitized from '{original}' to '{filename}'")

        return {"filename": filename, "warnings": warnings}

    @staticmethod
    def _check_extension(filename: str) -> dict[str, Any]:
        """Check if the file extension is potentially dangerous."""
        ext = os.path.splitext(filename)[1].lower()

        return {
            "extension": ext,
            "is_dangerous": ext in DANGEROUS_EXTENSIONS,
        }

    @staticmethod
    def _detect_archive_bomb(file_path: str, ext: str) -> dict[str, Any]:
        """Detect potential archive bombs by checking compression ratios."""
        import zipfile

        result: dict[str, Any] = {"is_bomb": False}

        if ext == ".zip":
            try:
                with zipfile.ZipFile(file_path, "r") as zf:
                    compressed_size = os.path.getsize(file_path)
                    total_uncompressed = sum(info.file_size for info in zf.infolist())
                    file_count = len(zf.infolist())

                    ratio = (
                        total_uncompressed / compressed_size
                        if compressed_size > 0
                        else 0
                    )

                    result["compressed_size"] = compressed_size
                    result["uncompressed_size"] = total_uncompressed
                    result["compression_ratio"] = round(ratio, 2)
                    result["file_count"] = file_count

                    # Bomb indicators
                    if ratio > 100:
                        result["is_bomb"] = True
                        result["reason"] = f"Extreme compression ratio: {ratio:.0f}:1"
                    elif file_count > 10000:
                        result["is_bomb"] = True
                        result["reason"] = f"Excessive file count: {file_count}"
                    elif total_uncompressed > 10 * 1024 * 1024 * 1024:  # 10GB
                        result["is_bomb"] = True
                        result["reason"] = "Uncompressed size exceeds 10GB"
            except Exception as exc:
                result["error"] = str(exc)
        else:
            result["note"] = "Bomb detection for non-ZIP requires extraction"

        return result

    @staticmethod
    def _scan_pii(file_path: str) -> dict[str, Any]:
        """Scan file content for PII patterns."""
        findings: list[dict[str, Any]] = []

        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                # Read in chunks to handle large files
                chunk_size = 1024 * 1024  # 1MB
                content = f.read(chunk_size)

            for pii_type, pattern in PII_PATTERNS.items():
                matches = pattern.findall(content)
                if matches:
                    findings.append({
                        "type": pii_type,
                        "count": len(matches),
                        "sample": matches[0] if matches else "",
                    })
        except Exception as exc:
            return {"error": str(exc), "findings": []}

        return {
            "findings": findings,
            "scanned_bytes": min(os.path.getsize(file_path), 1024 * 1024),
        }
