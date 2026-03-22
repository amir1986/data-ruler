"""File processing router - handles file processing pipeline triggers."""

import os
import logging
import sqlite3
import json
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, HTTPException, BackgroundTasks
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


async def run_processing_pipeline(file_id: str, user_id: str, file_path: str, original_name: str):
    """Run the full processing pipeline for a file."""
    conn = get_catalog_db()
    try:
        # Update status to processing
        conn.execute(
            "UPDATE files SET processing_status = 'processing' WHERE id = ?",
            (file_id,)
        )
        conn.commit()

        # Stage 1: File detection
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

        # Stage 2: Process based on category
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

        # Stage 3: Schema inference
        if result.get("columns") and result.get("rows"):
            from agents.schema_inference import SchemaInferenceAgent
            schema_agent = SchemaInferenceAgent()
            schema_msg = AgentMessage(
                message_type=AgentMessageType.REQUEST,
                source_agent="file_processor",
                target_agent="schema_inference",
                payload={
                    "columns": result["columns"],
                    "rows": result["rows"][:1000],
                },
            )
            schema_result = await schema_agent.process(schema_msg)
            schema_data = schema_result.payload

            conn.execute(
                """UPDATE files SET
                    schema_snapshot = ?, row_count = ?, column_count = ?,
                    quality_profile = ?, quality_score = ?,
                    processing_status = 'ready'
                   WHERE id = ?""",
                (
                    json.dumps(schema_data.get("schema", [])),
                    len(result.get("rows", [])),
                    len(result.get("columns", [])),
                    json.dumps(schema_data.get("quality_profile", {})),
                    schema_data.get("quality_profile", {}).get("score", 0),
                    file_id,
                )
            )
        else:
            conn.execute(
                "UPDATE files SET processing_status = 'ready' WHERE id = ?",
                (file_id,)
            )

        # Stage 4: Store data in user's database
        if result.get("columns") and result.get("rows"):
            user_db_path = os.path.join(DATABASE_PATH, user_id, "user_data.db")
            os.makedirs(os.path.dirname(user_db_path), exist_ok=True)
            user_conn = sqlite3.connect(user_db_path)

            table_name = f"file_{file_id.replace('-', '_')}"
            columns = result["columns"]
            col_defs = ", ".join(f'"{c}" TEXT' for c in columns)
            user_conn.execute(f'CREATE TABLE IF NOT EXISTS "{table_name}" ({col_defs})')

            placeholders = ", ".join(["?"] * len(columns))
            for row in result["rows"]:
                values = [str(row.get(c, "")) if row.get(c) is not None else None for c in columns]
                user_conn.execute(
                    f'INSERT INTO "{table_name}" VALUES ({placeholders})',
                    values,
                )
            user_conn.commit()
            user_conn.close()

            conn.execute(
                """UPDATE files SET db_table_name = ?, storage_backend = 'sqlite',
                    db_file_path = ? WHERE id = ?""",
                (table_name, user_db_path, file_id)
            )

        conn.commit()
        logger.info(f"Processing complete for file {file_id}")

    except Exception as e:
        logger.error(f"Processing failed for file {file_id}: {e}")
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
