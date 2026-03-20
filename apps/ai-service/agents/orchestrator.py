"""Master Orchestrator Agent - parses intent and coordinates specialist agents."""

from __future__ import annotations

import asyncio
import logging
from typing import Any
from uuid import UUID

from core.agent_base import AgentBase
from models.schemas import AgentMessage, AgentMessageType, Priority

logger = logging.getLogger(__name__)

# Intent-to-agent routing table
INTENT_AGENT_MAP: dict[str, list[str]] = {
    "process_file": ["file_detection"],
    "analyze_data": ["schema_inference", "analytics"],
    "query_data": ["sql_agent"],
    "ask_document": ["document_qa"],
    "export": ["export_agent"],
    "visualize": ["visualization"],
    "find_relationships": ["relationship_mining"],
    "store_data": ["storage_router"],
    "profile_data": ["schema_inference"],
}

SYSTEM_PROMPT = (
    "You are the Master Orchestrator for Data Ruler, an AI-powered data management "
    "platform. Your role is to:\n"
    "1. Understand the user's intent from their message.\n"
    "2. Create an execution plan as an ordered list of agent calls.\n"
    "3. Route work to the appropriate specialist agents.\n"
    "4. Handle fan-out (parallel) and fan-in (merge) patterns.\n"
    "5. Merge results from multiple agents into a coherent response.\n\n"
    "Available specialist agents: file_detection, tabular_processor, "
    "document_processor, database_importer, media_processor, archive_processor, "
    "structured_data, specialized_format, schema_inference, relationship_mining, "
    "storage_router, analytics, visualization, sql_agent, document_qa, "
    "cross_modal, export_agent, validation_security, scheduler."
)


