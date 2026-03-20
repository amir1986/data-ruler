"""SQL Agent - natural language to SQL with cloud LLM + execution engine."""

from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage
from services.ollama_client import chat_completion

logger = logging.getLogger(__name__)

DATABASE_PATH = os.getenv("DATABASE_PATH", "./data/databases")

DANGEROUS_PATTERNS = [
    r"\bDROP\b", r"\bDELETE\b", r"\bTRUNCATE\b", r"\bALTER\b",
    r"\bINSERT\b", r"\bUPDATE\b", r"\bCREATE\b", r"\bGRANT\b",
    r"\bREVOKE\b", r"\bEXEC\b", r"\bEXECUTE\b",
    r"--", r";.*\b(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER)\b",
]

SQL_SYSTEM_PROMPT = """You are a SQL expert for a data analytics platform. Generate SQLite SQL queries.

Rules:
1. ONLY generate SELECT queries — never INSERT, UPDATE, DELETE, DROP, or ALTER.
2. Use SQLite SQL dialect.
3. Always LIMIT results to 100 rows unless the user explicitly asks for more.
4. Handle NULLs with COALESCE or IS NOT NULL.
5. Alias computed columns with readable names.
6. Use double quotes for column/table names that might have special characters.
7. Return ONLY the SQL query inside ```sql ... ``` markers. No explanations outside the markers."""


class SQLAgent(AgentBase):
    """Converts natural language to SQL, validates, executes, and returns results."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="sql_agent",
            description="Converts natural language to SQL queries using cloud LLM, validates for safety, executes against user databases, and returns formatted results.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        user_message = payload.get("message", "")
        user_id = payload.get("user_id", "")
        schema_context = payload.get("schema_context", "")

        if not user_message:
            return {"error": "No query message provided"}

        # Step 1: Generate SQL via cloud LLM
        sql_query = await self._generate_sql(user_message, schema_context)
        if not sql_query:
            return {"error": "Failed to generate SQL query"}

        # Step 2: Validate SQL safety
        validation = self._validate_sql(sql_query)
        if not validation["safe"]:
            return {
                "error": f"Unsafe SQL rejected: {validation['reason']}",
                "generated_sql": sql_query,
            }

        # Step 3: Execute query
        if not user_id:
            return {
                "sql": sql_query,
                "status": "generated",
                "message": "SQL generated but no user_id provided for execution",
            }

        result = await self._execute_sql(sql_query, user_id)
        result["sql"] = sql_query
        return result

    async def _generate_sql(self, user_message: str, schema_context: str) -> str:
        """Generate SQL from natural language using cloud LLM."""
        prompt = SQL_SYSTEM_PROMPT
        if schema_context:
            prompt += f"\n\nAvailable tables and schemas:\n{schema_context}"

        response = await chat_completion(
            messages=[{"role": "user", "content": user_message}],
            system=prompt,
            temperature=0.1,
            max_tokens=512,
            model_tier="code",
        )

        # Extract SQL from response
        if "```sql" in response:
            return response.split("```sql")[1].split("```")[0].strip()
        elif "```" in response:
            return response.split("```")[1].split("```")[0].strip()
        return response.strip()

    def _validate_sql(self, sql: str) -> dict[str, Any]:
        """Validate SQL for safety (only SELECT allowed)."""
        upper = sql.upper().strip()
        if not upper.startswith("SELECT"):
            return {"safe": False, "reason": "Only SELECT queries are allowed"}

        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, upper):
                return {"safe": False, "reason": f"Dangerous pattern detected: {pattern}"}

        return {"safe": True}

    async def _execute_sql(self, sql: str, user_id: str) -> dict[str, Any]:
        """Execute SQL against user's database."""
        user_db_path = os.path.join(DATABASE_PATH, user_id, "user_data.db")
        if not os.path.exists(user_db_path):
            return {
                "status": "error",
                "error": "No data database found. Upload some data files first.",
            }

        try:
            conn = sqlite3.connect(user_db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(sql)
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            rows = [dict(row) for row in cursor.fetchmany(200)]
            conn.close()

            return {
                "status": "success",
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
            }
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
