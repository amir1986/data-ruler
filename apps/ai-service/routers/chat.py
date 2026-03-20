"""Chat router - handles AI chat with streaming responses."""

import os
import json
import logging
import sqlite3
from typing import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.ollama_client import chat_completion_stream, chat_completion, CODE_MODEL, DEFAULT_MODEL

logger = logging.getLogger(__name__)
router = APIRouter()

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")


class ChatRequest(BaseModel):
    message: str
    user_id: str
    context_file_id: str | None = None
    context_dashboard_id: str | None = None
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


def detect_query_intent(message: str) -> str:
    """Detect if the message is a data query, general question, or dashboard request."""
    lower = message.lower()
    data_keywords = [
        "show", "count", "average", "sum", "total", "top", "bottom",
        "group by", "filter", "where", "select", "compare", "trend",
        "how many", "what is the", "list all", "find", "maximum", "minimum",
        "distribution", "correlation", "between", "per", "by",
    ]
    chart_keywords = ["chart", "graph", "plot", "visualize", "dashboard", "bar chart", "pie chart"]

    if any(kw in lower for kw in chart_keywords):
        return "visualization"
    if any(kw in lower for kw in data_keywords):
        return "data_query"
    return "general"


async def handle_data_query(
    message: str, user_id: str, schema_context: str, history: list[dict]
) -> AsyncIterator[str]:
    """Handle data-related queries by generating and executing SQL."""
    # Step 1: Generate SQL using Ollama
    sql_prompt = [
        {
            "role": "system",
            "content": f"""You are a SQL expert for a data analytics platform. Generate SQLite SQL queries.

Available tables and schemas:
{schema_context}

Rules:
1. Only generate SELECT queries - never INSERT, UPDATE, DELETE, DROP, or ALTER.
2. Use SQLite SQL dialect.
3. Limit results to 100 rows unless user asks for more.
4. Handle NULLs with COALESCE or IS NOT NULL.
5. Alias computed columns with readable names.
6. Return ONLY the SQL query, no explanation. Put SQL between ```sql and ``` markers."""
        }
    ]
    for h in history[-5:]:
        sql_prompt.append({"role": h.get("role", "user"), "content": h.get("content", "")})
    sql_prompt.append({"role": "user", "content": message})

    sql_response = await chat_completion(sql_prompt, model=CODE_MODEL, temperature=0.1)

    # Extract SQL from response
    sql_query = ""
    if "```sql" in sql_response:
        sql_query = sql_response.split("```sql")[1].split("```")[0].strip()
    elif "```" in sql_response:
        sql_query = sql_response.split("```")[1].split("```")[0].strip()
    else:
        sql_query = sql_response.strip()

    # Validate: must be SELECT only
    sql_upper = sql_query.upper().strip()
    if not sql_upper.startswith("SELECT"):
        yield f"data: {json.dumps({'content': 'I can only run SELECT queries for safety. Let me rephrase...'})}\n\n"
        return

    # Execute the query
    user_db_path = os.path.join(DATABASE_PATH, user_id, "user_data.db")
    if not os.path.exists(user_db_path):
        yield f"data: {json.dumps({'content': 'No data database found. Please upload some data files first.'})}\n\n"
        return

    try:
        conn = sqlite3.connect(user_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(sql_query)
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = [dict(row) for row in cursor.fetchmany(100)]
        conn.close()

        # Format results
        result_text = f"**Query:** `{sql_query}`\n\n"
        if rows:
            result_text += f"**Results** ({len(rows)} rows):\n\n"
            # Simple table format
            result_text += "| " + " | ".join(columns) + " |\n"
            result_text += "| " + " | ".join(["---"] * len(columns)) + " |\n"
            for row in rows[:20]:
                result_text += "| " + " | ".join(str(row.get(c, ""))[:30] for c in columns) + " |\n"
            if len(rows) > 20:
                result_text += f"\n*...and {len(rows) - 20} more rows*\n"
        else:
            result_text += "No results found.\n"

        yield f"data: {json.dumps({'content': result_text})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'content': f'Query error: {str(e)}. SQL: `{sql_query}`'})}\n\n"


async def handle_general_chat(
    message: str, schema_context: str, history: list[dict]
) -> AsyncIterator[str]:
    """Handle general chat messages."""
    messages = [
        {
            "role": "system",
            "content": f"""You are an AI data assistant for a data analytics platform called DataRuler.
You help users understand their data, suggest analyses, and answer questions.

User's available data:
{schema_context}

Be helpful, concise, and data-focused. If the user asks about their data,
reference the available tables and suggest specific queries they could run."""
        }
    ]
    for h in history[-10:]:
        messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
    messages.append({"role": "user", "content": message})

    async for chunk in chat_completion_stream(messages, model=DEFAULT_MODEL):
        yield f"data: {json.dumps({'content': chunk})}\n\n"


@router.post("/chat")
async def chat(req: ChatRequest):
    """Handle chat message with AI agent orchestration."""
    schema_context = get_user_schema_context(req.user_id, req.context_file_id)
    intent = detect_query_intent(req.message)

    async def generate():
        if intent == "data_query":
            async for chunk in handle_data_query(
                req.message, req.user_id, schema_context, req.conversation_history
            ):
                yield chunk
        else:
            async for chunk in handle_general_chat(
                req.message, schema_context, req.conversation_history
            ):
                yield chunk
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
