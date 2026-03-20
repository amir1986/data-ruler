"""Archive extraction utilities."""

import logging
import os
import zipfile
import tarfile
from typing import Any

logger = logging.getLogger(__name__)

MAX_EXTRACTION_DEPTH = 3
MAX_FILES = 1000
MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024  # 2GB


def extract_zip(file_path: str, extract_to: str) -> dict[str, Any]:
    """Extract a ZIP archive with safety checks."""
    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            # Safety: check for zip bomb
            total_size = sum(info.file_size for info in zf.infolist())
            compressed_size = sum(info.compress_size for info in zf.infolist())

            if compressed_size > 0 and total_size / compressed_size > 100:
                return {"error": "Suspected zip bomb (compression ratio > 100:1)", "files": []}

            if total_size > MAX_TOTAL_SIZE:
                return {"error": f"Archive too large (>{MAX_TOTAL_SIZE / 1e9:.0f}GB)", "files": []}

            if len(zf.infolist()) > MAX_FILES:
                return {"error": f"Too many files (>{MAX_FILES})", "files": []}

            # Safety: check for path traversal
            for info in zf.infolist():
                target = os.path.realpath(os.path.join(extract_to, info.filename))
                if not target.startswith(os.path.realpath(extract_to)):
                    return {"error": "Path traversal detected", "files": []}

            zf.extractall(extract_to)

            files = []
            for info in zf.infolist():
                if not info.is_dir():
                    files.append({
                        "name": info.filename,
                        "size": info.file_size,
                        "compressed_size": info.compress_size,
                        "path": os.path.join(extract_to, info.filename),
                    })

            return {"files": files, "total_size": total_size, "file_count": len(files)}
    except Exception as e:
        logger.error(f"ZIP extraction failed: {e}")
        return {"error": str(e), "files": []}


def extract_tar(file_path: str, extract_to: str) -> dict[str, Any]:
    """Extract a TAR/TAR.GZ/TAR.BZ2 archive."""
    try:
        with tarfile.open(file_path, "r:*") as tf:
            members = tf.getmembers()

            if len(members) > MAX_FILES:
                return {"error": f"Too many files (>{MAX_FILES})", "files": []}

            total_size = sum(m.size for m in members if m.isfile())
            if total_size > MAX_TOTAL_SIZE:
                return {"error": f"Archive too large", "files": []}

            # Safety: check for path traversal
            for member in members:
                target = os.path.realpath(os.path.join(extract_to, member.name))
                if not target.startswith(os.path.realpath(extract_to)):
                    return {"error": "Path traversal detected", "files": []}

            tf.extractall(extract_to, filter="data")

            files = []
            for m in members:
                if m.isfile():
                    files.append({
                        "name": m.name,
                        "size": m.size,
                        "path": os.path.join(extract_to, m.name),
                    })

            return {"files": files, "total_size": total_size, "file_count": len(files)}
    except Exception as e:
        logger.error(f"TAR extraction failed: {e}")
        return {"error": str(e), "files": []}


EXTRACTORS = {
    "zip": extract_zip,
    "tar": extract_tar,
    "gz": extract_tar,
    "tgz": extract_tar,
    "bz2": extract_tar,
    "xz": extract_tar,
}


def extract_archive(file_path: str, file_type: str, extract_to: str) -> dict[str, Any]:
    """Extract any archive type."""
    extractor = EXTRACTORS.get(file_type.lower(), extract_zip)
    os.makedirs(extract_to, exist_ok=True)
    return extractor(file_path, extract_to)
