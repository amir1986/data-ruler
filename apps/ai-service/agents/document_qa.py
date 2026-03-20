"""Document Q&A Agent - RAG-based question answering over documents via cloud LLM."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage
from services.ollama_client import chat_completion, generate_embedding

logger = logging.getLogger(__name__)

QA_SYSTEM = """You are a helpful data assistant for the Data Ruler platform.
Answer questions based on the provided context. If the context doesn't contain
enough information, say so honestly. Use markdown formatting.

When discussing data:
- Reference specific column names and values
- Suggest SQL queries when appropriate
- Recommend visualizations for data insights
- Be precise about numbers and statistics"""


class DocumentQAAgent(AgentBase):
    """RAG-based Q&A over documents and data using cloud LLM + embeddings."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="document_qa",
            description="Answers questions about documents and data using RAG with cloud LLM and embeddings.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        question = payload.get("message", payload.get("question", ""))
        schema_context = payload.get("schema_context", "")
        document_context = payload.get("document_context", "")
        conversation_history = payload.get("conversation_history", [])

        if not question:
            return {"error": "No question provided"}

        # Build context from available sources
        context_parts = []
        if schema_context:
            context_parts.append(f"Available data tables:\n{schema_context}")
        if document_context:
            context_parts.append(f"Document content:\n{document_context}")

        full_context = "\n\n".join(context_parts) if context_parts else "No specific data context available."

        # Build conversation
        messages = []
        for h in conversation_history[-10:]:
            messages.append({
                "role": h.get("role", "user"),
                "content": h.get("content", ""),
            })
        messages.append({
            "role": "user",
            "content": f"Context:\n{full_context}\n\nQuestion: {question}",
        })

        try:
            answer = await chat_completion(
                messages=messages,
                system=QA_SYSTEM,
                temperature=0.5,
                max_tokens=1500,
                model_tier="chat",
            )
            return {
                "answer": answer,
                "question": question,
                "context_used": bool(context_parts),
                "status": "success",
            }
        except Exception as exc:
            return {
                "error": str(exc),
                "question": question,
                "status": "error",
            }
