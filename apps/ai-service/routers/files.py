"""File processing router - handles file processing pipeline triggers."""

import os
import logging
import sqlite3
import json
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form
from pydantic import BaseModel
from models.schemas import AgentMessage, AgentMessageType

logger = logging.getLogger(__name__)
router = APIRouter()

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")
UPLOAD_PATH = os.getenv("UPLOAD_PATH", "./data/uploads")


class ProcessRequest(BaseModel):
    file_id: str
    user_id: str
    file_path: str
    original_name: str


def get_catalog_db():
    db_file = os.path.join(DATABASE_PATH, "catalog.db")
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    return conn


def _sql_escape_ident(name: str) -> str:
    """Escape a column/table name for use inside SQLite double-quoted identifiers."""
    return name.replace('"', '""')


async def run_processing_pipeline(file_id: str, user_id: str, file_path: str, original_name: str):
    """Run the full processing pipeline for a file."""
    conn = get_catalog_db()
    log_entries: list[dict] = []

    def _log(stage: str, status: str, detail: str | None = None):
        entry = {"stage": stage, "status": status, "ts": datetime.utcnow().isoformat()}
        if detail:
            entry["detail"] = detail
        log_entries.append(entry)
        conn.execute(
            "UPDATE files SET processing_log = ? WHERE id = ?",
            (json.dumps(log_entries), file_id),
        )
        conn.commit()

    try:
        # Update status to processing
        conn.execute(
            "UPDATE files SET processing_status = 'processing' WHERE id = ?",
            (file_id,)
        )
        # Clean up old imported_tables entries (supports reprocessing)
        conn.execute("DELETE FROM imported_tables WHERE file_id = ?", (file_id,))
        conn.commit()

        # Stage 1: File detection
        _log("detection", "running")
        from agents.file_detection import FileDetectionAgent
        detector = FileDetectionAgent()
        detection_result = await detector.detect(file_path, original_name)

        file_category = detection_result.get("category", "unknown")
        file_type = detection_result.get("file_type", "unknown")
        mime_type = detection_result.get("mime_type", "application/octet-stream")

        # Update file metadata
        conn.execute(
            """UPDATE files SET file_type = ?, file_category = ?, mime_type = ?
               WHERE id = ?""",
            (file_type, file_category, mime_type, file_id)
        )
        conn.commit()
        _log("detection", "done", f"{file_category}/{file_type}")

        # Stage 2: Process based on category
        _log("parsing", "running")
        result = {}
        if file_category in ("tabular", "spreadsheet"):
            from agents.tabular_processor import TabularProcessorAgent
            processor = TabularProcessorAgent()
            result = await processor.process_file(file_path, file_type)
        elif file_category == "document":
            from agents.document_processor import DocumentProcessorAgent
            processor = DocumentProcessorAgent()
            result = await processor.process_file(file_path, file_type)
        elif file_category == "structured_data":
            from agents.structured_data import StructuredDataAgent
            processor = StructuredDataAgent()
            result = await processor.process_file(file_path, file_type)
        elif file_category == "database":
            from agents.database_importer import DatabaseImporterAgent
            processor = DatabaseImporterAgent()
            result = await processor.process_file(file_path, file_type)

        # Check if the processor returned an error
        if result.get("error"):
            raise RuntimeError(f"Processor error ({file_category}): {result['error']}")

        _log("parsing", "done")

        # ── Collect sheet data ─────────────────────────────────────
        # Normalise results from ANY processor into a uniform list of
        # (sheet_name, columns, rows) tuples so Stages 3 & 4 are
        # completely format-agnostic.
        #
        # Sources:
        #   - Multi-sheet Excel → "all_sheets" dict
        #   - Database importer → "tables" list of {name, columns, rows}
        #   - Everything else   → top-level "columns"+"rows"
        all_sheets = result.get("all_sheets", {})
        db_tables = result.get("tables", [])

        if all_sheets and len(all_sheets) > 1:
            sheets = [
                (sname, sdata.get("columns", []), sdata.get("rows", []))
                for sname, sdata in all_sheets.items()
                if sdata.get("columns")
            ]
        elif db_tables:
            # Database files: each table becomes a "sheet"
            sheets = [
                (t.get("name", f"table_{i}"), t.get("columns", []), t.get("rows", []))
                for i, t in enumerate(db_tables)
                if t.get("columns")
            ]
        elif result.get("columns") and result.get("rows"):
            sheets = [(None, result["columns"], result["rows"])]
        else:
            sheets = []

        # ── Stage 3: Schema inference (per-sheet) ────────────────
        _log("schema_inference", "running", f"{len(sheets)} sheet(s)")
        if sheets:
            from agents.schema_inference import SchemaInferenceAgent
            schema_agent = SchemaInferenceAgent()

            combined_schema = []
            total_rows = 0
            max_cols = 0
            quality_scores = []

            for sheet_name, columns, rows in sheets:
                schema_msg = AgentMessage(
                    message_type=AgentMessageType.REQUEST,
                    source_agent="file_processor",
                    target_agent="schema_inference",
                    payload={
                        "columns": columns,
                        "rows": rows[:1000],
                    },
                )
                schema_result = await schema_agent.process(schema_msg)
                schema_data = schema_result.payload

                sheet_cols = schema_data.get("schema", [])
                # Tag each column with its sheet name for multi-sheet
                if sheet_name:
                    for col in sheet_cols:
                        col["sheet"] = sheet_name
                combined_schema.extend(sheet_cols)

                total_rows += len(rows)
                max_cols = max(max_cols, len(columns))
                qp = schema_data.get("quality_profile", {})
                if qp.get("score"):
                    quality_scores.append(qp["score"])

            avg_quality = (
                round(sum(quality_scores) / len(quality_scores), 1)
                if quality_scores else 0
            )

            conn.execute(
                """UPDATE files SET
                    schema_snapshot = ?, row_count = ?, column_count = ?,
                    quality_profile = ?, quality_score = ?,
                    processing_status = 'ready'
                   WHERE id = ?""",
                (
                    json.dumps(combined_schema),
                    total_rows,
                    max_cols,
                    json.dumps({"score": avg_quality}),
                    avg_quality,
                    file_id,
                )
            )
        else:
            conn.execute(
                "UPDATE files SET processing_status = 'ready' WHERE id = ?",
                (file_id,)
            )

        _log("schema_inference", "done")

        # ── Stage 4: Store data in user's database (all sheets) ──
        _log("storage", "running")
        if sheets:
            user_db_path = os.path.join(DATABASE_PATH, user_id, "user_data.db")
            os.makedirs(os.path.dirname(user_db_path), exist_ok=True)
            user_conn = sqlite3.connect(user_db_path)

            base_table = f"file_{file_id.replace('-', '_')}"
            sheet_table_map = {}  # sheet_name -> table_name

            for idx, (sheet_name, columns, rows) in enumerate(sheets):
                table_name = base_table if idx == 0 else f"{base_table}__s{idx}"
                sheet_table_map[sheet_name or f"Sheet{idx + 1}"] = table_name

                # Drop existing table to prevent duplicate rows on reprocessing
                user_conn.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                col_defs = ", ".join(
                    f'"{_sql_escape_ident(c)}" TEXT' for c in columns
                )
                user_conn.execute(
                    f'CREATE TABLE "{table_name}" ({col_defs})'
                )

                placeholders = ", ".join(["?"] * len(columns))
                insert_sql = f'INSERT INTO "{table_name}" VALUES ({placeholders})'
                batch = []
                for row in rows:
                    values = [
                        str(row.get(c, "")) if row.get(c) is not None else None
                        for c in columns
                    ]
                    batch.append(values)
                    if len(batch) >= 1000:
                        user_conn.executemany(insert_sql, batch)
                        batch = []
                if batch:
                    user_conn.executemany(insert_sql, batch)

            user_conn.commit()
            user_conn.close()

            # Store table mapping: plain string for single-sheet,
            # JSON object for multi-sheet (backward compatible).
            if len(sheet_table_map) == 1:
                db_table_value = base_table
            else:
                db_table_value = json.dumps(sheet_table_map)

            conn.execute(
                """UPDATE files SET db_table_name = ?, storage_backend = 'sqlite',
                    db_file_path = ? WHERE id = ?""",
                (db_table_value, user_db_path, file_id)
            )

            # Populate imported_tables with per-sheet metadata
            for idx, (sheet_name, columns, rows) in enumerate(sheets):
                storage_tbl = base_table if idx == 0 else f"{base_table}__s{idx}"
                display_name = sheet_name or f"Sheet{idx + 1}"

                # Extract schema for this sheet only
                if sheet_name and combined_schema:
                    sheet_schema = [c for c in combined_schema if c.get("sheet") == sheet_name]
                elif len(sheets) == 1:
                    sheet_schema = combined_schema
                else:
                    sheet_schema = []

                conn.execute(
                    """INSERT INTO imported_tables
                       (id, file_id, table_name, schema_snapshot, row_count, storage_table_name)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (uuid4().hex, file_id, display_name, json.dumps(sheet_schema), len(rows), storage_tbl)
                )

            sheet_detail = ", ".join(
                f"{sn or f'Sheet{i+1}'}({len(r)} rows)"
                for i, (sn, _, r) in enumerate(sheets)
            )
            logger.info(f"Stored {len(sheets)} sheet(s) for file {file_id}: {sheet_detail}")

        conn.commit()
        _log("storage", "done")
        logger.info(f"Processing complete for file {file_id}")

    except Exception as e:
        logger.error(f"Processing failed for file {file_id}: {e}")
        _log("pipeline", "error", str(e))
        conn.execute(
            "UPDATE files SET processing_status = 'error', processing_error = ? WHERE id = ?",
            (str(e), file_id)
        )
        conn.commit()
    finally:
        conn.close()


@router.post("/process")
async def trigger_processing(req: ProcessRequest, background_tasks: BackgroundTasks):
    """Trigger file processing pipeline."""
    background_tasks.add_task(
        run_processing_pipeline,
        req.file_id,
        req.user_id,
        req.file_path,
        req.original_name,
    )
    return {"status": "processing", "file_id": req.file_id}


@router.post("/upload-and-process")
async def upload_and_process(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    file_id: str = Form(...),
    user_id: str = Form(...),
    original_name: str = Form(...),
):
    """Receive file bytes from web app and trigger processing.

    Used in production where web and AI services have separate storage.
    The web app sends the actual file content instead of just a path.
    """
    # Save file to AI service's own upload volume
    upload_dir = os.path.join(UPLOAD_PATH, user_id, file_id)
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, original_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    logger.info(f"Received file {original_name} ({len(content)} bytes) for {file_id}")

    background_tasks.add_task(
        run_processing_pipeline,
        file_id,
        user_id,
        file_path,
        original_name,
    )
    return {"status": "processing", "file_id": file_id}


@router.get("/status/{file_id}")
async def get_status(file_id: str):
    """Get processing status for a file."""
    conn = get_catalog_db()
    try:
        row = conn.execute(
            "SELECT processing_status, processing_error, quality_score FROM files WHERE id = ?",
            (file_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="File not found")
        return {
            "file_id": file_id,
            "status": row["processing_status"],
            "error": row["processing_error"],
            "quality_score": row["quality_score"],
        }
    finally:
        conn.close()
