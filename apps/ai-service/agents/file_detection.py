"""File Detection Agent - identifies file types via magic bytes + extension."""

from __future__ import annotations

import logging
import os
from typing import Any

from core.agent_base import AgentBase, AgentContract
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

MAGIC_SIGNATURES: dict[bytes, str] = {
    b"\x89PNG": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
    b"%PDF": "application/pdf",
    b"PK\x03\x04": "application/zip",
    b"PK\x05\x06": "application/zip",
    b"\x1f\x8b": "application/gzip",
    b"BZh": "application/x-bzip2",
    b"\xfd7zXZ": "application/x-xz",
    b"7z\xbc\xaf\x27\x1c": "application/x-7z-compressed",
    b"SQLite format 3": "application/x-sqlite3",
    b"RIFF": "audio/wav",
    b"fLaC": "audio/flac",
    b"OggS": "audio/ogg",
    b"\x00\x00\x01\xba": "video/mpeg",
    b"\x00\x00\x01\xb3": "video/mpeg",
    b"\x1aE\xdf\xa3": "video/webm",
    b"ID3": "audio/mp3",
    b"\xff\xfb": "audio/mp3",
}

EXTENSION_MAP: dict[str, tuple[str, str, str]] = {
    # ext -> (mime_type, category, file_type)
    ".csv": ("text/csv", "tabular", "csv"),
    ".tsv": ("text/tab-separated-values", "tabular", "tsv"),
    ".xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "tabular", "xlsx"),
    ".xls": ("application/vnd.ms-excel", "tabular", "xls"),
    ".parquet": ("application/octet-stream", "tabular", "parquet"),
    ".feather": ("application/octet-stream", "tabular", "feather"),
    ".ods": ("application/vnd.oasis.opendocument.spreadsheet", "tabular", "ods"),
    ".json": ("application/json", "structured_data", "json"),
    ".jsonl": ("application/jsonlines", "structured_data", "jsonl"),
    ".xml": ("application/xml", "structured_data", "xml"),
    ".yaml": ("application/yaml", "structured_data", "yaml"),
    ".yml": ("application/yaml", "structured_data", "yaml"),
    ".toml": ("application/toml", "structured_data", "toml"),
    ".ini": ("text/plain", "structured_data", "ini"),
    ".pdf": ("application/pdf", "document", "pdf"),
    ".docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document", "docx"),
    ".doc": ("application/msword", "document", "doc"),
    ".pptx": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "document", "pptx"),
    ".ppt": ("application/vnd.ms-powerpoint", "document", "ppt"),
    ".txt": ("text/plain", "document", "txt"),
    ".md": ("text/markdown", "document", "markdown"),
    ".html": ("text/html", "document", "html"),
    ".htm": ("text/html", "document", "html"),
    ".rtf": ("application/rtf", "document", "rtf"),
    ".db": ("application/x-sqlite3", "database", "sqlite"),
    ".sqlite": ("application/x-sqlite3", "database", "sqlite"),
    ".sqlite3": ("application/x-sqlite3", "database", "sqlite"),
    ".duckdb": ("application/octet-stream", "database", "duckdb"),
    ".mdb": ("application/x-msaccess", "database", "access"),
    ".accdb": ("application/x-msaccess", "database", "access"),
    ".sql": ("application/sql", "database", "sql_dump"),
    ".png": ("image/png", "media", "image"),
    ".jpg": ("image/jpeg", "media", "image"),
    ".jpeg": ("image/jpeg", "media", "image"),
    ".gif": ("image/gif", "media", "image"),
    ".webp": ("image/webp", "media", "image"),
    ".svg": ("image/svg+xml", "media", "image"),
    ".mp3": ("audio/mp3", "media", "audio"),
    ".wav": ("audio/wav", "media", "audio"),
    ".flac": ("audio/flac", "media", "audio"),
    ".ogg": ("audio/ogg", "media", "audio"),
    ".mp4": ("video/mp4", "media", "video"),
    ".avi": ("video/x-msvideo", "media", "video"),
    ".mkv": ("video/x-matroska", "media", "video"),
    ".webm": ("video/webm", "media", "video"),
    ".zip": ("application/zip", "archive", "zip"),
    ".tar": ("application/x-tar", "archive", "tar"),
    ".gz": ("application/gzip", "archive", "gzip"),
    ".bz2": ("application/x-bzip2", "archive", "bzip2"),
    ".7z": ("application/x-7z-compressed", "archive", "7z"),
    ".rar": ("application/x-rar-compressed", "archive", "rar"),
    ".geojson": ("application/geo+json", "specialized", "geojson"),
    ".shp": ("application/x-shapefile", "specialized", "shapefile"),
    ".hdf5": ("application/x-hdf5", "specialized", "hdf5"),
    ".h5": ("application/x-hdf5", "specialized", "hdf5"),
    ".nc": ("application/x-netcdf", "specialized", "netcdf"),
    ".ndjson": ("application/x-ndjson", "structured_data", "ndjson"),
    ".proto": ("text/plain", "specialized", "protobuf"),
    ".avro": ("application/avro", "structured_data", "avro"),
}


