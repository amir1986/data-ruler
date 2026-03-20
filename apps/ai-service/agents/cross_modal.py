"""Cross-Modal Synthesis Agent - combines results from multiple agent types."""

from __future__ import annotations

import logging
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class CrossModalSynthesisAgent(AgentBase):
    """Combines results from SQL, RAG, and media agents into a unified answer."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="cross_modal",
            description="Synthesizes unified answers by combining results from SQL, document QA, and media agents with source attribution.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Combine results from multiple modalities into a unified response."""
        payload = message.payload
        question = payload.get("question", payload.get("message", ""))
        sql_results = payload.get("sql_results")
        rag_results = payload.get("rag_results")
        media_results = payload.get("media_results")
        agent_results = payload.get("agent_results", [])

        sources: list[dict[str, Any]] = []
        context_parts: list[str] = []

        # Process SQL results
        if sql_results:
            sql_context = self._format_sql_results(sql_results)
            context_parts.append(f"[SQL Data]\n{sql_context}")
            sources.append({
                "type": "sql",
                "query": sql_results.get("sql", ""),
                "row_count": sql_results.get("results", {}).get("row_count", 0),
            })

        # Process RAG results
        if rag_results:
            rag_context = self._format_rag_results(rag_results)
            context_parts.append(f"[Document Context]\n{rag_context}")
            sources.append({
                "type": "document",
                "chunks": rag_results.get("chunks_retrieved", 0),
                "citations": rag_results.get("citations", []),
            })

        # Process media results
        if media_results:
            media_context = self._format_media_results(media_results)
            context_parts.append(f"[Media Information]\n{media_context}")
            sources.append({
                "type": "media",
                "media_type": media_results.get("media_type", ""),
            })

        # Process generic agent results
        for result in agent_results:
            agent_name = result.get("agent", "unknown")
            result_text = self._format_generic_result(result)
            if result_text:
                context_parts.append(f"[{agent_name}]\n{result_text}")
                sources.append({"type": agent_name})

        # Synthesize unified answer
        if question and context_parts:
            answer = await self._synthesize(question, "\n\n".join(context_parts))
        elif context_parts:
            answer = "\n\n".join(context_parts)
        else:
            answer = "No results available to synthesize."

        return {
            "question": question,
            "answer": answer,
            "sources": sources,
            "modalities_used": [s["type"] for s in sources],
        }

    async def _synthesize(self, question: str, combined_context: str) -> str:
        """Use Ollama to synthesize a unified answer from multi-modal context."""
        try:
            from services.ollama_client import OllamaClient

            client = OllamaClient()

            prompt = (
                f"You have information from multiple sources (SQL queries, documents, media metadata). "
                f"Synthesize a comprehensive answer to the user's question.\n\n"
                f"Combined context:\n{combined_context}\n\n"
                f"Question: {question}\n\n"
                f"Provide a clear, unified answer that integrates information from all sources. "
                f"Mention which sources support each claim."
            )

            response = await client.chat(
                messages=[{"role": "user", "content": prompt}],
                model="llama3",
                temperature=0.4,
            )
            return response.get("content", "Synthesis failed.")
        except Exception as exc:
            self.logger.error("Cross-modal synthesis failed: %s", exc)
            return f"Synthesis unavailable: {exc}. Raw context:\n{combined_context}"

    @staticmethod
    def _format_sql_results(sql_results: dict[str, Any]) -> str:
        """Format SQL query results as text."""
        parts: list[str] = []
        query = sql_results.get("sql", "")
        results = sql_results.get("results", {})

        if query:
            parts.append(f"Query: {query}")

        columns = results.get("columns", [])
        rows = results.get("rows", [])

        if columns and rows:
            parts.append(f"Columns: {', '.join(columns)}")
            parts.append(f"Row count: {len(rows)}")
            # Show first few rows
            for row in rows[:5]:
                if isinstance(row, dict):
                    parts.append(str(row))
                elif isinstance(row, (list, tuple)):
                    parts.append(str(dict(zip(columns, row))))

        explanation = sql_results.get("explanation", "")
        if explanation:
            parts.append(f"Explanation: {explanation}")

        return "\n".join(parts)

    @staticmethod
    def _format_rag_results(rag_results: dict[str, Any]) -> str:
        """Format RAG results as text."""
        answer = rag_results.get("answer", "")
        sources = rag_results.get("sources", [])

        parts = [answer]
        if sources:
            parts.append("\nSources:")
            for src in sources:
                parts.append(
                    f"  - {src.get('metadata', {}).get('file_path', 'Unknown')}: "
                    f"{src.get('text_preview', '')}"
                )

        return "\n".join(parts)

    @staticmethod
    def _format_media_results(media_results: dict[str, Any]) -> str:
        """Format media processing results as text."""
        parts: list[str] = []
        media_type = media_results.get("media_type", "")
        parts.append(f"Media type: {media_type}")

        if media_type == "image":
            parts.append(f"Dimensions: {media_results.get('width')}x{media_results.get('height')}")
            ocr = media_results.get("ocr", {})
            if ocr.get("text"):
                parts.append(f"OCR text: {ocr['text'][:500]}")
        elif media_type == "audio":
            duration = media_results.get("duration_seconds")
            if duration:
                parts.append(f"Duration: {duration:.1f}s")
            transcription = media_results.get("transcription", {})
            if transcription.get("text"):
                parts.append(f"Transcription: {transcription['text'][:500]}")
        elif media_type == "video":
            duration = media_results.get("duration_seconds")
            if duration:
                parts.append(f"Duration: {duration:.1f}s")

        return "\n".join(parts)

    @staticmethod
    def _format_generic_result(result: dict[str, Any]) -> str:
        """Format a generic agent result as text."""
        # Skip non-content fields
        skip_keys = {"agent", "status", "message_id"}
        content = {k: v for k, v in result.items() if k not in skip_keys and v}
        if not content:
            return ""
        return "\n".join(f"{k}: {v}" for k, v in content.items())
