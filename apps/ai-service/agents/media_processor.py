"""Media Processing Agent - handles images, audio, and video files."""

from __future__ import annotations

import io
import json
import logging
import os
import subprocess
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class MediaProcessorAgent(AgentBase):
    """Processes media files: images (EXIF, thumbnails, OCR), audio, and video."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="media_processor",
            description="Extracts metadata and generates previews for image, audio, and video files.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Process a media file based on its type."""
        payload = message.payload
        file_path: str = payload.get("file_path", "")
        mime_type: str = payload.get("mime_type", "")
        extension: str = payload.get("extension", "")

        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        ext = extension or os.path.splitext(file_path)[1].lower()

        try:
            if mime_type.startswith("image/") or ext in (
                ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp", ".svg",
            ):
                return await self._process_image(file_path, ext)
            elif mime_type.startswith("audio/") or ext in (
                ".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a", ".wma",
            ):
                return await self._process_audio(file_path, ext)
            elif mime_type.startswith("video/") or ext in (
                ".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm",
            ):
                return await self._process_video(file_path, ext)
            else:
                return {"error": f"Unsupported media format: {ext}", "file_path": file_path}
        except Exception as exc:
            self.logger.error("Failed to process media %s: %s", file_path, exc)
            return {"error": str(exc), "file_path": file_path}

    async def _process_image(self, file_path: str, ext: str) -> dict[str, Any]:
        """Extract EXIF, generate thumbnail, and provide OCR stub."""
        from PIL import Image
        from PIL.ExifTags import TAGS

        img = Image.open(file_path)

        result: dict[str, Any] = {
            "format": ext.lstrip("."),
            "media_type": "image",
            "width": img.width,
            "height": img.height,
            "mode": img.mode,
            "file_path": file_path,
        }

        # EXIF extraction
        exif_data: dict[str, Any] = {}
        try:
            raw_exif = img.getexif()
            if raw_exif:
                for tag_id, value in raw_exif.items():
                    tag_name = TAGS.get(tag_id, str(tag_id))
                    try:
                        exif_data[tag_name] = str(value)
                    except Exception:
                        exif_data[tag_name] = repr(value)
        except Exception as exc:
            self.logger.debug("EXIF extraction failed: %s", exc)

        result["exif"] = exif_data

        # Thumbnail generation
        thumbnail_path = self._generate_thumbnail(img, file_path)
        result["thumbnail_path"] = thumbnail_path

        # OCR stub
        result["ocr"] = self._ocr_stub(file_path)

        img.close()
        return result

    @staticmethod
    def _generate_thumbnail(img: Any, file_path: str, max_size: int = 256) -> str | None:
        """Generate a thumbnail and return its path."""
        try:
            thumb = img.copy()
            thumb.thumbnail((max_size, max_size))
            thumb_dir = os.path.join(os.path.dirname(file_path), ".thumbnails")
            os.makedirs(thumb_dir, exist_ok=True)
            base = os.path.splitext(os.path.basename(file_path))[0]
            thumb_path = os.path.join(thumb_dir, f"{base}_thumb.png")
            thumb.save(thumb_path, "PNG")
            return thumb_path
        except Exception as exc:
            logger.debug("Thumbnail generation failed: %s", exc)
            return None

    @staticmethod
    def _ocr_stub(file_path: str) -> dict[str, Any]:
        """OCR extraction stub - requires Tesseract to be installed."""
        try:
            import pytesseract
            from PIL import Image

            img = Image.open(file_path)
            text = pytesseract.image_to_string(img)
            img.close()
            return {"available": True, "text": text, "engine": "tesseract"}
        except ImportError:
            return {"available": False, "text": "", "engine": "tesseract", "note": "pytesseract not installed"}
        except Exception as exc:
            return {"available": False, "text": "", "engine": "tesseract", "error": str(exc)}

    async def _process_audio(self, file_path: str, ext: str) -> dict[str, Any]:
        """Extract audio metadata and provide transcription stub."""
        result: dict[str, Any] = {
            "format": ext.lstrip("."),
            "media_type": "audio",
            "file_path": file_path,
        }

        # Metadata extraction via mutagen
        try:
            import mutagen

            audio = mutagen.File(file_path)
            if audio is not None:
                result["duration_seconds"] = audio.info.length if audio.info else None
                result["bitrate"] = getattr(audio.info, "bitrate", None)
                result["sample_rate"] = getattr(audio.info, "sample_rate", None)
                result["channels"] = getattr(audio.info, "channels", None)

                # Tags
                tags: dict[str, str] = {}
                if audio.tags:
                    for key in audio.tags:
                        try:
                            tags[str(key)] = str(audio.tags[key])
                        except Exception:
                            pass
                result["tags"] = tags
        except ImportError:
            self.logger.debug("mutagen not available, trying ffprobe")
            result.update(self._ffprobe_metadata(file_path))
        except Exception as exc:
            self.logger.warning("Audio metadata extraction failed: %s", exc)
            result.update(self._ffprobe_metadata(file_path))

        # Transcription stub (Whisper via Ollama)
        result["transcription"] = {
            "available": False,
            "text": "",
            "engine": "whisper_ollama",
            "note": "Transcription requires Whisper model via Ollama",
        }

        return result

    async def _process_video(self, file_path: str, ext: str) -> dict[str, Any]:
        """Extract video metadata, keyframe extraction stub, and subtitle extraction."""
        result: dict[str, Any] = {
            "format": ext.lstrip("."),
            "media_type": "video",
            "file_path": file_path,
        }

        # ffprobe metadata
        probe = self._ffprobe_metadata(file_path)
        result.update(probe)

        # Keyframe extraction stub
        result["keyframes"] = {
            "available": False,
            "frames": [],
            "note": "Keyframe extraction requires ffmpeg",
        }

        # Subtitle extraction stub
        result["subtitles"] = self._extract_subtitles_stub(file_path)

        return result

    @staticmethod
    def _ffprobe_metadata(file_path: str) -> dict[str, Any]:
        """Extract metadata using ffprobe."""
        try:
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                file_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                data = json.loads(result.stdout)
                fmt = data.get("format", {})
                streams = data.get("streams", [])

                return {
                    "duration_seconds": float(fmt.get("duration", 0)),
                    "bitrate": int(fmt.get("bit_rate", 0)),
                    "format_name": fmt.get("format_name", ""),
                    "stream_count": len(streams),
                    "streams": [
                        {
                            "codec_type": s.get("codec_type"),
                            "codec_name": s.get("codec_name"),
                            "width": s.get("width"),
                            "height": s.get("height"),
                            "sample_rate": s.get("sample_rate"),
                            "channels": s.get("channels"),
                        }
                        for s in streams
                    ],
                }
        except FileNotFoundError:
            return {"ffprobe_available": False, "note": "ffprobe not found"}
        except Exception as exc:
            return {"ffprobe_error": str(exc)}
        return {}

    @staticmethod
    def _extract_subtitles_stub(file_path: str) -> dict[str, Any]:
        """Subtitle extraction stub using ffmpeg."""
        try:
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-select_streams", "s",
                "-show_entries", "stream=index,codec_name,codec_type",
                "-print_format", "json",
                file_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                data = json.loads(result.stdout)
                streams = data.get("streams", [])
                return {
                    "available": len(streams) > 0,
                    "subtitle_streams": streams,
                }
        except Exception:
            pass

        return {"available": False, "subtitle_streams": [], "note": "ffprobe not available"}
