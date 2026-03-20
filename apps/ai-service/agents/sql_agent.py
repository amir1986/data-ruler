"""SQL Agent - natural language to SQL query generation and execution."""

from __future__ import annotations

import logging
import re
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)

# SQL validation patterns
DANGEROUS_PATTERNS = [
    r"\bDROP\b",
    r"\bDELETE\b",
    r"\bTRUNCATE\b",
    r"\bALTER\b",
    r"\bINSERT\b",
    r"\bUPDATE\b",
    r"\bCREATE\b",
    r"\bGRANT\b",
    r"\bREVOKE\b",
    r"\bEXEC\b",
    r"\bEXECUTE\b",
    r"--",
    r";.*\b(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER)\b",
]


class SQLAgent(AgentBase):
    """Converts natural language questions to SQL, validates, and executes them."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="sql_agent",
            description="Generates SQL from natural language, validates for safety, executes against storage backends.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Process a natural language query and return SQL results."""
        payload = message.payload
        question = payload.get("question", payload.get("message", ""))
        schema_context = payload.get("schema_context", {})
        backend = payload.get("backend", "sqlite")
        raw_sql = payload.get("sql")  # Optional: pre-written SQL

        if not question and not raw_sql:
            return {"error": "No question or SQL provided"}

        # If raw SQL is provided, validate and execute
        if raw_sql:
            validation = self._validate_sql(raw_sql)
            if not validation["is_safe"]:
                return {"error": f"SQL validation failed: {validation['reason']}"}

            results = await self._execute_sql(raw_sql, backend, payload.get("parameters", {}))
            return {
                "sql": raw_sql,
                "validation": validation,
                "results": results,
            }

        # Generate SQL from natural language
        generated_sql = await self._generate_sql(question, schema_context)
        if not generated_sql:
            return {"error": "Failed to generate SQL from question"}

        # Validate generated SQL
        validation = self._validate_sql(generated_sql)
        if not validation["is_safe"]:
            return {
                "error": "Generated SQL failed safety validation",
                "generated_sql": generated_sql,
                "validation": validation,
            }

        # Execute
        results = await self._execute_sql(generated_sql, backend)

        # Generate explanation
        explanation = await self._generate_explanation(question, generated_sql, results)

        return {
            "question": question,
            "sql": generated_sql,
            "validation": validation,
            "results": results,
            "explanation": explanation,
        }

    async def _generate_sql(
        self, question: str, schema_context: dict[str, Any]
    ) -> str | None:
        """Use Ollama to generate SQL from a natural language question."""
        try:
            from services.ollama_client import OllamaClient

            client = OllamaClient()

            # Build schema description
            schema_desc = self._format_schema_context(schema_context)

            prompt = (
                f"Given the following database schema:\n\n{schema_desc}\n\n"
                f"Write a SQL SELECT query to answer this question: {question}\n\n"
                f"Rules:\n"
                f"- Only write SELECT queries (read-only)\n"
                f"- Use standard SQL syntax\n"
                f"- Include a LIMIT clause if the result could be large\n"
                f"- Return ONLY the SQL query, no explanation\n"
            )

            response = await client.chat(
                messages=[{"role": "user", "content": prompt}],
                model="llama3",
                temperature=0.1,
            )

            sql = response.get("content", "").strip()

            # Clean up: extract SQL from markdown code blocks if present
            sql = self._extract_sql_from_response(sql)

            return sql if sql else None
        except Exception as exc:
            self.logger.error("SQL generation failed: %s", exc)
            return None

    @staticmethod
    def _validate_sql(sql: str) -> dict[str, Any]:
        """Validate SQL for safety (read-only, no injection)."""
        result: dict[str, Any] = {"is_safe": True, "reason": ""}

        sql_upper = sql.upper().strip()

        # Must be a SELECT statement
        if not sql_upper.startswith("SELECT") and not sql_upper.startswith("WITH"):
            result["is_safe"] = False
            result["reason"] = "Only SELECT and WITH (CTE) statements are allowed"
            return result

        # Check for dangerous patterns
        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, sql, re.IGNORECASE):
                result["is_safe"] = False
                result["reason"] = f"Dangerous SQL pattern detected: {pattern}"
                return result

        # Check for multiple statements
        statements = [s.strip() for s in sql.split(";") if s.strip()]
        if len(statements) > 1:
            result["is_safe"] = False
            result["reason"] = "Multiple SQL statements not allowed"
            return result

        result["statement_type"] = "SELECT"
        return result

    async def _execute_sql(
        self, sql: str, backend: str, parameters: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Execute SQL against the appropriate backend."""
        try:
            if backend == "sqlite":
                return await self._execute_sqlite(sql, parameters)
            elif backend == "duckdb":
                return await self._execute_duckdb(sql, parameters)
            else:
                return {"error": f"Unsupported backend: {backend}"}
        except Exception as exc:
            return {"error": str(exc)}

    async def _execute_sqlite(
        self, sql: str, parameters: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Execute SQL against SQLite."""
        from services.storage.sqlite_backend import SQLiteBackend

        backend = SQLiteBackend()
        result = await backend.execute_query(sql, parameters or {})
        return result

    async def _execute_duckdb(
        self, sql: str, parameters: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Execute SQL against DuckDB."""
        from services.storage.duckdb_backend import DuckDBBackend

        backend = DuckDBBackend()
        result = await backend.execute_query(sql, parameters or {})
        return result

    async def _generate_explanation(
        self, question: str, sql: str, results: dict[str, Any]
    ) -> str:
        """Generate a natural language explanation of the results."""
        try:
            from services.ollama_client import OllamaClient

            client = OllamaClient()

            row_count = results.get("row_count", 0)
            columns = results.get("columns", [])

            prompt = (
                f"A user asked: '{question}'\n"
                f"The SQL query '{sql}' returned {row_count} rows with columns {columns}.\n"
                f"Briefly explain what the results show in 1-2 sentences."
            )

            response = await client.chat(
                messages=[{"role": "user", "content": prompt}],
                model="llama3",
                temperature=0.3,
            )
            return response.get("content", "")
        except Exception:
            return ""

    @staticmethod
    def _format_schema_context(schema_context: dict[str, Any]) -> str:
        """Format schema information for the LLM prompt."""
        if not schema_context:
            return "No schema information available."

        parts: list[str] = []
        tables = schema_context.get("tables", [])

        for table in tables:
            table_name = table.get("name", "unknown")
            columns = table.get("columns", [])
            col_defs = ", ".join(
                f"{c.get('name', '?')} {c.get('dtype', 'TEXT')}" for c in columns
            )
            parts.append(f"TABLE {table_name} ({col_defs})")

        relationships = schema_context.get("relationships", [])
        for rel in relationships:
            parts.append(
                f"-- FK: {rel.get('from_table')}.{rel.get('from_column')} -> "
                f"{rel.get('to_table')}.{rel.get('to_column')}"
            )

        return "\n".join(parts) if parts else "No schema information available."

    @staticmethod
    def _extract_sql_from_response(text: str) -> str:
        """Extract SQL from potential markdown code blocks."""
        # Try to find SQL in code blocks
        code_block = re.search(r"```(?:sql)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if code_block:
            return code_block.group(1).strip()

        # Remove any leading/trailing explanation
        lines = text.strip().split("\n")
        sql_lines: list[str] = []
        in_sql = False

        for line in lines:
            stripped = line.strip().upper()
            if stripped.startswith(("SELECT", "WITH")):
                in_sql = True
            if in_sql:
                sql_lines.append(line)

        return "\n".join(sql_lines).strip() if sql_lines else text.strip()
