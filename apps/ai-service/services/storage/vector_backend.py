"""ChromaDB vector storage backend for document embeddings."""

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

VECTOR_PATH = os.getenv("VECTOR_PATH", "./data/vectors")

_client = None


def get_client():
    """Get or create the ChromaDB client."""
    global _client
    if _client is None:
        try:
            import chromadb
            os.makedirs(VECTOR_PATH, exist_ok=True)
            _client = chromadb.PersistentClient(path=VECTOR_PATH)
        except Exception as e:
            logger.error(f"ChromaDB init failed: {e}")
            return None
    return _client


def get_collection(user_id: str, collection_name: str = "documents"):
    """Get or create a collection for a user."""
    client = get_client()
    if not client:
        return None
    name = f"{user_id}_{collection_name}"
    return client.get_or_create_collection(name=name)


def add_documents(
    user_id: str,
    documents: list[str],
    metadatas: list[dict[str, Any]],
    ids: list[str],
    embeddings: list[list[float]] | None = None,
) -> bool:
    """Add documents to the vector store."""
    try:
        collection = get_collection(user_id)
        if not collection:
            return False

        kwargs: dict[str, Any] = {
            "documents": documents,
            "metadatas": metadatas,
            "ids": ids,
        }
        if embeddings:
            kwargs["embeddings"] = embeddings

        collection.add(**kwargs)
        return True
    except Exception as e:
        logger.error(f"Add documents failed: {e}")
        return False


def search(
    user_id: str,
    query_text: str,
    n_results: int = 5,
    query_embedding: list[float] | None = None,
) -> list[dict[str, Any]]:
    """Search for similar documents."""
    try:
        collection = get_collection(user_id)
        if not collection:
            return []

        kwargs: dict[str, Any] = {"n_results": n_results}
        if query_embedding:
            kwargs["query_embeddings"] = [query_embedding]
        else:
            kwargs["query_texts"] = [query_text]

        results = collection.query(**kwargs)

        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        return [
            {
                "text": doc,
                "metadata": meta,
                "distance": dist,
            }
            for doc, meta, dist in zip(documents, metadatas, distances)
        ]
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return []


def delete_file_documents(user_id: str, file_id: str) -> bool:
    """Delete all documents associated with a file."""
    try:
        collection = get_collection(user_id)
        if not collection:
            return False
        collection.delete(where={"file_id": file_id})
        return True
    except Exception as e:
        logger.error(f"Delete documents failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Class-based wrapper (used by agents)
# ---------------------------------------------------------------------------

class VectorBackend:
    """Async-compatible ChromaDB vector backend wrapper used by agents."""

    def __init__(self) -> None:
        self._client = get_client()

    async def index_document(
        self,
        collection_name: str,
        text: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Index a document by chunking and storing in ChromaDB.

        Returns a document ID.
        """
        from services.embedding import EmbeddingService
        from uuid import uuid4

        embedding_service = EmbeddingService()
        chunks = embedding_service.chunk_text(text)
        if not chunks:
            return ""

        chunks_with_emb = await embedding_service.embed_chunks(chunks)
        doc_id = str(uuid4())

        if self._client is None:
            raise RuntimeError("ChromaDB client not initialized")

        collection = self._client.get_or_create_collection(name=collection_name)

        ids = []
        documents = []
        embeddings = []
        metadatas = []

        for chunk in chunks_with_emb:
            chunk_id = f"{doc_id}_{chunk['index']}"
            ids.append(chunk_id)
            documents.append(chunk["text"])
            embeddings.append(chunk["embedding"])
            meta = {"doc_id": doc_id, "chunk_index": chunk["index"]}
            if metadata:
                meta.update({k: str(v) for k, v in metadata.items()})
            metadatas.append(meta)

        collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas,
        )
        return doc_id

    async def search(
        self,
        collection_name: str,
        query: str,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Semantic search in a collection."""
        from services.embedding import EmbeddingService

        if self._client is None:
            return []

        embedding_service = EmbeddingService()
        query_emb = await embedding_service.embed_text(query)
        if not query_emb:
            return []

        collection = self._client.get_or_create_collection(name=collection_name)
        results = collection.query(
            query_embeddings=[query_emb],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

        formatted = []
        ids = results.get("ids", [[]])[0]
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]

        for i in range(len(ids)):
            score = max(0, 1 - (dists[i] if i < len(dists) else 0))
            formatted.append({
                "id": ids[i],
                "text": docs[i] if i < len(docs) else "",
                "metadata": metas[i] if i < len(metas) else {},
                "score": round(score, 4),
            })
        return formatted
