"""Master Orchestrator Agent - LLM-powered intent parsing + real agent dispatch."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, TYPE_CHECKING
from uuid import UUID, uuid4

from core.agent_base import AgentBase
from core.context_store import ContextStore, AgentContext
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
    """Coordinates all specialist agents using LLM-powered intent parsing.

    Integrates with ContextStore so that agents share workspace state
    (tables, relationships, file catalog) across a session without
    passing everything through message payloads.
    """

    # Max agents running concurrently within a single parallel group
    _MAX_PARALLEL_AGENTS = 5

    def __init__(
        self,
        registry: AgentRegistry | None = None,
        context_store: ContextStore | None = None,
    ) -> None:
        super().__init__(
            agent_name="orchestrator",
            description="Master orchestrator — LLM-powered intent parsing, execution planning, and agent coordination.",
        )
        self._agent_semaphore = asyncio.Semaphore(self._MAX_PARALLEL_AGENTS)
        self.registry = registry
        self.context_store = context_store or ContextStore()
        self.system_prompt = SYSTEM_PROMPT

    def set_registry(self, registry: AgentRegistry) -> None:
        self.registry = registry

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        user_message = payload.get("message", "")

        # Resolve or create a session context
        context_id = payload.get("context_id")
        if context_id:
            try:
                context_id = UUID(str(context_id))
            except (ValueError, TypeError):
                context_id = None
        ctx = self.context_store.get_or_create(context_id)

        # Step 1: LLM-powered intent parsing
        plan = await self._parse_intent_llm(user_message, payload, ctx)

        # Step 2: Execute plan with real agent dispatch
        results = await self._execute_plan(plan, message, ctx)

        # Step 3: Synthesize final response
        locale = payload.get("locale", "en")
        synthesis = await self._synthesize_results(
            user_message, plan, results, locale,
        )

        return {
            "intent": plan.get("intent", "unknown"),
            "confidence": plan.get("confidence", 0),
            "plan": plan.get("plan", []),
            "agent_results": results,
            "response": synthesis,
            "context_id": str(ctx.context_id),
        }

    async def _parse_intent_llm(
        self,
        user_message: str,
        payload: dict[str, Any],
        ctx: AgentContext,
    ) -> dict[str, Any]:
        """Use LLM to parse user intent and generate execution plan."""
        context_info = ""
        if payload.get("file_id"):
            context_info += f"\nUser has a file selected (ID: {payload['file_id']})"
        if payload.get("schema_context"):
            context_info += f"\nAvailable data:\n{payload['schema_context']}"

        # Enrich with session context
        if ctx.tables:
            table_names = list(ctx.tables.keys())
            context_info += f"\nTables in session: {', '.join(table_names)}"
        if ctx.relationships:
            context_info += f"\nKnown relationships: {len(ctx.relationships)}"

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
            # Validate: for chat intents, only dispatch LLM-capable agents.
            # document_processor/media_processor are for the file upload pipeline,
            # not for chat. document_qa already reads files directly from disk.
            llm_capable_agents = {
                "document_qa", "sql_agent", "analytics", "visualization",
                "cross_modal", "relationship_mining", "schema_inference",
            }
            chat_intents = {"general_chat", "ask_document"}
            intent = plan.get("intent")
            if intent in chat_intents:
                seen = set()
                cleaned_plan = []
                for step in plan.get("plan", []):
                    agent = step.get("agent", "")
                    if agent not in llm_capable_agents:
                        self.logger.warning(
                            "Removing non-LLM agent %s from %s plan",
                            agent, intent,
                        )
                        continue
                    if agent not in seen:
                        seen.add(agent)
                        cleaned_plan.append(step)
                # Ensure at least document_qa is present
                if not cleaned_plan:
                    cleaned_plan = [{"agent": "document_qa", "parallel_group": 0}]
                plan["plan"] = cleaned_plan
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
                {"agent": "file_detection", "parallel_group": 0},
                {"agent": "schema_inference", "parallel_group": 1},
                {"agent": "storage_router", "parallel_group": 2},
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
            "ask_document": [{"agent": "document_qa", "parallel_group": 0}],
            "store_data": [
                {"agent": "file_detection", "parallel_group": 0},
                {"agent": "storage_router", "parallel_group": 1},
            ],
            "profile_data": [
                {"agent": "schema_inference", "parallel_group": 0},
                {"agent": "analytics", "parallel_group": 1},
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
        self,
        plan: dict[str, Any],
        source_message: AgentMessage,
        ctx: AgentContext,
    ) -> list[dict[str, Any]]:
        """Execute the plan — parallel groups run concurrently, groups are sequential.

        Each agent receives the accumulated context from prior groups so later
        agents can build on earlier results.  Errors in one agent within a
        parallel group do not block other agents in the same group.
        """
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

        # Include session context summary so agents have shared state
        accumulated_context["_session_tables"] = list(ctx.tables.keys())
        accumulated_context["_session_relationship_count"] = len(ctx.relationships)

        for group_id in sorted(groups.keys()):
            group_steps = groups[group_id]

            if len(group_steps) == 1:
                result = await self._dispatch_to_agent(
                    group_steps[0]["agent"], accumulated_context, source_message,
                )
                all_results.append(result)
                if result.get("status") == "completed":
                    accumulated_context.update(result.get("data", {}))
                    # Persist relevant data into session context
                    self._update_session_context(ctx, result)
            else:
                # Fan-out parallel
                tasks = [
                    self._dispatch_to_agent(
                        step["agent"], accumulated_context, source_message,
                    )
                    for step in group_steps
                ]
                batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                for i, r in enumerate(batch_results):
                    if isinstance(r, Exception):
                        agent_name = group_steps[i]["agent"] if i < len(group_steps) else "unknown"
                        all_results.append({
                            "agent": agent_name,
                            "status": "error",
                            "error": str(r),
                        })
                    else:
                        all_results.append(r)
                        if r.get("status") == "completed":
                            accumulated_context.update(r.get("data", {}))
                            self._update_session_context(ctx, r)

        return all_results

    def _update_session_context(
        self, ctx: AgentContext, result: dict[str, Any]
    ) -> None:
        """Persist agent results into the session context for cross-agent sharing."""
        data = result.get("data", {})
        agent = result.get("agent", "")

        # Cache the latest result per agent
        ctx.cache_set(f"last_result:{agent}", data)

        # If the agent produced schema info, cache it
        if "columns" in data and "table_name" in data:
            ctx.cache_set(f"schema:{data['table_name']}", data["columns"])

    async def _dispatch_to_agent(
        self,
        agent_name: str,
        payload: dict[str, Any],
        source_message: AgentMessage,
    ) -> dict[str, Any]:
        """Dispatch to an agent via the registry (bounded by semaphore)."""
        async with self._agent_semaphore:
            return await self._dispatch_to_agent_inner(
                agent_name, payload, source_message,
            )

    async def _dispatch_to_agent_inner(
        self,
        agent_name: str,
        payload: dict[str, Any],
        source_message: AgentMessage,
    ) -> dict[str, Any]:
        """Inner dispatch logic."""
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
                "error": "Dispatch returned None (circuit open, budget exhausted, or timeout)",
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
        locale: str = "en",
    ) -> str:
        """Use LLM to synthesize agent results into a coherent response."""
        # Truncate results for the LLM context window
        results_summary = json.dumps(results, default=str)[:4000]

        lang_instruction = ""
        if locale == "he":
            lang_instruction = "\nIMPORTANT: Respond entirely in Hebrew (עברית). All text must be in Hebrew."

        try:
            synthesis = await chat_completion(
                messages=[{"role": "user", "content": (
                    f"User asked: {user_message}\n\n"
                    f"Intent: {plan.get('intent')}\n"
                    f"Agent results:\n{results_summary}\n\n"
                    "Synthesize these results into a clear, helpful response for the user. "
                    "If there are data tables, format them nicely. If there are errors, "
                    f"explain what went wrong and suggest alternatives.{lang_instruction}"
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
