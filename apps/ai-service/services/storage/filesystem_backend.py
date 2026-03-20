"""Filesystem storage backend for binary files, media, and thumbnails."""

import logging
import os
import shutil
from typing import Any

logger = logging.getLogger(__name__)

UPLOAD_PATH = os.getenv("UPLOAD_PATH", "./data/uploads")
THUMBNAIL_PATH = os.getenv("THUMBNAIL_PATH", "./data/thumbnails")
TRANSCRIPTION_PATH = os.getenv("TRANSCRIPTION_PATH", "./data/transcriptions")
EXPORT_PATH = os.getenv("EXPORT_PATH", "./data/exports")


def ensure_user_dirs(user_id: str) -> dict[str, str]:
    """Ensure all user directories exist and return paths."""
    paths = {
        "uploads": os.path.join(UPLOAD_PATH, user_id),
        "thumbnails": os.path.join(THUMBNAIL_PATH, user_id),
        "transcriptions": os.path.join(TRANSCRIPTION_PATH, user_id),
        "exports": os.path.join(EXPORT_PATH, user_id),
    }
    for p in paths.values():
        os.makedirs(p, exist_ok=True)
    return paths


def get_file_path(user_id: str, file_id: str, filename: str) -> str:
    """Get the storage path for a file."""
    user_dir = os.path.join(UPLOAD_PATH, user_id, file_id)
    os.makedirs(user_dir, exist_ok=True)
    return os.path.join(user_dir, filename)


def save_file(user_id: str, file_id: str, filename: str, content: bytes) -> str:
    """Save a file and return the path."""
    path = get_file_path(user_id, file_id, filename)
    with open(path, "wb") as f:
        f.write(content)
    return path


def delete_file(user_id: str, file_id: str) -> bool:
    """Delete a file and its directory."""
    file_dir = os.path.join(UPLOAD_PATH, user_id, file_id)
    try:
        if os.path.exists(file_dir):
            shutil.rmtree(file_dir)
        # Also clean up thumbnails
        thumb_dir = os.path.join(THUMBNAIL_PATH, user_id, file_id)
        if os.path.exists(thumb_dir):
            shutil.rmtree(thumb_dir)
        return True
    except Exception as e:
        logger.error(f"Delete failed: {e}")
        return False


def get_storage_usage(user_id: str) -> dict[str, Any]:
    """Get storage usage for a user."""
    total = 0
    file_count = 0
    user_upload_dir = os.path.join(UPLOAD_PATH, user_id)

    if os.path.exists(user_upload_dir):
        for root, dirs, files in os.walk(user_upload_dir):
            for f in files:
                total += os.path.getsize(os.path.join(root, f))
                file_count += 1

    return {
        "total_bytes": total,
        "total_mb": round(total / (1024 * 1024), 2),
        "file_count": file_count,
    }
