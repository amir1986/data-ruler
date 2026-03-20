"""File Detection Agent - identifies file types and creates processing plans."""

from __future__ import annotations

import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

# Magic byte signatures for common file types
MAGIC_SIGNATURES: dict[bytes, str] = {
    b"\x89PNG": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
    b"%PDF": "application/pdf",
    b"PK\x03\x04": "application/zip",  # Also XLSX, DOCX, PPTX, ODS
    b"PK\x05\x06": "application/zip",
    b"\x1f\x8b": "application/gzip",
    b"BZh": "application/x-bzip2",
    b"\xfd7zXZ": "application/x-xz",
    b"7z\xbc\xaf\x27\x1c": "application/x-7z-compressed",
    b"SQLite format 3": "application/x-sqlite3",
    b"RIFF": "audio/wav",  # Could also be AVI
    b"fLaC": "audio/flac",
    b"OggS": "audio/ogg",
    b"\x00\x00\x01\xba": "video/mpeg",
    b"\x00\x00\x01\xb3": "video/mpeg",
    b"PAR1": "application/parquet",
    b"ARROW1": "application/feather",
}

# Extension to MIME type mapping
EXTENSION_MAP: dict[str, str] = {
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".json": "application/json",
    ".jsonl": "application/jsonlines",
    ".xml": "application/xml",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".toml": "application/toml",
    ".parquet": "application/parquet",
    ".feather": "application/feather",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".ods": "application/vnd.oasis.opendocument.spreadsheet",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".sql": "application/sql",
    ".db": "application/x-sqlite3",
    ".sqlite": "application/x-sqlite3",
    ".sqlite3": "application/x-sqlite3",
    ".bson": "application/bson",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".bz2": "application/x-bzip2",
    ".xz": "application/x-xz",
    ".7z": "application/x-7z-compressed",
    ".ini": "text/ini",
    ".env": "text/env",
    ".properties": "text/properties",
    ".log": "text/log",
    ".geojson": "application/geo+json",
    ".py": "text/x-python",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".java": "text/x-java",
    ".rs": "text/x-rust",
    ".go": "text/x-go",
    ".c": "text/x-c",
    ".cpp": "text/x-c++",
    ".h": "text/x-c-header",
    ".rb": "text/x-ruby",
}

# MIME type to category mapping
MIME_CATEGORY_MAP: dict[str, str] = {
    "text/csv": "tabular",
    "text/tab-separated-values": "tabular",
    "application/parquet": "tabular",
    "application/feather": "tabular",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "tabular",
    "application/vnd.ms-excel": "tabular",
    "application/vnd.oasis.opendocument.spreadsheet": "tabular",
    "application/pdf": "document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
    "application/msword": "document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
    "text/plain": "document",
    "text/markdown": "document",
    "text/html": "document",
    "application/x-sqlite3": "database",
    "application/sql": "database",
    "application/bson": "database",
    "image/png": "media",
    "image/jpeg": "media",
    "image/gif": "media",
    "image/svg+xml": "media",
    "audio/mpeg": "media",
    "audio/wav": "media",
    "audio/flac": "media",
    "audio/ogg": "media",
    "video/mp4": "media",
    "video/x-msvideo": "media",
    "video/x-matroska": "media",
    "video/mpeg": "media",
    "application/zip": "archive",
    "application/x-tar": "archive",
    "application/gzip": "archive",
    "application/x-bzip2": "archive",
    "application/x-xz": "archive",
    "application/x-7z-compressed": "archive",
    "application/json": "structured_data",
    "application/jsonlines": "structured_data",
    "application/xml": "structured_data",
    "application/yaml": "structured_data",
    "application/toml": "structured_data",
    "application/geo+json": "specialized",
    "text/log": "specialized",
    "text/ini": "specialized",
    "text/env": "specialized",
    "text/properties": "specialized",
}

# Read buffer size
READ_BUFFER_SIZE = 65536  # 64KB


