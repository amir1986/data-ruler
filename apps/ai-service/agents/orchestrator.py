"""Master Orchestrator Agent - LLM-powered intent parsing + real agent dispatch."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, TYPE_CHECKING
from uuid import UUID, uuid4

from core.agent_base import AgentBase
from models.schemas import AgentMessage, AgentMessageType, Priority
from services.ollama_client import chat_completion, get_client

if TYPE_CHECKING:
    from core.agent_registry import AgentRegistry

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the Master Orchestrator for Data Ruler, an AI data management platform.

Given a user message and context, you must:
1. Determine the user's INTENT
2. Create an ordered EXECUTION PLAN of agent calls
3. For each step, specify what data to pass

Available agents and their capabilities:
- file_detection: Detect file types (magic bytes, extension, MIME)
- tabular_processor: Parse CSV, XLSX, Parquet, TSV, ODS into structured data
- document_processor: Extract text from PDF, DOCX, PPTX, TXT, HTML, Markdown
- database_importer: Import SQLite, DuckDB, SQL dumps
- media_processor: Handle images, audio, video — extract metadata/thumbnails
- archive_processor: Extract ZIP, TAR, GZIP, 7z archives
- structured_data: Parse JSON, XML, YAML, TOML, INI, Protocol Buffers
- specialized_format: Handle GIS (Shapefile, GeoJSON), scientific (HDF5, NetCDF)
- schema_inference: Infer column types, detect patterns, compute quality scores
- relationship_mining: Discover foreign keys, joinable columns across tables
- storage_router: Route data to SQLite, DuckDB, filesystem, or vector store
- analytics: Statistical analysis, anomaly detection, trend analysis
- visualization: Generate ECharts chart configurations
- sql_agent: Natural language to SQL query generation + execution
- document_qa: RAG-based Q&A over documents
- cross_modal: Cross-format queries spanning multiple data sources
- export_agent: Export data in various formats (CSV, JSON, XLSX, PDF)
- validation_security: Validate files for security threats, sanitize inputs

Respond ONLY with valid JSON in this exact format:
{
  "intent": "<intent_name>",
  "confidence": 0.95,
  "plan": [
    {"agent": "<agent_name>", "parallel_group": 0, "input_keys": ["key1"]},
    {"agent": "<agent_name>", "parallel_group": 1, "input_keys": ["key1"]}
  ],
  "reasoning": "<brief explanation>"
}

Steps in the same parallel_group run concurrently. Groups execute sequentially (0, then 1, etc.).
Valid intents: process_file, analyze_data, query_data, ask_document, export, visualize, find_relationships, store_data, profile_data, general_chat"""


