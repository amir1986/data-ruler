"""Document Processing Agent - extracts text from PDF, DOCX, PPTX, etc."""

from __future__ import annotations

import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class DocumentProcessorAgent(AgentBase):
    """Extracts text content from documents (PDF, DOCX, PPTX, TXT, HTML, MD)."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="document_processor",
            description="Extracts text from PDF, DOCX, PPTX, TXT, HTML, and Markdown documents.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        file_path = payload.get("file_path", "")
        file_type = payload.get("file_type", "")

        if not file_path or not os.path.exists(file_path):
            return {"error": f"File not found: {file_path}"}

        return await self.process_file(file_path, file_type)

    async def process_file(self, file_path: str, file_type: str = "") -> dict[str, Any]:
        if not file_type:
            ext = os.path.splitext(file_path)[1].lower()
            type_map = {".pdf": "pdf", ".docx": "docx", ".pptx": "pptx",
                        ".txt": "txt", ".md": "markdown", ".html": "html"}
            file_type = type_map.get(ext, "txt")

        try:
            if file_type == "pdf":
                return self._extract_pdf(file_path)
            elif file_type == "docx":
                return self._extract_docx(file_path)
            elif file_type == "pptx":
                return self._extract_pptx(file_path)
            elif file_type == "html":
                return self._extract_html(file_path)
            else:
                return self._extract_text(file_path)
        except Exception as exc:
            return {"error": str(exc)}

    def _extract_pdf(self, file_path: str) -> dict[str, Any]:
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(file_path)
            pages = []
            full_text = []
            for i, page in enumerate(doc):
                text = page.get_text()
                pages.append({"page": i + 1, "text": text, "char_count": len(text)})
                full_text.append(text)
            doc.close()
            return {
                "text": "\n\n".join(full_text),
                "pages": pages,
                "page_count": len(pages),
                "format": "pdf",
                "char_count": sum(len(t) for t in full_text),
            }
        except ImportError:
            return self._extract_text(file_path)

    def _extract_docx(self, file_path: str) -> dict[str, Any]:
        try:
            from docx import Document
            doc = Document(file_path)
            paragraphs = [p.text for p in doc.paragraphs]
            tables = []
            for table in doc.tables:
                rows = []
                for row in table.rows:
                    rows.append([cell.text for cell in row.cells])
                if rows:
                    tables.append({"headers": rows[0] if rows else [], "rows": rows[1:]})
            return {
                "text": "\n".join(paragraphs),
                "paragraphs": len(paragraphs),
                "tables": tables,
                "format": "docx",
                "char_count": sum(len(p) for p in paragraphs),
            }
        except ImportError:
            return self._extract_text(file_path)

    def _extract_pptx(self, file_path: str) -> dict[str, Any]:
        try:
            from pptx import Presentation
            prs = Presentation(file_path)
            slides = []
            full_text = []
            for i, slide in enumerate(prs.slides):
                texts = []
                for shape in slide.shapes:
                    if hasattr(shape, "text"):
                        texts.append(shape.text)
                text = "\n".join(texts)
                slides.append({"slide": i + 1, "text": text})
                full_text.append(text)
            return {
                "text": "\n\n".join(full_text),
                "slides": slides,
                "slide_count": len(slides),
                "format": "pptx",
            }
        except ImportError:
            return self._extract_text(file_path)

    def _extract_html(self, file_path: str) -> dict[str, Any]:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        # Simple tag stripping
        import re
        text = re.sub(r'<[^>]+>', ' ', content)
        text = re.sub(r'\s+', ' ', text).strip()
        return {"text": text, "format": "html", "char_count": len(text)}

    def _extract_text(self, file_path: str) -> dict[str, Any]:
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
        except Exception:
            with open(file_path, "r", encoding="latin-1") as f:
                text = f.read()
        return {"text": text, "format": "text", "char_count": len(text)}
