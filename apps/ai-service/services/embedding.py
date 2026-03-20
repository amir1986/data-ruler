"""Embedding service - text chunking and embedding generation."""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_CHUNK_SIZE = 512  # tokens (approximate via char count)
DEFAULT_CHUNK_OVERLAP = 64


class EmbeddingService:
    """Chunks text and generates embeddings via Ollama."""

    def __init__(
        self,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    ) -> None:
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    # ------------------------------------------------------------------
    # Chunking
    # ------------------------------------------------------------------

    def chunk_text(
        self,
        text: str,
        chunk_size: int | None = None,
        chunk_overlap: int | None = None,
    ) -> list[dict[str, Any]]:
        """Split text into overlapping chunks, preferring paragraph boundaries.

        Returns a list of ``{"text": ..., "index": ..., "start_char": ..., "end_char": ...}``.
        """
        size = chunk_size or self.chunk_size
        overlap = chunk_overlap or self.chunk_overlap

        # Split by paragraphs first
        paragraphs = re.split(r"\n\s*\n", text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]

        chunks: list[dict[str, Any]] = []
        current_chunk: list[str] = []
        current_length = 0
        char_offset = 0

        for para in paragraphs:
            para_len = len(para)

            # If a single paragraph exceeds chunk size, split by sentences
            if para_len > size:
                if current_chunk:
                    chunk_text = "\n\n".join(current_chunk)
                    chunks.append({
                        "text": chunk_text,
                        "index": len(chunks),
                        "start_char": char_offset - len(chunk_text),
                        "end_char": char_offset,
                    })
                    current_chunk = []
                    current_length = 0

                # Split long paragraph by sentences
                sentence_chunks = self._split_long_text(para, size, overlap)
                for sc in sentence_chunks:
                    chunks.append({
                        "text": sc,
                        "index": len(chunks),
                        "start_char": char_offset,
                        "end_char": char_offset + len(sc),
                    })
                char_offset += para_len
                continue

            if current_length + para_len > size and current_chunk:
                chunk_text = "\n\n".join(current_chunk)
                chunks.append({
                    "text": chunk_text,
                    "index": len(chunks),
                    "start_char": char_offset - current_length,
                    "end_char": char_offset,
                })

                # Keep overlap paragraphs
                overlap_text = ""
                overlap_paras: list[str] = []
                for p in reversed(current_chunk):
                    if len(overlap_text) + len(p) <= overlap:
                        overlap_paras.insert(0, p)
                        overlap_text = "\n\n".join(overlap_paras)
                    else:
                        break

                current_chunk = overlap_paras
                current_length = len(overlap_text)

            current_chunk.append(para)
            current_length += para_len
            char_offset += para_len

        # Final chunk
        if current_chunk:
            chunk_text = "\n\n".join(current_chunk)
            chunks.append({
                "text": chunk_text,
                "index": len(chunks),
                "start_char": char_offset - current_length,
                "end_char": char_offset,
            })

        return chunks

    @staticmethod
    def _split_long_text(text: str, size: int, overlap: int) -> list[str]:
        """Split a long text by sentences into size-limited chunks."""
        sentences = re.split(r"(?<=[.!?])\s+", text)
        chunks: list[str] = []
        current: list[str] = []
        current_len = 0

        for sentence in sentences:
            sent_len = len(sentence)
            if current_len + sent_len > size and current:
                chunks.append(" ".join(current))
                # Overlap: keep last few sentences
                overlap_sents: list[str] = []
                overlap_len = 0
                for s in reversed(current):
                    if overlap_len + len(s) <= overlap:
                        overlap_sents.insert(0, s)
                        overlap_len += len(s)
                    else:
                        break
                current = overlap_sents
                current_len = overlap_len

            current.append(sentence)
            current_len += sent_len

        if current:
            chunks.append(" ".join(current))

        return chunks

    # ------------------------------------------------------------------
    # Embedding generation
    # ------------------------------------------------------------------

    async def embed_text(self, text: str) -> list[float]:
        """Generate an embedding for a single text string."""
        from services.ollama_client import OllamaClient

        client = OllamaClient()
        return await client.embed(text)

    async def embed_chunks(
        self, chunks: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Generate embeddings for a list of text chunks.

        Adds an ``embedding`` key to each chunk dict.
        """
        from services.ollama_client import OllamaClient

        client = OllamaClient()
        texts = [c["text"] for c in chunks]
        embeddings = await client.embed_batch(texts)

        for chunk, embedding in zip(chunks, embeddings):
            chunk["embedding"] = embedding

        return chunks

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of plain text strings."""
        from services.ollama_client import OllamaClient

        client = OllamaClient()
        return await client.embed_batch(texts)