class FileDetectionAgent(AgentBase):
    """Detects file type using magic bytes, extension, and content sampling."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="file_detection",
            description="Identifies file types via magic bytes, extension analysis, and content sampling.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Detect file type and generate a processing plan."""
        payload = message.payload
        file_path: str = payload.get("file_path", "")

        if not file_path or not os.path.exists(file_path):
            return {
                "error": f"File not found: {file_path}",
                "category": "unknown",
            }

        file_size = os.path.getsize(file_path)
        filename = os.path.basename(file_path)
        extension = os.path.splitext(filename)[1].lower()

        # Step 1: Read first 64KB
        header = self._read_header(file_path)

        # Step 2: Magic bytes analysis
        magic_mime = self._detect_magic(header)

        # Step 3: Extension-based detection
        ext_mime = EXTENSION_MAP.get(extension, "application/octet-stream")

        # Step 4: Try python-magic if available
        libmagic_mime = self._detect_libmagic(file_path)

        # Step 5: Content sampling for text files
        content_info = self._sample_content(header, ext_mime)

        # Resolve final MIME type (magic bytes > libmagic > extension)
        resolved_mime = magic_mime or libmagic_mime or ext_mime

        # Handle ZIP-based formats (XLSX, DOCX, PPTX, ODS)
        if resolved_mime == "application/zip" and extension in (
            ".xlsx", ".docx", ".pptx", ".ods",
        ):
            resolved_mime = EXTENSION_MAP.get(extension, resolved_mime)

        # Step 6: Assign category
        category = self._assign_category(resolved_mime, extension)

        # Step 7: Generate processing plan
        processing_plan = self._generate_plan(category, resolved_mime, file_size)

        return {
            "filename": filename,
            "file_path": file_path,
            "file_size": file_size,
            "extension": extension,
            "mime_type": resolved_mime,
            "magic_mime": magic_mime,
            "libmagic_mime": libmagic_mime,
            "extension_mime": ext_mime,
            "category": category,
            "content_info": content_info,
            "processing_plan": processing_plan,
        }

    @staticmethod
    def _read_header(file_path: str) -> bytes:
        """Read the first 64KB of the file."""
        try:
            with open(file_path, "rb") as f:
                return f.read(READ_BUFFER_SIZE)
        except OSError as exc:
            logger.warning("Failed to read header of %s: %s", file_path, exc)
            return b""

    @staticmethod
    def _detect_magic(header: bytes) -> str | None:
        """Match magic byte signatures against the file header."""
        for signature, mime_type in MAGIC_SIGNATURES.items():
            if header.startswith(signature):
                return mime_type
        return None

    @staticmethod
    def _detect_libmagic(file_path: str) -> str | None:
        """Use python-magic library for detection if available."""
        try:
            import magic  # type: ignore[import-untyped]

            mime = magic.from_file(file_path, mime=True)
            return str(mime) if mime else None
        except ImportError:
            logger.debug("python-magic not available, skipping libmagic detection")
            return None
        except Exception as exc:
            logger.warning("libmagic detection failed: %s", exc)
            return None

    @staticmethod
    def _sample_content(header: bytes, mime_hint: str) -> dict[str, Any]:
        """Sample content for encoding detection and delimiter sniffing."""
        info: dict[str, Any] = {}

        # Try to decode as text
        encoding = None
        text_sample = None
        for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
            try:
                text_sample = header.decode(enc)
                encoding = enc
                break
            except (UnicodeDecodeError, ValueError):
                continue

        info["encoding"] = encoding
        info["is_text"] = text_sample is not None

        if text_sample:
            # Delimiter sniffing for CSV-like files
            lines = text_sample.split("\n")[:20]
            if lines:
                first_line = lines[0]
                delimiters = {",": 0, "\t": 0, ";": 0, "|": 0}
                for delim in delimiters:
                    delimiters[delim] = first_line.count(delim)
                best_delim = max(delimiters, key=delimiters.get)  # type: ignore[arg-type]
                if delimiters[best_delim] > 0:
                    info["detected_delimiter"] = best_delim
                    info["delimiter_count"] = delimiters[best_delim]

                # Check if first line looks like a header
                info["likely_header"] = not any(
                    c.isdigit() for c in first_line.split(best_delim)[0].strip()[:1]
                ) if delimiters[best_delim] > 0 else None

                info["sample_lines"] = len(lines)

        return info

    @staticmethod
    def _assign_category(mime_type: str, extension: str) -> str:
        """Assign a processing category based on MIME type and extension."""
        # Check MIME-based category first
        category = MIME_CATEGORY_MAP.get(mime_type)
        if category:
            return category

        # Code files -> specialized
        code_extensions = {
            ".py", ".js", ".ts", ".java", ".rs", ".go", ".c", ".cpp",
            ".h", ".rb", ".php", ".swift", ".kt",
        }
        if extension in code_extensions:
            return "specialized"

        return "unknown"

    @staticmethod
    def _generate_plan(
        category: str, mime_type: str, file_size: int
    ) -> dict[str, Any]:
        """Generate a processing plan for the detected file."""
        plan: dict[str, Any] = {
            "category": category,
            "target_agent": {
                "tabular": "tabular_processor",
                "document": "document_processor",
                "database": "database_importer",
                "media": "media_processor",
                "archive": "archive_processor",
                "structured_data": "structured_data",
                "specialized": "specialized_format",
            }.get(category, "structured_data"),
            "estimated_complexity": "low" if file_size < 1_000_000 else (
                "medium" if file_size < 100_000_000 else "high"
            ),
            "requires_extraction": category == "archive",
            "requires_ocr": mime_type in ("image/png", "image/jpeg", "image/gif"),
        }
        return plan