class OrchestratorAgent(AgentBase):
    """Coordinates all specialist agents to fulfill user requests."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="orchestrator",
            description="Master orchestrator that parses user intent, creates execution plans, and coordinates specialist agents.",
        )
        self.system_prompt = SYSTEM_PROMPT

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Parse intent, build execution plan, fan-out to agents, merge results."""
        payload = message.payload
        user_message = payload.get("message", "")
        file_id = payload.get("file_id")
        context = payload.get("context", {})

        # Step 1: Parse intent
        intent = self._parse_intent(user_message, payload)
        self.logger.info("Parsed intent: %s", intent)

        # Step 2: Build execution plan
        plan = self._build_execution_plan(intent, payload)
        self.logger.info("Execution plan: %s", [step["agent"] for step in plan])

        # Step 3: Execute plan (fan-out parallel steps, sequential otherwise)
        results = await self._execute_plan(plan, message)

        # Step 4: Merge results
        merged = self._merge_results(intent, results)

        return {
            "intent": intent,
            "plan": [step["agent"] for step in plan],
            "results": merged,
        }

    def _parse_intent(self, user_message: str, payload: dict[str, Any]) -> str:
        """Determine user intent from the message and payload context."""
        msg_lower = user_message.lower()

        # Direct action from payload
        if "action" in payload:
            return payload["action"]

        # File processing triggers
        if payload.get("file_id") and not user_message:
            return "process_file"

        # Keyword-based intent detection
        intent_keywords: dict[str, list[str]] = {
            "query_data": ["query", "select", "find rows", "filter", "sql", "search data"],
            "ask_document": ["what does", "summarize", "explain", "tell me about", "document"],
            "analyze_data": ["analyze", "statistics", "profile", "describe data", "insights"],
            "visualize": ["chart", "plot", "graph", "visualize", "dashboard", "histogram"],
            "export": ["export", "download", "save as", "convert to"],
            "find_relationships": ["relationship", "foreign key", "join", "link tables", "connect"],
            "store_data": ["store", "import", "load into", "ingest"],
            "process_file": ["process", "upload", "open file", "read file"],
            "profile_data": ["profile", "quality", "missing values", "data types"],
        }

        for intent, keywords in intent_keywords.items():
            for kw in keywords:
                if kw in msg_lower:
                    return intent

        # Default: treat as a general question (route to cross-modal)
        return "ask_document"

    def _build_execution_plan(
        self, intent: str, payload: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Build an ordered execution plan based on intent."""
        plan: list[dict[str, Any]] = []

        if intent == "process_file":
            plan = [
                {"agent": "validation_security", "parallel": False, "payload": payload},
                {"agent": "file_detection", "parallel": False, "payload": payload},
                # Downstream agent determined by file_detection result
                {"agent": "_dynamic_processor", "parallel": False, "payload": payload},
                {"agent": "schema_inference", "parallel": False, "payload": payload},
                {"agent": "storage_router", "parallel": False, "payload": payload},
            ]
        elif intent == "analyze_data":
            plan = [
                {"agent": "schema_inference", "parallel": True, "payload": payload},
                {"agent": "analytics", "parallel": True, "payload": payload},
                {"agent": "visualization", "parallel": False, "payload": payload},
            ]
        elif intent == "query_data":
            plan = [
                {"agent": "sql_agent", "parallel": False, "payload": payload},
            ]
        elif intent == "ask_document":
            plan = [
                {"agent": "document_qa", "parallel": False, "payload": payload},
            ]
        elif intent == "export":
            plan = [
                {"agent": "export_agent", "parallel": False, "payload": payload},
            ]
        elif intent == "visualize":
            plan = [
                {"agent": "analytics", "parallel": False, "payload": payload},
                {"agent": "visualization", "parallel": False, "payload": payload},
            ]
        elif intent == "find_relationships":
            plan = [
                {"agent": "relationship_mining", "parallel": False, "payload": payload},
            ]
        elif intent == "store_data":
            plan = [
                {"agent": "storage_router", "parallel": False, "payload": payload},
            ]
        else:
            # Default cross-modal
            plan = [
                {"agent": "cross_modal", "parallel": False, "payload": payload},
            ]

        return plan

    async def _execute_plan(
        self, plan: list[dict[str, Any]], source_message: AgentMessage
    ) -> list[dict[str, Any]]:
        """Execute the plan steps, handling parallel fan-out where specified."""
        results: list[dict[str, Any]] = []
        parallel_batch: list[dict[str, Any]] = []

        for step in plan:
            if step["agent"] == "_dynamic_processor":
                # Resolve dynamic processor from previous detection result
                if results:
                    category = results[-1].get("category", "unknown")
                    step["agent"] = self._category_to_agent(category)

            if step.get("parallel"):
                parallel_batch.append(step)
            else:
                # Flush any pending parallel batch first
                if parallel_batch:
                    batch_results = await self._execute_parallel(
                        parallel_batch, source_message
                    )
                    results.extend(batch_results)
                    parallel_batch = []

                # Execute sequential step
                result = await self._execute_step(step, source_message)
                results.append(result)

        # Flush remaining parallel batch
        if parallel_batch:
            batch_results = await self._execute_parallel(
                parallel_batch, source_message
            )
            results.extend(batch_results)

        return results

    async def _execute_step(
        self, step: dict[str, Any], source_message: AgentMessage
    ) -> dict[str, Any]:
        """Execute a single plan step by sending a message to the target agent."""
        request = self.create_request(
            target_agent=step["agent"],
            payload=step.get("payload", {}),
            correlation_id=source_message.correlation_id,
        )
        self.logger.info("Dispatching to agent: %s", step["agent"])
        # In a full implementation, this would go through the message bus.
        # For now, return a placeholder indicating the dispatch.
        return {
            "agent": step["agent"],
            "status": "dispatched",
            "message_id": str(request.message_id),
        }

    async def _execute_parallel(
        self, steps: list[dict[str, Any]], source_message: AgentMessage
    ) -> list[dict[str, Any]]:
        """Execute multiple steps in parallel (fan-out)."""
        tasks = [self._execute_step(step, source_message) for step in steps]
        return list(await asyncio.gather(*tasks))

    def _merge_results(
        self, intent: str, results: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Merge results from multiple agent executions (fan-in)."""
        merged: dict[str, Any] = {
            "intent": intent,
            "agent_results": results,
            "agent_count": len(results),
        }

        # Extract any errors
        errors = [r for r in results if r.get("status") == "error"]
        if errors:
            merged["errors"] = errors
            merged["has_errors"] = True
        else:
            merged["has_errors"] = False

        return merged

    @staticmethod
    def _category_to_agent(category: str) -> str:
        """Map a file category to the appropriate processing agent."""
        mapping = {
            "tabular": "tabular_processor",
            "document": "document_processor",
            "database": "database_importer",
            "media": "media_processor",
            "archive": "archive_processor",
            "structured_data": "structured_data",
            "specialized": "specialized_format",
            "image": "media_processor",
            "audio": "media_processor",
            "video": "media_processor",
        }
        return mapping.get(category, "structured_data")