class OrchestratorAgent(AgentBase):
    """Coordinates all specialist agents using LLM-powered intent parsing."""

    def __init__(self, registry: AgentRegistry | None = None) -> None:
        super().__init__(
            agent_name="orchestrator",
            description="Master orchestrator — LLM-powered intent parsing, execution planning, and agent coordination.",
        )
        self.registry = registry
        self.system_prompt = SYSTEM_PROMPT

    def set_registry(self, registry: AgentRegistry) -> None:
        self.registry = registry

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        user_message = payload.get("message", "")
        context = payload.get("context", {})

        # Step 1: LLM-powered intent parsing
        plan = await self._parse_intent_llm(user_message, payload)

        # Step 2: Execute plan with real agent dispatch
        results = await self._execute_plan(plan, message)

        # Step 3: Synthesize final response
        synthesis = await self._synthesize_results(
            user_message, plan, results,
        )

        return {
            "intent": plan.get("intent", "unknown"),
            "confidence": plan.get("confidence", 0),
            "plan": plan.get("plan", []),
            "agent_results": results,
            "response": synthesis,
        }

    async def _parse_intent_llm(
        self, user_message: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Use LLM to parse user intent and generate execution plan."""
        context_info = ""
        if payload.get("file_id"):
            context_info += f"\nUser has a file selected (ID: {payload['file_id']})"
        if payload.get("schema_context"):
            context_info += f"\nAvailable data:\n{payload['schema_context']}"

        prompt_messages = [
            {"role": "user", "content": (
                f"User message: {user_message}\n"
                f"Context: {context_info or 'No additional context'}\n"
                f"Action from payload: {payload.get('action', 'none')}"
            )},
        ]

        try:
            raw = await chat_completion(
                prompt_messages,
                system=self.system_prompt,
                temperature=0.1,
                max_tokens=512,
                model_tier="fast",
                json_mode=True,
            )
            plan = json.loads(raw)
            self.logger.info(
                "LLM intent: %s (confidence=%.2f)",
                plan.get("intent"), plan.get("confidence", 0),
            )
            return plan
        except (json.JSONDecodeError, Exception) as exc:
            self.logger.warning("LLM intent parsing failed: %s — using fallback", exc)
            return self._fallback_parse(user_message, payload)

    def _fallback_parse(
        self, user_message: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Keyword-based fallback when LLM parsing fails."""
        msg = user_message.lower()

        if payload.get("action"):
            intent = payload["action"]
        elif payload.get("file_id") and not user_message:
            intent = "process_file"
        elif any(kw in msg for kw in ["query", "select", "sql", "how many", "count", "average"]):
            intent = "query_data"
        elif any(kw in msg for kw in ["chart", "plot", "graph", "visualize"]):
            intent = "visualize"
        elif any(kw in msg for kw in ["analyze", "statistics", "profile", "insights"]):
            intent = "analyze_data"
        elif any(kw in msg for kw in ["export", "download", "save as"]):
            intent = "export"
        elif any(kw in msg for kw in ["relationship", "foreign key", "join"]):
            intent = "find_relationships"
        elif any(kw in msg for kw in ["upload", "process", "import"]):
            intent = "process_file"
        else:
            intent = "general_chat"

        # Map intent to agent plan
        intent_plans = {
            "process_file": [
                {"agent": "validation_security", "parallel_group": 0},
                {"agent": "file_detection", "parallel_group": 1},
                {"agent": "schema_inference", "parallel_group": 2},
                {"agent": "storage_router", "parallel_group": 3},
            ],
            "analyze_data": [
                {"agent": "schema_inference", "parallel_group": 0},
                {"agent": "analytics", "parallel_group": 0},
                {"agent": "visualization", "parallel_group": 1},
            ],
            "query_data": [{"agent": "sql_agent", "parallel_group": 0}],
            "visualize": [
                {"agent": "analytics", "parallel_group": 0},
                {"agent": "visualization", "parallel_group": 1},
            ],
            "export": [{"agent": "export_agent", "parallel_group": 0}],
            "find_relationships": [{"agent": "relationship_mining", "parallel_group": 0}],
            "process_file": [
                {"agent": "file_detection", "parallel_group": 0},
                {"agent": "storage_router", "parallel_group": 1},
            ],
            "general_chat": [{"agent": "document_qa", "parallel_group": 0}],
        }

        return {
            "intent": intent,
            "confidence": 0.6,
            "plan": intent_plans.get(intent, [{"agent": "document_qa", "parallel_group": 0}]),
            "reasoning": "Fallback keyword-based parsing",
        }

    async def _execute_plan(
        self, plan: dict[str, Any], source_message: AgentMessage,
    ) -> list[dict[str, Any]]:
        """Execute the plan — parallel groups run concurrently, groups are sequential."""
        steps = plan.get("plan", [])
        if not steps:
            return []

        # Group steps by parallel_group
        groups: dict[int, list[dict]] = {}
        for step in steps:
            g = step.get("parallel_group", 0)
            groups.setdefault(g, []).append(step)

        all_results: list[dict[str, Any]] = []
        accumulated_context = dict(source_message.payload)

        for group_id in sorted(groups.keys()):
            group_steps = groups[group_id]

            if len(group_steps) == 1:
                result = await self._dispatch_to_agent(
                    group_steps[0]["agent"], accumulated_context, source_message,
                )
                all_results.append(result)
                accumulated_context.update(result.get("data", {}))
            else:
                # Fan-out parallel
                tasks = [
                    self._dispatch_to_agent(
                        step["agent"], accumulated_context, source_message,
                    )
                    for step in group_steps
                ]
                batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                for r in batch_results:
                    if isinstance(r, Exception):
                        all_results.append({"agent": "unknown", "status": "error", "error": str(r)})
                    else:
                        all_results.append(r)
                        accumulated_context.update(r.get("data", {}))

        return all_results

    async def _dispatch_to_agent(
        self,
        agent_name: str,
        payload: dict[str, Any],
        source_message: AgentMessage,
    ) -> dict[str, Any]:
        """Dispatch to an agent via the registry (direct call)."""
        self.logger.info("Dispatching to agent: %s", agent_name)

        if not self.registry:
            return {
                "agent": agent_name,
                "status": "error",
                "error": "No registry configured",
            }

        agent = self.registry.get(agent_name)
        if not agent:
            return {
                "agent": agent_name,
                "status": "skipped",
                "error": f"Agent '{agent_name}' not registered",
            }

        request = self.create_request(
            target_agent=agent_name,
            payload=payload,
            correlation_id=source_message.correlation_id,
        )

        response = await self.registry.dispatch(request)
        if response is None:
            return {
                "agent": agent_name,
                "status": "error",
                "error": "Dispatch returned None (circuit open or budget exhausted)",
            }

        return {
            "agent": agent_name,
            "status": "completed",
            "data": response.payload,
        }

    async def _synthesize_results(
        self,
        user_message: str,
        plan: dict[str, Any],
        results: list[dict[str, Any]],
    ) -> str:
        """Use LLM to synthesize agent results into a coherent response."""
        # Truncate results for the LLM context window
        results_summary = json.dumps(results, default=str)[:4000]

        try:
            synthesis = await chat_completion(
                messages=[{"role": "user", "content": (
                    f"User asked: {user_message}\n\n"
                    f"Intent: {plan.get('intent')}\n"
                    f"Agent results:\n{results_summary}\n\n"
                    "Synthesize these results into a clear, helpful response for the user. "
                    "If there are data tables, format them nicely. If there are errors, "
                    "explain what went wrong and suggest alternatives."
                )}],
                system=(
                    "You are a helpful data assistant. Synthesize agent results into "
                    "clear, concise responses. Use markdown formatting for tables and code."
                ),
                temperature=0.5,
                max_tokens=1024,
                model_tier="fast",
            )
            return synthesis
        except Exception as exc:
            self.logger.warning("Synthesis failed: %s", exc)
            # Return raw results as fallback
            successful = [r for r in results if r.get("status") == "completed"]
            if successful:
                return f"Completed {len(successful)} agent tasks. Results available."
            return "Processing completed but synthesis unavailable."