class FileDetectionAgent(AgentBase):
    """Detects file types via magic bytes, extension, and content sniffing."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="file_detection",
            description="Identifies file types using magic byte signatures, file extensions, and content analysis.",
            contract=AgentContract(
                required_inputs=("file_path",),
                optional_inputs=("original_name",),
                output_keys=("file_path", "mime_type", "category", "file_type", "size_bytes"),
            ),
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        file_path: str = payload.get("file_path", "")
        original_name: str = payload.get("original_name", file_path)

        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        result = await self.detect(file_path, original_name)
        return result

    async def detect(self, file_path: str, original_name: str = "") -> dict[str, Any]:
        """Detect file type from magic bytes and extension."""
        name = original_name or os.path.basename(file_path)
        ext = os.path.splitext(name)[1].lower()
        size = os.path.getsize(file_path)

        # 1. Magic byte detection
        magic_mime = None
        try:
            with open(file_path, "rb") as f:
                header = f.read(32)
            for sig, mime in MAGIC_SIGNATURES.items():
                if header.startswith(sig):
                    magic_mime = mime
                    break
        except Exception as exc:
            logger.warning("Magic byte read failed: %s", exc)

        # 2. Extension-based detection
        ext_info = EXTENSION_MAP.get(ext)

        # 3. Combine results
        if ext_info:
            mime_type, category, file_type = ext_info
            # Override mime if magic bytes detected something different
            if magic_mime and magic_mime != mime_type:
                logger.info("Magic bytes (%s) differ from extension (%s)", magic_mime, mime_type)
        elif magic_mime:
            mime_type = magic_mime
            category = self._mime_to_category(magic_mime)
            file_type = mime_type.split("/")[-1]
        else:
            # Fallback: try to detect if it's text
            mime_type, category, file_type = self._sniff_content(file_path)

        return {
            "file_path": file_path,
            "original_name": name,
            "extension": ext,
            "mime_type": mime_type,
            "category": category,
            "file_type": file_type,
            "size_bytes": size,
            "magic_detected": magic_mime,
        }

    @staticmethod
    def _mime_to_category(mime: str) -> str:
        if mime.startswith("image/") or mime.startswith("audio/") or mime.startswith("video/"):
            return "media"
        if mime.startswith("text/"):
            return "document"
        if "sqlite" in mime:
            return "database"
        if "zip" in mime or "gzip" in mime or "tar" in mime or "7z" in mime:
            return "archive"
        return "unknown"

    @staticmethod
    def _sniff_content(file_path: str) -> tuple[str, str, str]:
        """Try reading as text to classify."""
        try:
            with open(file_path, "r", encoding="utf-8", errors="strict") as f:
                sample = f.read(4096)

            # Check for JSON
            stripped = sample.strip()
            if stripped.startswith("{") or stripped.startswith("["):
                return ("application/json", "structured_data", "json")
            # Check for CSV-like
            if "," in sample and "\n" in sample:
                lines = sample.split("\n")
                if len(lines) > 1:
                    comma_counts = [line.count(",") for line in lines[:5] if line.strip()]
                    if comma_counts and all(c == comma_counts[0] for c in comma_counts):
                        return ("text/csv", "tabular", "csv")
            # Check for XML
            if stripped.startswith("<?xml") or stripped.startswith("<"):
                return ("application/xml", "structured_data", "xml")
            # Default text
            return ("text/plain", "document", "txt")
        except (UnicodeDecodeError, Exception):
            return ("application/octet-stream", "unknown", "binary")
