"""Cross-Modal Agent - queries spanning multiple data sources via cloud LLM."""

from __future__ import annotations

import json
import logging
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage
from services.ollama_client import chat_completion

logger = logging.getLogger(__name__)


class CrossModalAgent(AgentBase):
    """Handles queries that span multiple data sources and formats."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="cross_modal",
            description="Cross-format queries spanning documents, tables, and databases.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        question = payload.get("message", "")
        schema_context = payload.get("schema_context", "")
        document_context = payload.get("document_context", "")

        answer = await chat_completion(
            messages=[{"role": "user", "content": (
                f"Question: {question}\n\n"
                f"Available data:\n{schema_context}\n\n"
                f"Document context:\n{document_context[:2000]}"
            )}],
            system="You are a cross-modal data assistant. Synthesize information from multiple data sources to answer questions comprehensively.",
            temperature=0.5,
            max_tokens=1500,
        )
        return {"answer": answer, "status": "success"}
