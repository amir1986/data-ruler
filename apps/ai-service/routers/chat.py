"""Chat router - handles AI chat via agent orchestration pipeline."""

import asyncio
import json
import logging
import os
import sqlite3
from typing import AsyncIterator
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from models.schemas import AgentMessage, AgentMessageType, Priority
from services.ollama_client import chat_completion_stream

logger = logging.getLogger(__name__)
router = APIRouter()

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")


class ChatRequest(BaseModel):
    message: str
    user_id: str
    context_file_id: str | None = None
    context_dashboard_id: str | None = None
    context_id: str | None = None
    locale: str = "en"
    conversation_history: list[dict] = []


def get_user_schema_context(user_id: str, file_id: str | None = None) -> str:
    """Get schema context for the user's data."""
    catalog_db = os.path.join(DATABASE_PATH, "catalog.db")
    if not os.path.exists(catalog_db):
        return "No data available."

    conn = sqlite3.connect(catalog_db)
    conn.row_factory = sqlite3.Row
    try:
        if file_id:
            rows = conn.execute(
                """SELECT original_name, db_table_name, schema_snapshot, row_count, file_type
                   FROM files WHERE user_id = ? AND id = ? AND processing_status = 'ready'""",
                (user_id, file_id)
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT original_name, db_table_name, schema_snapshot, row_count, file_type
                   FROM files WHERE user_id = ? AND processing_status = 'ready'
                   ORDER BY created_at DESC LIMIT 10""",
                (user_id,)
            ).fetchall()

        if not rows:
            return "No processed data files available."

        context_parts = []
        for row in rows:
            schema = row["schema_snapshot"]
            cols_info = ""
            if schema:
                try:
                    parsed = json.loads(schema)
                    if isinstance(parsed, list):
                        cols_info = ", ".join(
                            f"{c.get('name', 'unknown')} ({c.get('inferred_type', 'text')})"
                            for c in parsed[:20]
                        )
                except (json.JSONDecodeError, TypeError):
                    cols_info = str(schema)[:200]

            context_parts.append(
                f"Table: {row['db_table_name']} (from {row['original_name']}, "
                f"{row['row_count'] or '?'} rows, type: {row['file_type']})\n"
                f"  Columns: {cols_info}"
            )

        return "\n\n".join(context_parts)
    finally:
        conn.close()


@router.post("/chat")
async def chat(req: ChatRequest, request: Request):
    """Handle chat by routing through the agent orchestration pipeline.

    The orchestrator determines the user's intent (data query, visualization,
    general chat, etc.) and dispatches to the appropriate specialist agents.
    For general chat, falls back to direct LLM streaming for low latency.
    """
    registry = request.app.state.agent_registry
    schema_context = await asyncio.to_thread(
        get_user_schema_context, req.user_id, req.context_file_id,
    )

    # Try routing through the orchestrator for structured intents
    orchestrator = registry.get("orchestrator")
    if orchestrator:
        message = AgentMessage(
            message_id=uuid4(),
            correlation_id=uuid4(),
            message_type=AgentMessageType.REQUEST,
            source_agent="chat_api",
            target_agent="orchestrator",
            priority=Priority.HIGH,
            payload={
                "message": req.message,
                "user_id": req.user_id,
                "file_id": req.context_file_id,
                "schema_context": schema_context,
                "context_id": req.context_id,
                "locale": req.locale,
                "conversation_history": req.conversation_history,
            },
        )

        response = await registry.dispatch(message)
        if response and response.payload.get("response"):
            # Stream the synthesized response back as SSE
            async def stream_orchestrated():
                content = response.payload["response"]
                # Send as a single chunk with full metadata
                yield f"data: {json.dumps({'content': content, 'intent': response.payload.get('intent'), 'context_id': response.payload.get('context_id')})}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(
                stream_orchestrated(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
            )

    # Fallback: direct LLM streaming for general chat
    async def stream_fallback():
        messages = []
        for h in req.conversation_history[-10:]:
            messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
        messages.append({"role": "user", "content": req.message})

        lang_instruction = ""
        if req.locale == "he":
            lang_instruction = "\nIMPORTANT: Always respond in Hebrew (עברית). All text must be in Hebrew.\n"

        system_prompt = (
            f"You are an AI data assistant for DataRuler, a data analytics platform.\n"
            f"You help users understand their data, suggest analyses, and answer questions.\n\n"
            f"User's available data:\n{schema_context}\n\n"
            f"Be helpful, concise, and data-focused.{lang_instruction}"
        )

        async for chunk in chat_completion_stream(messages, system=system_prompt):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_fallback(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
