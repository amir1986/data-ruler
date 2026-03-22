"""Document Q&A Agent - RAG-based question answering over documents via cloud LLM."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage
from services.ollama_client import chat_completion, generate_embedding

logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")
UPLOAD_PATH = os.getenv("UPLOAD_PATH", "./data/uploads")

QA_SYSTEM = """You are a helpful data assistant for the Data Ruler platform.
Answer questions based on the provided context. If the context doesn't contain
enough information, say so honestly. Use markdown formatting.

When discussing data:
- Reference specific column names and values
- Suggest SQL queries when appropriate
- Recommend visualizations for data insights
- Be precise about numbers and statistics"""


class DocumentQAAgent(AgentBase):
    """RAG-based Q&A over documents and data using cloud LLM + embeddings."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="document_qa",
            description="Answers questions about documents and data using RAG with cloud LLM and embeddings.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        question = payload.get("message", payload.get("question", ""))
        schema_context = payload.get("schema_context", "")
        document_context = payload.get("document_context", "")
        conversation_history = payload.get("conversation_history", [])
        user_id = payload.get("user_id", "")
        file_id = payload.get("file_id", "")

        if not question:
            return {"error": "No question provided"}

        # Try to extract document text for non-tabular files (PDF, DOCX, etc.)
        if not document_context and user_id:
            document_context = await self._fetch_document_text(user_id, file_id, question)

        # Build context from available sources
        context_parts = []
        if schema_context:
            context_parts.append(f"Available data tables:\n{schema_context}")
        if document_context:
            context_parts.append(f"Document content:\n{document_context}")

        full_context = "\n\n".join(context_parts) if context_parts else "No specific data context available."

        # Build conversation — keep recent history short to avoid exceeding context limits
        messages = []
        total_chars = 0
        for h in reversed(conversation_history[-10:]):
            content = h.get("content", "") or ""
            # Truncate individual messages and cap total history size
            if len(content) > 1500:
                content = content[:1500] + "..."
            if total_chars + len(content) > 6000:
                break
            messages.insert(0, {
                "role": h.get("role", "user"),
                "content": content,
            })
            total_chars += len(content)
        messages.append({
            "role": "user",
            "content": f"Context:\n{full_context}\n\nQuestion: {question}",
        })

        locale = payload.get("locale", "en")
        system = QA_SYSTEM
        if locale == "he":
            system += "\n\nIMPORTANT: Always respond entirely in Hebrew (עברית). All text, headings, and explanations must be in Hebrew."

        try:
            answer = await chat_completion(
                messages=messages,
                system=system,
                temperature=0.5,
                max_tokens=1500,
                model_tier="chat",
            )
            return {
                "answer": answer,
                "question": question,
                "context_used": bool(context_parts),
                "status": "success",
            }
        except Exception as exc:
            return {
                "error": str(exc),
                "question": question,
                "status": "error",
            }

    async def _fetch_document_text(
        self, user_id: str, file_id: str | None, question: str,
    ) -> str:
        """Look up document files in the catalog and extract text content.

        For non-tabular files (PDF, DOCX, TXT, etc.) the schema_context is
        empty or has 0 columns.  This method finds the actual file on disk,
        extracts text, and returns it (truncated to fit context limits).
        """
        try:
            return await asyncio.to_thread(
                self._fetch_document_text_sync, user_id, file_id, question,
            )
        except Exception as exc:
            logger.warning("Document text fetch failed: %s", exc)
            return ""

    @staticmethod
    def _fetch_document_text_sync(
        user_id: str, file_id: str | None, question: str,
    ) -> str:
        catalog_db = os.path.join(DATABASE_PATH, "catalog.db")
        if not os.path.exists(catalog_db):
            return ""

        conn = sqlite3.connect(catalog_db)
        conn.row_factory = sqlite3.Row
        try:
            if file_id:
                rows = conn.execute(
                    """SELECT id, original_name, stored_path, file_type,
                              file_category, mime_type, size_bytes, row_count,
                              column_count, schema_snapshot, quality_score,
                              quality_profile, ai_summary, tags
                       FROM files WHERE user_id = ? AND id = ?""",
                    (user_id, file_id),
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT id, original_name, stored_path, file_type,
                              file_category, mime_type, size_bytes, row_count,
                              column_count, schema_snapshot, quality_score,
                              quality_profile, ai_summary, tags
                       FROM files WHERE user_id = ?
                       ORDER BY created_at DESC LIMIT 20""",
                    (user_id,),
                ).fetchall()

            # Match files mentioned in the question
            target_rows = []
            q_lower = question.lower()
            for row in rows:
                name = (row["original_name"] or "").lower()
                if name and name in q_lower:
                    target_rows.append(row)
            if not target_rows:
                target_rows = rows[:5]

            text_parts = []
            for row in target_rows:
                path = row["stored_path"]
                name = row["original_name"] or "unknown"

                # Always include file metadata — works for ANY file type
                meta_lines = [f"File: {name}"]
                if row["file_type"]:
                    meta_lines.append(f"Type: {row['file_type']}")
                if row["file_category"]:
                    meta_lines.append(f"Category: {row['file_category']}")
                if row["mime_type"]:
                    meta_lines.append(f"MIME: {row['mime_type']}")
                if row["size_bytes"]:
                    size_mb = row["size_bytes"] / (1024 * 1024)
                    meta_lines.append(f"Size: {size_mb:.1f} MB")
                if row["row_count"]:
                    meta_lines.append(f"Rows: {row['row_count']}")
                if row["column_count"]:
                    meta_lines.append(f"Columns: {row['column_count']}")
                if row["quality_score"] is not None:
                    meta_lines.append(f"Quality score: {row['quality_score']}")
                if row["tags"]:
                    meta_lines.append(f"Tags: {row['tags']}")

                # Schema info
                if row["schema_snapshot"]:
                    try:
                        schema = json.loads(row["schema_snapshot"])
                        if isinstance(schema, list) and schema:
                            cols = ", ".join(
                                f"{c.get('name', '?')} ({c.get('inferred_type', 'text')})"
                                for c in schema[:20]
                            )
                            meta_lines.append(f"Schema: {cols}")
                    except (json.JSONDecodeError, TypeError):
                        pass

                # Quality profile
                if row["quality_profile"]:
                    try:
                        profile = json.loads(row["quality_profile"])
                        if isinstance(profile, dict) and profile.get("issues"):
                            meta_lines.append(f"Quality issues: {', '.join(str(i) for i in profile['issues'][:5])}")
                    except (json.JSONDecodeError, TypeError):
                        pass

                # AI summary if available
                if row["ai_summary"]:
                    meta_lines.append(f"AI Summary: {row['ai_summary']}")

                # Try extracting text content for supported formats
                content = ""
                if path and os.path.exists(path):
                    ext = os.path.splitext(path)[1].lower()
                    try:
                        if ext == ".pdf":
                            import fitz
                            doc = fitz.open(path)
                            pages_text = [p.get_text() for p in doc]
                            doc.close()
                            content = "\n\n".join(pages_text)[:4000]
                        elif ext in (".txt", ".md", ".html", ".csv", ".json", ".xml",
                                     ".yaml", ".yml", ".toml", ".ini", ".log", ".tsv"):
                            with open(path, "r", encoding="utf-8", errors="replace") as f:
                                content = f.read(4000)
                        elif ext == ".docx":
                            from docx import Document
                            doc = Document(path)
                            content = "\n".join(p.text for p in doc.paragraphs)[:4000]
                    except Exception as exc:
                        meta_lines.append(f"Text extraction error: {exc}")

                if content:
                    meta_lines.append(f"Content:\n{content}")

                text_parts.append("\n".join(meta_lines))

            return "\n\n---\n\n".join(text_parts)
        finally:
            conn.close()
