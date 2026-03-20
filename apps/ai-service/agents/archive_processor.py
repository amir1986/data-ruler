"""Archive Processing Agent - safely extracts and catalogs archive contents."""

from __future__ import annotations

import logging
import os
import tarfile
import zipfile
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

# Safety limits
MAX_DEPTH = 3
MAX_FILES = 1000
MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024  # 2 GB
MAX_COMPRESSION_RATIO = 100  # Zip bomb threshold


class ArchiveProcessorAgent(AgentBase):
    """Safely extracts and catalogs contents of archive files."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="archive_processor",
            description="Extracts ZIP, TAR, GZ, BZ2, XZ, and 7Z archives with safety checks.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Process an archive file and return a manifest of contained files."""
        payload = message.payload
        file_path: str = payload.get("file_path", "")
        extension: str = payload.get("extension", "")
        extract: bool = payload.get("extract", False)
        extract_dir: str = payload.get("extract_dir", "")

        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        ext = extension or os.path.splitext(file_path)[1].lower()
        archive_size = os.path.getsize(file_path)

        try:
            if ext == ".zip" or ext in (".xlsx", ".docx", ".pptx", ".ods", ".jar"):
                return await self._process_zip(file_path, archive_size, extract, extract_dir)
            elif ext in (".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tar.xz"):
                return await self._process_tar(file_path, archive_size, extract, extract_dir)
            elif ext == ".gz":
                return await self._process_gzip(file_path, archive_size, extract, extract_dir)
            elif ext == ".bz2":
                return await self._process_bzip2(file_path, archive_size, extract, extract_dir)
            elif ext == ".xz":
                return await self._process_xz(file_path, archive_size, extract, extract_dir)
            elif ext == ".7z":
                return await self._process_7z(file_path, archive_size, extract, extract_dir)
            else:
                return {"error": f"Unsupported archive format: {ext}"}
        except Exception as exc:
            self.logger.error("Failed to process archive %s: %s", file_path, exc)
            return {"error": str(exc), "file_path": file_path}

    async def _process_zip(
        self, file_path: str, archive_size: int, extract: bool, extract_dir: str
    ) -> dict[str, Any]:
        """Process a ZIP archive."""
        with zipfile.ZipFile(file_path, "r") as zf:
            entries = zf.infolist()

            # Safety: check file count
            if len(entries) > MAX_FILES:
                return {
                    "error": f"Archive contains {len(entries)} files, exceeding limit of {MAX_FILES}",
                    "file_path": file_path,
                    "is_bomb": True,
                }

            # Build manifest and check for zip bombs
            manifest: list[dict[str, Any]] = []
            total_uncompressed = 0

            for entry in entries:
                total_uncompressed += entry.file_size

                # Zip bomb detection
                if archive_size > 0 and total_uncompressed > MAX_TOTAL_SIZE:
                    return {
                        "error": "Archive uncompressed size exceeds 2GB limit",
                        "file_path": file_path,
                        "is_bomb": True,
                    }

                if entry.compress_size > 0:
                    ratio = entry.file_size / entry.compress_size
                    if ratio > MAX_COMPRESSION_RATIO:
                        return {
                            "error": f"Suspicious compression ratio {ratio:.0f}:1 detected",
                            "file_path": file_path,
                            "is_bomb": True,
                        }

                manifest.append({
                    "filename": entry.filename,
                    "compressed_size": entry.compress_size,
                    "uncompressed_size": entry.file_size,
                    "is_dir": entry.is_dir(),
                    "date_time": str(entry.date_time),
                })

            # Extract if requested
            extracted_to = None
            if extract and extract_dir:
                os.makedirs(extract_dir, exist_ok=True)
                zf.extractall(extract_dir)
                extracted_to = extract_dir

        return {
            "format": "zip",
            "file_count": len([m for m in manifest if not m["is_dir"]]),
            "dir_count": len([m for m in manifest if m["is_dir"]]),
            "total_compressed": archive_size,
            "total_uncompressed": total_uncompressed,
            "manifest": manifest,
            "is_bomb": False,
            "extracted_to": extracted_to,
            "file_path": file_path,
        }

    async def _process_tar(
        self, file_path: str, archive_size: int, extract: bool, extract_dir: str
    ) -> dict[str, Any]:
        """Process a TAR archive (plain, gzip, bzip2, or xz compressed)."""
        mode = "r:*"  # Auto-detect compression
        with tarfile.open(file_path, mode) as tf:
            members = tf.getmembers()

            if len(members) > MAX_FILES:
                return {
                    "error": f"Archive contains {len(members)} entries, exceeding limit of {MAX_FILES}",
                    "file_path": file_path,
                    "is_bomb": True,
                }

            manifest: list[dict[str, Any]] = []
            total_size = 0

            for member in members:
                total_size += member.size

                if total_size > MAX_TOTAL_SIZE:
                    return {
                        "error": "Archive total size exceeds 2GB limit",
                        "file_path": file_path,
                        "is_bomb": True,
                    }

                manifest.append({
                    "filename": member.name,
                    "size": member.size,
                    "is_dir": member.isdir(),
                    "is_file": member.isfile(),
                    "is_link": member.issym() or member.islnk(),
                    "mtime": member.mtime,
                })

            extracted_to = None
            if extract and extract_dir:
                os.makedirs(extract_dir, exist_ok=True)
                # Filter out path traversal attempts
                safe_members = [
                    m for m in members
                    if not m.name.startswith("/") and ".." not in m.name
                ]
                tf.extractall(extract_dir, members=safe_members)
                extracted_to = extract_dir

        return {
            "format": "tar",
            "file_count": len([m for m in manifest if m.get("is_file")]),
            "dir_count": len([m for m in manifest if m.get("is_dir")]),
            "total_size": total_size,
            "manifest": manifest,
            "is_bomb": False,
            "extracted_to": extracted_to,
            "file_path": file_path,
        }

    async def _process_gzip(
        self, file_path: str, archive_size: int, extract: bool, extract_dir: str
    ) -> dict[str, Any]:
        """Process a standalone gzip file."""
        import gzip

        # Check if it is a .tar.gz
        if file_path.endswith(".tar.gz") or file_path.endswith(".tgz"):
            return await self._process_tar(file_path, archive_size, extract, extract_dir)

        uncompressed_size = 0
        extracted_path = None

        if extract and extract_dir:
            os.makedirs(extract_dir, exist_ok=True)
            base_name = os.path.basename(file_path).rstrip(".gz")
            out_path = os.path.join(extract_dir, base_name)
            with gzip.open(file_path, "rb") as gz_in, open(out_path, "wb") as f_out:
                while True:
                    chunk = gz_in.read(8192)
                    if not chunk:
                        break
                    uncompressed_size += len(chunk)
                    if uncompressed_size > MAX_TOTAL_SIZE:
                        f_out.close()
                        os.remove(out_path)
                        return {"error": "Decompressed size exceeds 2GB", "is_bomb": True}
                    f_out.write(chunk)
            extracted_path = out_path
        else:
            # Just peek at size
            with gzip.open(file_path, "rb") as gz_in:
                while True:
                    chunk = gz_in.read(8192)
                    if not chunk:
                        break
                    uncompressed_size += len(chunk)
                    if uncompressed_size > MAX_TOTAL_SIZE:
                        return {"error": "Decompressed size exceeds 2GB", "is_bomb": True}

        return {
            "format": "gzip",
            "compressed_size": archive_size,
            "uncompressed_size": uncompressed_size,
            "is_bomb": False,
            "extracted_to": extracted_path,
            "file_path": file_path,
        }

    async def _process_bzip2(
        self, file_path: str, archive_size: int, extract: bool, extract_dir: str
    ) -> dict[str, Any]:
        """Process a standalone bzip2 file."""
        import bz2

        uncompressed_size = 0
        extracted_path = None

        if extract and extract_dir:
            os.makedirs(extract_dir, exist_ok=True)
            base_name = os.path.basename(file_path).rstrip(".bz2")
            out_path = os.path.join(extract_dir, base_name)
            with bz2.open(file_path, "rb") as bz_in, open(out_path, "wb") as f_out:
                while True:
                    chunk = bz_in.read(8192)
                    if not chunk:
                        break
                    uncompressed_size += len(chunk)
                    if uncompressed_size > MAX_TOTAL_SIZE:
                        f_out.close()
                        os.remove(out_path)
                        return {"error": "Decompressed size exceeds 2GB", "is_bomb": True}
                    f_out.write(chunk)
            extracted_path = out_path
        else:
            with bz2.open(file_path, "rb") as bz_in:
                while True:
                    chunk = bz_in.read(8192)
                    if not chunk:
                        break
                    uncompressed_size += len(chunk)
                    if uncompressed_size > MAX_TOTAL_SIZE:
                        return {"error": "Decompressed size exceeds 2GB", "is_bomb": True}

        return {
            "format": "bzip2",
            "compressed_size": archive_size,
            "uncompressed_size": uncompressed_size,
            "is_bomb": False,
            "extracted_to": extracted_path,
            "file_path": file_path,
        }

    async def _process_xz(
        self, file_path: str, archive_size: int, extract: bool, extract_dir: str
    ) -> dict[str, Any]:
        """Process a standalone xz file."""
        import lzma

        uncompressed_size = 0
        extracted_path = None

        if extract and extract_dir:
            os.makedirs(extract_dir, exist_ok=True)
            base_name = os.path.basename(file_path).rstrip(".xz")
            out_path = os.path.join(extract_dir, base_name)
            with lzma.open(file_path, "rb") as xz_in, open(out_path, "wb") as f_out:
                while True:
                    chunk = xz_in.read(8192)
                    if not chunk:
                        break
                    uncompressed_size += len(chunk)
                    if uncompressed_size > MAX_TOTAL_SIZE:
                        f_out.close()
                        os.remove(out_path)
                        return {"error": "Decompressed size exceeds 2GB", "is_bomb": True}
                    f_out.write(chunk)
            extracted_path = out_path
        else:
            with lzma.open(file_path, "rb") as xz_in:
                while True:
                    chunk = xz_in.read(8192)
                    if not chunk:
                        break
                    uncompressed_size += len(chunk)
                    if uncompressed_size > MAX_TOTAL_SIZE:
                        return {"error": "Decompressed size exceeds 2GB", "is_bomb": True}

        return {
            "format": "xz",
            "compressed_size": archive_size,
            "uncompressed_size": uncompressed_size,
            "is_bomb": False,
            "extracted_to": extracted_path,
            "file_path": file_path,
        }

    async def _process_7z(
        self, file_path: str, archive_size: int, extract: bool, extract_dir: str
    ) -> dict[str, Any]:
        """Process a 7z archive using py7zr."""
        try:
            import py7zr

            with py7zr.SevenZipFile(file_path, "r") as sz:
                entries = sz.list()

                if len(entries) > MAX_FILES:
                    return {
                        "error": f"Archive contains {len(entries)} entries, exceeding limit",
                        "file_path": file_path,
                        "is_bomb": True,
                    }

                manifest: list[dict[str, Any]] = []
                total_size = 0

                for entry in entries:
                    total_size += entry.uncompressed
                    if total_size > MAX_TOTAL_SIZE:
                        return {
                            "error": "Archive total size exceeds 2GB limit",
                            "file_path": file_path,
                            "is_bomb": True,
                        }

                    manifest.append({
                        "filename": entry.filename,
                        "uncompressed_size": entry.uncompressed,
                        "is_dir": entry.is_directory,
                    })

            extracted_to = None
            if extract and extract_dir:
                os.makedirs(extract_dir, exist_ok=True)
                with py7zr.SevenZipFile(file_path, "r") as sz:
                    sz.extractall(extract_dir)
                extracted_to = extract_dir

            return {
                "format": "7z",
                "file_count": len([m for m in manifest if not m.get("is_dir")]),
                "dir_count": len([m for m in manifest if m.get("is_dir")]),
                "total_uncompressed": total_size,
                "manifest": manifest,
                "is_bomb": False,
                "extracted_to": extracted_to,
                "file_path": file_path,
            }
        except ImportError:
            return {"error": "py7zr not installed", "file_path": file_path}
