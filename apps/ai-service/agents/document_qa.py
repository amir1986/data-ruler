"""Document Q&A Agent - RAG-based question answering over documents."""

from __future__ import annotations

import logging
from typing import Any

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class DocumentQAAgent(AgentBase):
    """Answers questions over documents using retrieval-augmented generation."""

    def __init__(self) -> None:
        super().__init__(
            agent_name="document_qa",
            description="Performs RAG-based Q&A: query analysis, semantic retrieval from ChromaDB, and answer synthesis via Ollama.",
        )

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Answer a question using RAG pipeline."""
        payload = message.payload
        question = payload.get("question", payload.get("message", ""))
        collection_name = payload.get("collection_name", "")
        context_id = payload.get("context_id", "")
        top_k = payload.get("top_k", 5)

        if not question:
            return {"error": "No question provided"}

        # Step 1: Query analysis and expansion
        expanded_queries = await self._expand_query(question)

        # Step 2: Semantic retrieval from vector store
        retrieved_chunks = await self._retrieve(
            queries=expanded_queries,
            collection_name=collection_name or f"docs_{context_id}",
            top_k=top_k,
        )

        if not retrieved_chunks:
            return {
                "question": question,
                "answer": "I could not find relevant information in the documents to answer this question.",
                "sources": [],
                "confidence": 0.0,
            }

        # Step 3: Assemble context
        context = self._assemble_context(retrieved_chunks)

        # Step 4: Synthesize answer with citations
        answer, citations = await self._synthesize_answer(question, context, retrieved_chunks)

        return {
            "question": question,
            "expanded_queries": expanded_queries,
            "answer": answer,
            "citations": citations,
            "sources": [
                {
                    "chunk_id": chunk.get("id", ""),
                    "text_preview": chunk.get("text", "")[:200],
                    "metadata": chunk.get("metadata", {}),
                    "score": chunk.get("score", 0.0),
                }
                for chunk in retrieved_chunks
            ],
            "chunks_retrieved": len(retrieved_chunks),
        }

    async def _expand_query(self, question: str) -> list[str]:
        """Expand the query with alternative phrasings for better retrieval."""
        queries = [question]

        try:
            from services.ollama_client import OllamaClient

            client = OllamaClient()

            prompt = (
                f"Given this question: '{question}'\n"
                f"Generate 2 alternative phrasings that capture the same intent.\n"
                f"Return only the alternative questions, one per line."
            )

            response = await client.chat(
                messages=[{"role": "user", "content": prompt}],
                model="llama3",
                temperature=0.5,
            )

            content = response.get("content", "")
            for line in content.strip().split("\n"):
                line = line.strip().lstrip("0123456789.-) ")
                if line and line != question:
                    queries.append(line)
        except Exception as exc:
            self.logger.debug("Query expansion failed: %s", exc)

        return queries[:3]

    async def _retrieve(
        self, queries: list[str], collection_name: str, top_k: int
    ) -> list[dict[str, Any]]:
        """Retrieve relevant chunks from the vector store."""
        try:
            from services.rag import RAGService

            rag = RAGService()
            all_chunks: list[dict[str, Any]] = []
            seen_ids: set[str] = set()

            for query in queries:
                chunks = await rag.search(
                    collection_name=collection_name,
                    query=query,
                    top_k=top_k,
                )
                for chunk in chunks:
                    chunk_id = chunk.get("id", "")
                    if chunk_id not in seen_ids:
                        seen_ids.add(chunk_id)
                        all_chunks.append(chunk)

            # Sort by relevance score and take top_k
            all_chunks.sort(key=lambda c: c.get("score", 0), reverse=True)
            return all_chunks[:top_k]
        except Exception as exc:
            self.logger.error("Retrieval failed: %s", exc)
            return []

    @staticmethod
    def _assemble_context(chunks: list[dict[str, Any]]) -> str:
        """Assemble retrieved chunks into a context string."""
        context_parts: list[str] = []
        for i, chunk in enumerate(chunks):
            text = chunk.get("text", "")
            source = chunk.get("metadata", {}).get("file_path", f"Source {i + 1}")
            context_parts.append(f"[Source {i + 1}: {source}]\n{text}")
        return "\n\n---\n\n".join(context_parts)

    async def _synthesize_answer(
        self, question: str, context: str, chunks: list[dict[str, Any]]
    ) -> tuple[str, list[dict[str, str]]]:
        """Synthesize an answer from the context using Ollama."""
        try:
            from services.ollama_client import OllamaClient

            client = OllamaClient()

            prompt = (
                f"Answer the following question based ONLY on the provided context. "
                f"If the context does not contain enough information, say so.\n"
                f"Include citations like [Source 1], [Source 2] when referencing information.\n\n"
                f"Context:\n{context}\n\n"
                f"Question: {question}\n\n"
                f"Answer:"
            )

            response = await client.chat(
                messages=[{"role": "user", "content": prompt}],
                model="llama3",
                temperature=0.3,
            )

            answer = response.get("content", "Failed to generate answer.")

            # Extract citations from the answer
            citations: list[dict[str, str]] = []
            import re

            cited_sources = set(re.findall(r"\[Source (\d+)\]", answer))
            for src_num in cited_sources:
                idx = int(src_num) - 1
                if 0 <= idx < len(chunks):
                    citations.append({
                        "source_number": src_num,
                        "file_path": chunks[idx].get("metadata", {}).get("file_path", ""),
                        "text_preview": chunks[idx].get("text", "")[:100],
                    })

            return answer, citations
        except Exception as exc:
            self.logger.error("Answer synthesis failed: %s", exc)
            return f"Answer generation failed: {exc}", []
