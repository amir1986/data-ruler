"""Ollama API client - async wrapper for chat, embeddings, and model management."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, AsyncIterator

import httpx

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
CODE_MODEL = os.getenv("OLLAMA_CODE_MODEL", "qwen2.5-coder:7b")
EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
DEFAULT_TIMEOUT = 120.0


# ---------------------------------------------------------------------------
# Class-based client (used by agents)
# ---------------------------------------------------------------------------

class OllamaClient:
    """Async client for the Ollama REST API."""

    def __init__(
        self,
        base_url: str = OLLAMA_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # -- Health -----------------------------------------------------------

    async def health_check(self) -> dict[str, Any]:
        """Check if Ollama is reachable."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                resp.raise_for_status()
                return {"status": "ok", "models": resp.json().get("models", [])}
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    # -- Model listing ----------------------------------------------------

    async def list_models(self) -> list[dict[str, Any]]:
        """List all available models."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{self.base_url}/api/tags")
            resp.raise_for_status()
            return resp.json().get("models", [])

    # -- Chat (non-streaming) ---------------------------------------------

    async def chat(
        self,
        messages: list[dict[str, str]],
        model: str = DEFAULT_MODEL,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        system: str | None = None,
    ) -> dict[str, Any]:
        """Send a chat completion request (non-streaming).

        Parameters
        ----------
        messages:
            List of ``{"role": "user"|"assistant"|"system", "content": "..."}``.
        model:
            Ollama model name.
        temperature:
            Sampling temperature.
        max_tokens:
            Optional max generation length.
        system:
            Optional system prompt prepended to the conversation.
        """
        all_messages = list(messages)
        if system:
            all_messages = [{"role": "system", "content": system}] + all_messages

        payload: dict[str, Any] = {
            "model": model,
            "messages": all_messages,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if max_tokens is not None:
            payload["options"]["num_predict"] = max_tokens

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/api/chat",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        message = data.get("message", {})
        return {
            "content": message.get("content", ""),
            "role": message.get("role", "assistant"),
            "model": data.get("model", model),
            "total_duration": data.get("total_duration"),
            "prompt_eval_count": data.get("prompt_eval_count"),
            "eval_count": data.get("eval_count"),
        }

    # -- Chat (streaming) -------------------------------------------------

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        model: str = DEFAULT_MODEL,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        system: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream chat completion tokens."""
        all_messages = list(messages)
        if system:
            all_messages = [{"role": "system", "content": system}] + all_messages

        payload: dict[str, Any] = {
            "model": model,
            "messages": all_messages,
            "stream": True,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/api/chat",
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if data.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue

    # -- Embeddings -------------------------------------------------------

    async def embed(
        self,
        text: str,
        model: str = EMBED_MODEL,
    ) -> list[float]:
        """Generate an embedding for a single text string."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/api/embeddings",
                json={"model": model, "prompt": text},
            )
            resp.raise_for_status()
            return resp.json().get("embedding", [])

    async def embed_batch(
        self,
        texts: list[str],
        model: str = EMBED_MODEL,
    ) -> list[list[float]]:
        """Generate embeddings for a batch of texts (sequential)."""
        embeddings: list[list[float]] = []
        for text in texts:
            emb = await self.embed(text, model=model)
            embeddings.append(emb)
        return embeddings


# ---------------------------------------------------------------------------
# Module-level convenience functions (backward-compatible API)
# ---------------------------------------------------------------------------

async def health_check() -> bool:
    """Check if Ollama is reachable."""
    client = OllamaClient()
    result = await client.health_check()
    return result.get("status") == "ok"


async def list_models() -> list[str]:
    """List available model names in Ollama."""
    try:
        client = OllamaClient()
        models = await client.list_models()
        return [m["name"] for m in models]
    except Exception as exc:
        logger.error("Failed to list models: %s", exc)
        return []


async def chat_completion(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> str:
    """Non-streaming chat completion. Returns content string."""
    client = OllamaClient()
    result = await client.chat(
        messages=messages,
        model=model or DEFAULT_MODEL,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return result.get("content", "")


async def chat_completion_stream(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> AsyncIterator[str]:
    """Streaming chat completion - yields content chunks."""
    client = OllamaClient()
    async for chunk in client.chat_stream(
        messages=messages,
        model=model or DEFAULT_MODEL,
        temperature=temperature,
        max_tokens=max_tokens,
    ):
        yield chunk


async def generate_embedding(text: str, model: str | None = None) -> list[float]:
    """Generate embedding for a single text."""
    client = OllamaClient()
    return await client.embed(text, model=model or EMBED_MODEL)


async def generate_embeddings_batch(
    texts: list[str], model: str | None = None
) -> list[list[float]]:
    """Generate embeddings for a batch of texts."""
    client = OllamaClient()
    return await client.embed_batch(texts, model=model or EMBED_MODEL)
