"""Document Q&A Agent - RAG-based question answering over documents via cloud LLM."""

from __future__ import annotations

import asyncio
import csv
import json
import logging
import os
import sqlite3
import subprocess
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

        # Build context from available sources — no artificial limits.
        # The LLM provider enforces its own context window; we give it
        # as much relevant data as possible.
        context_parts = []
        if schema_context:
            context_parts.append(f"Available data tables:\n{schema_context}")
        if document_context:
            context_parts.append(f"Document content:\n{document_context}")

        full_context = "\n\n".join(context_parts) if context_parts else "No specific data context available."

        # Build conversation — include full history, let the LLM
        # provider handle context window limits via its own truncation.
        messages = [
            {"role": h.get("role", "user"), "content": h.get("content", "") or ""}
            for h in conversation_history[-20:]
        ]
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

                # Try extracting text content for supported formats.
                # AI best practice: present data as structured markdown
                # tables/sections so the LLM can reason about it.
                content = ""
                if path and os.path.exists(path):
                    ext = os.path.splitext(path)[1].lower()
                    try:
                        if ext == ".pdf":
                            import fitz
                            doc = fitz.open(path)
                            pages_text = [p.get_text() for p in doc]
                            doc.close()
                            content = "\n\n".join(pages_text)

                        elif ext in (".xlsx", ".xls"):
                            content = DocumentQAAgent._extract_excel_for_ai(path)

                        elif ext == ".docx":
                            content = DocumentQAAgent._extract_docx_for_ai(path)

                        elif ext == ".doc":
                            content = DocumentQAAgent._extract_doc_for_ai(path)

                        elif ext in (".pptx", ".ppt"):
                            content = DocumentQAAgent._extract_pptx_for_ai(path)

                        elif ext in (".csv", ".tsv"):
                            content = DocumentQAAgent._extract_csv_for_ai(path, ext)

                        elif ext in (".db", ".sqlite", ".sqlite3"):
                            content = DocumentQAAgent._extract_sqlite_for_ai(path)

                        elif ext in (".mdb", ".accdb"):
                            content = DocumentQAAgent._extract_access_for_ai(path)

                        elif ext == ".sql":
                            with open(path, "r", encoding="utf-8", errors="replace") as f:
                                content = f.read()

                        elif ext in (".txt", ".md", ".html", ".json", ".xml",
                                     ".yaml", ".yml", ".toml", ".ini", ".log"):
                            with open(path, "r", encoding="utf-8", errors="replace") as f:
                                content = f.read()
                    except Exception as exc:
                        meta_lines.append(f"Text extraction error: {exc}")

                if content:
                    meta_lines.append(f"Content:\n{content}")

                text_parts.append("\n".join(meta_lines))

            return "\n\n---\n\n".join(text_parts)
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # AI-optimised content extractors
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_excel_for_ai(path: str) -> str:
        """Extract ALL sheets from an Excel file as markdown tables.

        Reads every sheet completely. For large sheets, includes all
        headers plus a smart sample (first rows + last rows) so the
        LLM sees both the structure and range of the data.
        """
        import openpyxl

        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        parts: list[str] = []
        num_sheets = len(wb.sheetnames)

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows_iter = ws.iter_rows(values_only=True)
            header_row = next(rows_iter, None)
            if not header_row:
                continue

            headers = [str(h) if h is not None else f"col_{i}"
                       for i, h in enumerate(header_row)]

            # Read all rows
            all_rows = []
            for row_vals in rows_iter:
                cells = [str(v) if v is not None else "" for v in row_vals[:len(headers)]]
                all_rows.append(cells)

            total = len(all_rows)
            section = [f"\n### Sheet: {sheet_name} ({total} rows, {len(headers)} cols)\n"]
            section.append("| " + " | ".join(headers) + " |")
            section.append("| " + " | ".join("---" for _ in headers) + " |")

            # Smart sampling: for small sheets show all, for large ones
            # show first + last rows so LLM sees the full range.
            if total <= 100:
                for cells in all_rows:
                    section.append("| " + " | ".join(c[:80] for c in cells) + " |")
            else:
                for cells in all_rows[:50]:
                    section.append("| " + " | ".join(c[:80] for c in cells) + " |")
                section.append(f"| ... ({total - 70} more rows) ... |")
                for cells in all_rows[-20:]:
                    section.append("| " + " | ".join(c[:80] for c in cells) + " |")

            parts.append("\n".join(section))

        wb.close()
        return "\n".join(parts) if parts else ""

    @staticmethod
    def _extract_docx_for_ai(path: str) -> str:
        """Extract text AND tables from a Word document.

        Reads the full document: paragraphs with heading hierarchy,
        plus all tables rendered as markdown.
        """
        from docx import Document as DocxDocument

        doc = DocxDocument(path)
        parts: list[str] = []

        for para in doc.paragraphs:
            text = para.text.strip()
            if not text:
                continue
            style = (para.style.name or "").lower()
            if "heading" in style:
                level = 1
                for ch in style:
                    if ch.isdigit():
                        level = int(ch)
                        break
                parts.append(f"{'#' * level} {text}")
            else:
                parts.append(text)

        for idx, table in enumerate(doc.tables):
            section = [f"\n**Table {idx + 1}:**\n"]
            for r_idx, row in enumerate(table.rows):
                cells = [cell.text.strip() for cell in row.cells]
                section.append("| " + " | ".join(cells) + " |")
                if r_idx == 0:
                    section.append("| " + " | ".join("---" for _ in cells) + " |")
            parts.append("\n".join(section))

        return "\n".join(parts) if parts else ""

    @staticmethod
    def _extract_doc_for_ai(path: str) -> str:
        """Extract text from legacy .doc files using antiword.

        Antiword handles the old binary Word format reliably and
        outputs plain text that an LLM can reason about directly.
        """
        try:
            result = subprocess.run(
                ["antiword", path],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0 and result.stdout:
                return result.stdout
        except FileNotFoundError:
            logger.debug("antiword not installed — .doc extraction unavailable")
        except Exception as exc:
            logger.warning("antiword failed: %s", exc)
        # Fallback: try reading any embedded text
        try:
            with open(path, "rb") as f:
                raw = f.read()
            text = raw.decode("utf-8", errors="ignore")
            # Filter to printable text runs
            chunks = []
            current: list[str] = []
            for ch in text:
                if ch.isprintable() or ch in ("\n", "\t"):
                    current.append(ch)
                else:
                    if len(current) > 20:
                        chunks.append("".join(current))
                    current = []
            if len(current) > 20:
                chunks.append("".join(current))
            return "\n".join(chunks) if chunks else ""
        except Exception:
            return ""

    @staticmethod
    def _extract_pptx_for_ai(path: str) -> str:
        """Extract all slides from PowerPoint as structured markdown."""
        try:
            from pptx import Presentation
        except ImportError:
            logger.debug("python-pptx not installed")
            return ""

        prs = Presentation(path)
        parts: list[str] = []

        for slide_num, slide in enumerate(prs.slides, 1):
            section = [f"\n### Slide {slide_num}"]

            if slide.shapes.title and slide.shapes.title.text:
                section.append(f"**{slide.shapes.title.text.strip()}**\n")

            for shape in slide.shapes:
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        text = para.text.strip()
                        if text:
                            section.append(text)

                if shape.has_table:
                    table = shape.table
                    section.append("")
                    for r_idx, row in enumerate(table.rows):
                        cells = [cell.text.strip() for cell in row.cells]
                        section.append("| " + " | ".join(cells) + " |")
                        if r_idx == 0:
                            section.append("| " + " | ".join("---" for _ in cells) + " |")

            if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                notes = slide.notes_slide.notes_text_frame.text.strip()
                if notes:
                    section.append(f"\n_Notes: {notes}_")

            parts.append("\n".join(section))

        return f"**PowerPoint: {len(prs.slides)} slides**\n" + "\n".join(parts)

    @staticmethod
    def _extract_csv_for_ai(path: str, ext: str = ".csv") -> str:
        """Extract CSV/TSV as a markdown table — all headers + smart sample."""
        delimiter = "\t" if ext == ".tsv" else ","
        try:
            with open(path, "rb") as f:
                raw = f.read(8192)
            encoding = "utf-8"
            try:
                raw.decode("utf-8")
            except UnicodeDecodeError:
                encoding = "latin-1"

            with open(path, "r", encoding=encoding, errors="replace") as f:
                sample = f.read(8192)
                f.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=f"{delimiter};|\t")
                except csv.Error:
                    dialect = csv.excel
                    dialect.delimiter = delimiter

                reader = csv.reader(f, dialect)
                headers = next(reader, None)
                if not headers:
                    return ""

                all_rows = list(reader)
                total = len(all_rows)

                md_parts = [
                    "| " + " | ".join(headers) + " |",
                    "| " + " | ".join("---" for _ in headers) + " |",
                ]

                if total <= 100:
                    for row in all_rows:
                        cells = [str(c) for c in row[:len(headers)]]
                        while len(cells) < len(headers):
                            cells.append("")
                        md_parts.append("| " + " | ".join(cells) + " |")
                else:
                    for row in all_rows[:50]:
                        cells = [str(c) for c in row[:len(headers)]]
                        while len(cells) < len(headers):
                            cells.append("")
                        md_parts.append("| " + " | ".join(cells) + " |")
                    md_parts.append(f"| ... ({total - 70} more rows) ... |")
                    for row in all_rows[-20:]:
                        cells = [str(c) for c in row[:len(headers)]]
                        while len(cells) < len(headers):
                            cells.append("")
                        md_parts.append("| " + " | ".join(cells) + " |")

                return f"**CSV: {total} rows, {len(headers)} columns**\n\n" + "\n".join(md_parts)
        except Exception as exc:
            logger.warning("CSV extraction failed: %s", exc)
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    return f.read()
            except Exception:
                return ""

    @staticmethod
    def _extract_sqlite_for_ai(path: str) -> str:
        """Extract schema + sample data from SQLite/DB files.

        Lists every table with full schema and smart row sampling.
        """
        try:
            conn = sqlite3.connect(path)
            conn.row_factory = sqlite3.Row
        except Exception as exc:
            logger.warning("SQLite open failed: %s", exc)
            return ""

        try:
            tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()

            if not tables:
                return "Empty database (no tables)."

            parts = [f"**SQLite Database: {len(tables)} tables**\n"]

            for tbl in tables:
                tbl_name = tbl["name"]
                cols_info = conn.execute(
                    f'PRAGMA table_info("{tbl_name}")'
                ).fetchall()
                col_names = [c["name"] for c in cols_info]
                col_types = [c["type"] or "TEXT" for c in cols_info]

                count = conn.execute(
                    f'SELECT COUNT(*) as c FROM "{tbl_name}"'
                ).fetchone()["c"]

                section = [
                    f"\n### Table: {tbl_name} ({count} rows, {len(col_names)} cols)",
                    "Schema: " + ", ".join(
                        f"{n} ({t})" for n, t in zip(col_names, col_types)
                    ),
                    "",
                    "| " + " | ".join(col_names) + " |",
                    "| " + " | ".join("---" for _ in col_names) + " |",
                ]

                # Smart sample: for small tables show all, large show first+last
                if count <= 100:
                    rows = conn.execute(f'SELECT * FROM "{tbl_name}"').fetchall()
                else:
                    rows = conn.execute(f'SELECT * FROM "{tbl_name}" LIMIT 50').fetchall()

                for row in rows:
                    cells = [str(row[c]) if row[c] is not None else "" for c in col_names]
                    section.append("| " + " | ".join(cells) + " |")
                if count > 100:
                    section.append(f"| ... ({count - 50} more rows) |")

                parts.append("\n".join(section))

            return "\n".join(parts)
        except Exception as exc:
            logger.warning("SQLite extraction failed: %s", exc)
            return ""
        finally:
            conn.close()

    @staticmethod
    def _extract_access_for_ai(path: str) -> str:
        """Extract schema + data from MS Access (.mdb/.accdb) via mdbtools."""
        try:
            result = subprocess.run(
                ["mdb-tables", "-1", path],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                return f"Access DB: could not list tables ({result.stderr.strip()})"

            tables = [t.strip() for t in result.stdout.strip().split("\n") if t.strip()]
            if not tables:
                return "Access DB: no tables found."

            parts = [f"**MS Access Database: {len(tables)} tables**\n"]

            for tbl_name in tables:
                section = [f"\n### Table: {tbl_name}"]

                schema_result = subprocess.run(
                    ["mdb-schema", path, "--table", tbl_name],
                    capture_output=True, text=True, timeout=30,
                )
                if schema_result.returncode == 0 and schema_result.stdout:
                    for line in schema_result.stdout.split("\n"):
                        line = line.strip()
                        if line and not line.startswith("--"):
                            section.append(line)

                export_result = subprocess.run(
                    ["mdb-export", path, tbl_name],
                    capture_output=True, text=True, timeout=60,
                )
                if export_result.returncode == 0 and export_result.stdout:
                    lines = export_result.stdout.strip().split("\n")
                    if lines:
                        headers = lines[0].split(",")
                        section.append("")
                        section.append("| " + " | ".join(h.strip('"') for h in headers) + " |")
                        section.append("| " + " | ".join("---" for _ in headers) + " |")
                        data_lines = lines[1:]
                        total = len(data_lines)
                        if total <= 100:
                            for row_line in data_lines:
                                cells = row_line.split(",")
                                section.append("| " + " | ".join(c.strip('"') for c in cells[:len(headers)]) + " |")
                        else:
                            for row_line in data_lines[:50]:
                                cells = row_line.split(",")
                                section.append("| " + " | ".join(c.strip('"') for c in cells[:len(headers)]) + " |")
                            section.append(f"| ... ({total - 50} more rows) |")

                parts.append("\n".join(section))

            return "\n".join(parts)

        except FileNotFoundError:
            logger.debug("mdbtools not installed — Access DB extraction unavailable")
            return "Access database file detected. Install mdbtools for content extraction."
        except Exception as exc:
            logger.warning("Access extraction failed: %s", exc)
            return ""
