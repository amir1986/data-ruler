"""RAG service - document indexing, semantic search, and context assembly."""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

DEFAULT_TOP_K = 5
DEFAULT_COLLECTION = "default"


class RAGService:
    """Retrieval-Augmented Generation service using ChromaDB."""

    def __init__(self) -> None:
        self._client = None

    def _get_client(self) -> Any:
        """Lazy-initialize ChromaDB client."""
        if self._client is None:
            try:
                import chromadb

                self._client = chromadb.Client()
                logger.info("ChromaDB client initialized (ephemeral)")
            except ImportError:
                raise RuntimeError("chromadb is not installed")
        return self._client

    # ------------------------------------------------------------------
    # Collection management
    # ------------------------------------------------------------------

    def get_or_create_collection(self, name: str) -> Any:
        """Get or create a ChromaDB collection."""
        client = self._get_client()
        return client.get_or_create_collection(name=name)

    def delete_collection(self, name: str) -> None:
        """Delete a ChromaDB collection."""
        client = self._get_client()
        try:
            client.delete_collection(name=name)
        except Exception as exc:
            logger.warning("Failed to delete collection %s: %s", name, exc)

    def list_collections(self) -> list[str]:
        """List all collection names."""
        client = self._get_client()
        return [c.name for c in client.list_collections()]

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------

    async def index_document(
        self,
        collection_name: str,
        text: str,
        metadata: dict[str, Any] | None = None,
        chunk_size: int = 512,
        chunk_overlap: int = 64,
    ) -> str:
        """Chunk, embed, and store a document in ChromaDB.

        Returns a document ID for the indexed content.
        """
        from services.embedding import EmbeddingService

        embedding_service = EmbeddingService(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )

        # Chunk the text
        chunks = embedding_service.chunk_text(text)
        if not chunks:
            logger.warning("No chunks generated from text")
            return ""

        # Generate embeddings
        chunks_with_embeddings = await embedding_service.embed_chunks(chunks)

        # Store in ChromaDB
        collection = self.get_or_create_collection(collection_name)
        doc_id = str(uuid4())

        ids: list[str] = []
        documents: list[str] = []
        embeddings: list[list[float]] = []
        metadatas: list[dict[str, Any]] = []

        for chunk in chunks_with_embeddings:
            chunk_id = f"{doc_id}_{chunk['index']}"
            ids.append(chunk_id)
            documents.append(chunk["text"])
            embeddings.append(chunk["embedding"])
            meta = {
                "doc_id": doc_id,
                "chunk_index": chunk["index"],
                "start_char": chunk.get("start_char", 0),
                "end_char": chunk.get("end_char", 0),
            }
            if metadata:
                meta.update({k: str(v) for k, v in metadata.items()})
            metadatas.append(meta)

        collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )

        logger.info(
            "Indexed %d chunks for document %s in collection %s",
            len(chunks), doc_id, collection_name,
        )
        return doc_id

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    async def search(
        self,
        collection_name: str,
        query: str,
        top_k: int = DEFAULT_TOP_K,
    ) -> list[dict[str, Any]]:
        """Perform semantic search against a ChromaDB collection.

        Returns a list of ``{"id", "text", "metadata", "score"}`` dicts.
        """
        from services.embedding import EmbeddingService

        embedding_service = EmbeddingService()

        try:
            collection = self.get_or_create_collection(collection_name)
        except Exception as exc:
            logger.error("Failed to access collection %s: %s", collection_name, exc)
            return []

        # Embed the query
        query_embedding = await embedding_service.embed_text(query)
        if not query_embedding:
            return []

        # Query ChromaDB
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

        # Format results
        formatted: list[dict[str, Any]] = []
        ids = results.get("ids", [[]])[0]
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        for i in range(len(ids)):
            # ChromaDB returns distances; convert to similarity score
            distance = distances[i] if i < len(distances) else 0
            score = max(0, 1 - distance)  # Simple conversion

            formatted.append({
                "id": ids[i],
                "text": documents[i] if i < len(documents) else "",
                "metadata": metadatas[i] if i < len(metadatas) else {},
                "score": round(score, 4),
            })

        return formatted

    # ------------------------------------------------------------------
    # Context assembly
    # ------------------------------------------------------------------

    def assemble_context(
        self,
        chunks: list[dict[str, Any]],
        max_tokens: int = 4096,
    ) -> str:
        """Assemble retrieved chunks into a context string for the LLM.

        Respects an approximate token limit (estimated as chars / 4).
        """
        context_parts: list[str] = []
        total_chars = 0
        max_chars = max_tokens * 4  # Rough token-to-char estimate

        for chunk in chunks:
            text = chunk.get("text", "")
            if total_chars + len(text) > max_chars:
                # Truncate the last chunk if needed
                remaining = max_chars - total_chars
                if remaining > 100:
                    context_parts.append(text[:remaining] + "...")
                break

            context_parts.append(text)
            total_chars += len(text)

        return "\n\n---\n\n".join(context_parts)
