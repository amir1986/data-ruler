"""Multi-provider cloud inference client.

Supports free-tier cloud APIs (NO local Ollama required):
  1. Groq          – free tier, OpenAI-compatible  (GROQ_API_KEY)
  2. OpenRouter     – free models available         (OPENROUTER_API_KEY)
  3. HuggingFace    – free Inference API             (HF_API_TOKEN)
  4. Ollama Cloud   – remote Ollama instance         (OLLAMA_CLOUD_API_KEY)

The client auto-selects the first available provider based on which API key
is configured, with automatic fallback to the next provider on failure.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, AsyncIterator

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
HF_API_TOKEN = os.getenv("HF_API_TOKEN", "")
OLLAMA_CLOUD_API_KEY = os.getenv("OLLAMA_CLOUD_API_KEY", "")

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
HF_BASE_URL = "https://api-inference.huggingface.co/models"
OLLAMA_CLOUD_BASE_URL = os.getenv("OLLAMA_CLOUD_BASE_URL", "https://ollama.com/v1")

# Default models per provider (free-tier compatible)
GROQ_MODELS = {
    "chat": os.getenv("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile"),
    "code": os.getenv("GROQ_CODE_MODEL", "llama-3.3-70b-versatile"),
    "fast": os.getenv("GROQ_FAST_MODEL", "llama-3.1-8b-instant"),
}

OPENROUTER_MODELS = {
    "chat": os.getenv("OPENROUTER_CHAT_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
    "code": os.getenv("OPENROUTER_CODE_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
    "fast": os.getenv("OPENROUTER_FAST_MODEL", "meta-llama/llama-3.1-8b-instruct:free"),
}

HF_MODELS = {
    "chat": os.getenv("HF_CHAT_MODEL", "meta-llama/Llama-3.1-8B-Instruct"),
    "code": os.getenv("HF_CODE_MODEL", "meta-llama/Llama-3.1-8B-Instruct"),
    "fast": os.getenv("HF_FAST_MODEL", "meta-llama/Llama-3.1-8B-Instruct"),
    "embed": os.getenv("HF_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2"),
}

OLLAMA_CLOUD_MODELS = {
    "chat": os.getenv("OLLAMA_CLOUD_CHAT_MODEL", "gemma3:12b"),
    "code": os.getenv("OLLAMA_CLOUD_CODE_MODEL", "gemma3:12b"),
    "fast": os.getenv("OLLAMA_CLOUD_FAST_MODEL", "gemma3:12b"),
}

# Legacy env-var compat
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "")
CODE_MODEL = os.getenv("OLLAMA_CODE_MODEL", "")
EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "")

DEFAULT_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "120"))

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?\s*```$", re.DOTALL)


def _strip_code_fences(text: str) -> str:
    """Strip markdown code fences that some providers wrap around JSON responses."""
    text = text.strip()
    m = _CODE_FENCE_RE.match(text)
    return m.group(1).strip() if m else text


class Provider:
    GROQ = "groq"
    OPENROUTER = "openrouter"
    HUGGINGFACE = "huggingface"
    OLLAMA_CLOUD = "ollama_cloud"


def _detect_providers() -> list[str]:
    """Return available providers ordered by preference."""
    providers = []
    if GROQ_API_KEY:
        providers.append(Provider.GROQ)
    if OPENROUTER_API_KEY:
        providers.append(Provider.OPENROUTER)
    if HF_API_TOKEN:
        providers.append(Provider.HUGGINGFACE)
    if OLLAMA_CLOUD_API_KEY:
        providers.append(Provider.OLLAMA_CLOUD)
    return providers


# ---------------------------------------------------------------------------
# Cloud Inference Client
# ---------------------------------------------------------------------------

class CloudLLMClient:
    """Unified async client for free-tier cloud LLM providers."""

    def __init__(self, timeout: float = DEFAULT_TIMEOUT) -> None:
        self.timeout = timeout
        self.providers = _detect_providers()
        if not self.providers:
            logger.warning(
                "No cloud LLM API keys configured! Set GROQ_API_KEY, "
                "OPENROUTER_API_KEY, HF_API_TOKEN, or OLLAMA_CLOUD_API_KEY."
            )
        else:
            logger.info("Cloud LLM providers: %s", self.providers)

    def _get_config(self, provider: str, model_tier: str = "chat") -> dict[str, Any]:
        if provider == Provider.GROQ:
            return {
                "base_url": GROQ_BASE_URL,
                "api_key": GROQ_API_KEY,
                "model": GROQ_MODELS.get(model_tier, GROQ_MODELS["chat"]),
                "headers": {
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
            }
        elif provider == Provider.OPENROUTER:
            return {
                "base_url": OPENROUTER_BASE_URL,
                "api_key": OPENROUTER_API_KEY,
                "model": OPENROUTER_MODELS.get(model_tier, OPENROUTER_MODELS["chat"]),
                "headers": {
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://data-ruler.app",
                    "X-Title": "Data Ruler",
                },
            }
        elif provider == Provider.HUGGINGFACE:
            return {
                "base_url": HF_BASE_URL,
                "api_key": HF_API_TOKEN,
                "model": HF_MODELS.get(model_tier, HF_MODELS["chat"]),
                "headers": {
                    "Authorization": f"Bearer {HF_API_TOKEN}",
                    "Content-Type": "application/json",
                },
            }
        elif provider == Provider.OLLAMA_CLOUD:
            return {
                "base_url": OLLAMA_CLOUD_BASE_URL,
                "api_key": OLLAMA_CLOUD_API_KEY,
                "model": OLLAMA_CLOUD_MODELS.get(model_tier, OLLAMA_CLOUD_MODELS["chat"]),
                "headers": {
                    "Authorization": f"Bearer {OLLAMA_CLOUD_API_KEY}",
                    "Content-Type": "application/json",
                },
            }
        raise ValueError(f"Unknown provider: {provider}")

    # -- Health -----------------------------------------------------------

    async def health_check(self) -> dict[str, Any]:
        results: dict[str, Any] = {"providers": {}}
        for provider in self.providers:
            cfg = self._get_config(provider)
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    if provider in (Provider.GROQ, Provider.OPENROUTER, Provider.OLLAMA_CLOUD):
                        resp = await client.get(
                            f"{cfg['base_url']}/models",
                            headers=cfg["headers"],
                        )
                        resp.raise_for_status()
                        results["providers"][provider] = "ok"
                    elif provider == Provider.HUGGINGFACE:
                        resp = await client.get(
                            "https://huggingface.co/api/whoami-v2",
                            headers=cfg["headers"],
                        )
                        results["providers"][provider] = (
                            "ok" if resp.status_code == 200 else "limited"
                        )
            except Exception as exc:
                results["providers"][provider] = f"error: {exc}"

        results["status"] = "ok" if any(
            v == "ok" for v in results["providers"].values()
        ) else "degraded"
        return results

    # -- Chat (non-streaming) with auto-fallback --------------------------

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model_tier: str = "chat",
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        system: str | None = None,
        json_mode: bool = False,
    ) -> dict[str, Any]:
        all_messages = list(messages)
        if system:
            all_messages = [{"role": "system", "content": system}] + all_messages

        last_error: Exception | None = None
        for provider in self.providers:
            cfg = self._get_config(provider, model_tier)
            chosen_model = model or cfg["model"]
            try:
                if provider in (Provider.GROQ, Provider.OPENROUTER, Provider.OLLAMA_CLOUD):
                    return await self._chat_openai_compat(
                        cfg, all_messages, chosen_model,
                        temperature, max_tokens, json_mode,
                    )
                elif provider == Provider.HUGGINGFACE:
                    return await self._chat_huggingface(
                        cfg, all_messages, chosen_model,
                        temperature, max_tokens,
                    )
            except Exception as exc:
                last_error = exc
                logger.warning("Provider %s failed: %s", provider, exc)

        raise RuntimeError(f"All cloud providers failed. Last error: {last_error}")

    async def _chat_openai_compat(
        self, cfg: dict, messages: list, model: str,
        temperature: float, max_tokens: int, json_mode: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{cfg['base_url']}/chat/completions",
                headers=cfg["headers"],
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        usage = data.get("usage", {})
        content = message.get("content", "")
        if json_mode and content:
            content = _strip_code_fences(content)
        return {
            "content": content,
            "role": message.get("role", "assistant"),
            "model": data.get("model", model),
            "provider": cfg["base_url"],
            "prompt_tokens": usage.get("prompt_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        }

    async def _chat_huggingface(
        self, cfg: dict, messages: list, model: str,
        temperature: float, max_tokens: int,
    ) -> dict[str, Any]:
        payload = {
            "inputs": self._format_hf_messages(messages),
            "parameters": {
                "temperature": temperature,
                "max_new_tokens": max_tokens,
                "return_full_text": False,
            },
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{cfg['base_url']}/{model}",
                headers=cfg["headers"],
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        if isinstance(data, list) and data:
            content = data[0].get("generated_text", "")
        elif isinstance(data, dict):
            content = data.get("generated_text", "")
        else:
            content = str(data)
        return {
            "content": content,
            "role": "assistant",
            "model": model,
            "provider": "huggingface",
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }

    @staticmethod
    def _format_hf_messages(messages: list[dict[str, str]]) -> str:
        parts = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                parts.append(f"<|system|>\n{content}</s>")
            elif role == "user":
                parts.append(f"<|user|>\n{content}</s>")
            elif role == "assistant":
                parts.append(f"<|assistant|>\n{content}</s>")
        parts.append("<|assistant|>\n")
        return "\n".join(parts)

    # -- Chat (streaming) -------------------------------------------------

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        *,
        model_tier: str = "chat",
        model: str | None = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        system: str | None = None,
    ) -> AsyncIterator[str]:
        all_messages = list(messages)
        if system:
            all_messages = [{"role": "system", "content": system}] + all_messages

        last_error: Exception | None = None
        for provider in self.providers:
            cfg = self._get_config(provider, model_tier)
            chosen_model = model or cfg["model"]
            try:
                if provider in (Provider.GROQ, Provider.OPENROUTER, Provider.OLLAMA_CLOUD):
                    async for chunk in self._stream_openai_compat(
                        cfg, all_messages, chosen_model, temperature, max_tokens,
                    ):
                        yield chunk
                    return
                elif provider == Provider.HUGGINGFACE:
                    result = await self._chat_huggingface(
                        cfg, all_messages, chosen_model, temperature, max_tokens,
                    )
                    yield result["content"]
                    return
            except Exception as exc:
                last_error = exc
                logger.warning("Stream provider %s failed: %s", provider, exc)

        raise RuntimeError(f"All streaming providers failed. Last error: {last_error}")

    async def _stream_openai_compat(
        self, cfg: dict, messages: list, model: str,
        temperature: float, max_tokens: int,
    ) -> AsyncIterator[str]:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST", f"{cfg['base_url']}/chat/completions",
                headers=cfg["headers"], json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = (
                            data.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content", "")
                        )
                        if delta:
                            yield delta
                    except json.JSONDecodeError:
                        continue

    # -- Embeddings -------------------------------------------------------

    async def embed(self, text: str, model: str | None = None) -> list[float]:
        last_error: Exception | None = None

        if HF_API_TOKEN:
            try:
                return await self._embed_huggingface(text, model)
            except Exception as exc:
                last_error = exc

        for provider in self.providers:
            if provider == Provider.HUGGINGFACE:
                continue
            try:
                cfg = self._get_config(provider)
                return await self._embed_openai_compat(cfg, text, model)
            except Exception as exc:
                last_error = exc

        raise RuntimeError(f"All embedding providers failed: {last_error}")

    async def _embed_huggingface(self, text: str, model: str | None = None) -> list[float]:
        embed_model = model or HF_MODELS["embed"]
        headers = {
            "Authorization": f"Bearer {HF_API_TOKEN}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{HF_BASE_URL}/{embed_model}",
                headers=headers,
                json={"inputs": text, "options": {"wait_for_model": True}},
            )
            resp.raise_for_status()
            data = resp.json()

        if isinstance(data, list):
            if data and isinstance(data[0], list):
                return data[0]
            return data
        return []

    async def _embed_openai_compat(
        self, cfg: dict, text: str, model: str | None = None
    ) -> list[float]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{cfg['base_url']}/embeddings",
                headers=cfg["headers"],
                json={"model": model or "text-embedding-3-small", "input": text},
            )
            resp.raise_for_status()
            data = resp.json()
        return data.get("data", [{}])[0].get("embedding", [])

    async def embed_batch(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        return [await self.embed(t, model=model) for t in texts]

    async def list_models(self) -> list[dict[str, Any]]:
        all_models: list[dict[str, Any]] = []
        for provider in self.providers:
            cfg = self._get_config(provider)
            try:
                if provider in (Provider.GROQ, Provider.OPENROUTER, Provider.OLLAMA_CLOUD):
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.get(
                            f"{cfg['base_url']}/models", headers=cfg["headers"],
                        )
                        resp.raise_for_status()
                        for m in resp.json().get("data", []):
                            all_models.append({
                                "id": m.get("id"),
                                "provider": provider,
                                "owned_by": m.get("owned_by", ""),
                            })
            except Exception as exc:
                logger.warning("Failed listing models from %s: %s", provider, exc)
        return all_models


# ---------------------------------------------------------------------------
# Singleton + backward-compatible API
# ---------------------------------------------------------------------------

_client: CloudLLMClient | None = None


def get_client() -> CloudLLMClient:
    global _client
    if _client is None:
        _client = CloudLLMClient()
    return _client


OllamaClient = CloudLLMClient  # legacy alias


async def health_check() -> bool:
    result = await get_client().health_check()
    return result.get("status") in ("ok", "degraded")


async def list_models() -> list[str]:
    try:
        return [m["id"] for m in await get_client().list_models() if m.get("id")]
    except Exception as exc:
        logger.error("Failed to list models: %s", exc)
        return []


async def chat_completion(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    system: str | None = None,
    model_tier: str = "chat",
    json_mode: bool = False,
) -> str:
    result = await get_client().chat(
        messages=messages, model=model, model_tier=model_tier,
        temperature=temperature, max_tokens=max_tokens,
        system=system, json_mode=json_mode,
    )
    return result.get("content", "")


async def chat_completion_stream(
    messages: list[dict[str, str]],
    model: str | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    system: str | None = None,
    model_tier: str = "chat",
) -> AsyncIterator[str]:
    async for chunk in get_client().chat_stream(
        messages=messages, model=model, model_tier=model_tier,
        temperature=temperature, max_tokens=max_tokens, system=system,
    ):
        yield chunk


async def generate_embedding(text: str, model: str | None = None) -> list[float]:
    return await get_client().embed(text, model=model)


async def generate_embeddings_batch(
    texts: list[str], model: str | None = None
) -> list[list[float]]:
    return await get_client().embed_batch(texts, model=model)
