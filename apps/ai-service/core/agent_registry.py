"""Agent Registry - manages agent lifecycle, discovery, and observability."""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from core.agent_base import AgentBase
from core.circuit_breaker import CircuitBreaker
from core.token_budget import TokenBudgetManager
from core.message_bus import MessageBus
from models.schemas import AgentMessage, AgentMessageType

logger = logging.getLogger("agent_registry")


# ---------------------------------------------------------------------------
# Agent metrics
# ---------------------------------------------------------------------------

@dataclass
class AgentMetrics:
    """Execution metrics for a single agent."""

    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    timed_out_calls: int = 0
    total_duration_ms: float = 0.0
    last_call_time: float = 0.0
    last_error: str | None = None
    # Rolling window for recent latency (last 100 calls)
    _recent_durations: list[float] = field(default_factory=list)

    def record_success(self, duration_ms: float) -> None:
        self.total_calls += 1
        self.successful_calls += 1
        self.total_duration_ms += duration_ms
        self.last_call_time = time.monotonic()
        self._recent_durations.append(duration_ms)
        if len(self._recent_durations) > 100:
            self._recent_durations.pop(0)

    def record_failure(self, duration_ms: float, error: str) -> None:
        self.total_calls += 1
        self.failed_calls += 1
        self.total_duration_ms += duration_ms
        self.last_call_time = time.monotonic()
        self.last_error = error
        self._recent_durations.append(duration_ms)
        if len(self._recent_durations) > 100:
            self._recent_durations.pop(0)

    def record_timeout(self) -> None:
        self.total_calls += 1
        self.timed_out_calls += 1
        self.last_call_time = time.monotonic()
        self.last_error = "timeout"

    @property
    def avg_duration_ms(self) -> float:
        if not self._recent_durations:
            return 0.0
        return sum(self._recent_durations) / len(self._recent_durations)

    @property
    def p95_duration_ms(self) -> float:
        if not self._recent_durations:
            return 0.0
        sorted_d = sorted(self._recent_durations)
        idx = int(len(sorted_d) * 0.95)
        return sorted_d[min(idx, len(sorted_d) - 1)]

    @property
    def success_rate(self) -> float:
        if self.total_calls == 0:
            return 1.0
        return self.successful_calls / self.total_calls

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_calls": self.total_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "timed_out_calls": self.timed_out_calls,
            "success_rate": round(self.success_rate, 3),
            "avg_duration_ms": round(self.avg_duration_ms, 1),
            "p95_duration_ms": round(self.p95_duration_ms, 1),
            "last_error": self.last_error,
        }


class AgentRegistry:
    """Central registry for all agents with automatic message bus wiring.

    Provides:
    * Agent registration with automatic message bus subscription.
    * Circuit breaker integration per agent.
    * Token budget enforcement per agent.
    * Agent discovery by name or capability.
    * Per-agent execution metrics and observability.
    * Configurable dispatch timeouts.
    """

    def __init__(
        self,
        message_bus: MessageBus,
        circuit_breaker: CircuitBreaker | None = None,
        token_budget: TokenBudgetManager | None = None,
        default_dispatch_timeout: float = 120.0,
    ) -> None:
        self.bus = message_bus
        self.breaker = circuit_breaker or CircuitBreaker()
        self.budget = token_budget or TokenBudgetManager()
        self.default_dispatch_timeout = default_dispatch_timeout
        self._agents: dict[str, AgentBase] = {}
        self._capabilities: dict[str, list[str]] = {}  # capability -> [agent_names]
        self._metrics: dict[str, AgentMetrics] = defaultdict(AgentMetrics)

    def register(
        self,
        agent: AgentBase,
        capabilities: list[str] | None = None,
    ) -> None:
        """Register an agent and subscribe it to the message bus."""
        name = agent.agent_name
        if name in self._agents:
            logger.warning("Agent '%s' already registered — replacing", name)

        self._agents[name] = agent

        # Track capabilities
        for cap in (capabilities or []):
            self._capabilities.setdefault(cap, []).append(name)

        # Subscribe to message bus
        self.bus.subscribe(name, self._make_handler(agent))
        logger.info(
            "Registered agent '%s' (caps=%s)", name, capabilities or [],
        )

    def get(self, name: str) -> AgentBase | None:
        return self._agents.get(name)

    def get_by_capability(self, capability: str) -> list[AgentBase]:
        names = self._capabilities.get(capability, [])
        return [self._agents[n] for n in names if n in self._agents]

    def list_agents(self) -> list[dict[str, Any]]:
        return [
            {
                "name": a.agent_name,
                "description": a.description,
                "available": self.breaker.is_available(a.agent_name),
                "tokens_remaining": self.budget.remaining(a.agent_name),
                "metrics": self._metrics[a.agent_name].to_dict(),
            }
            for a in self._agents.values()
        ]

    def get_metrics(self, agent_name: str) -> dict[str, Any]:
        """Return execution metrics for a specific agent."""
        return self._metrics[agent_name].to_dict()

    def get_all_metrics(self) -> dict[str, dict[str, Any]]:
        """Return metrics for all agents."""
        return {
            name: self._metrics[name].to_dict()
            for name in self._agents
        }

    async def dispatch(
        self,
        message: AgentMessage,
        timeout: float | None = None,
    ) -> AgentMessage | None:
        """Directly dispatch a message to the target agent.

        Used for synchronous (non-bus) dispatching when you need
        the result immediately.  Applies a timeout to prevent hung agents
        from blocking the caller indefinitely.
        """
        target = message.target_agent
        agent = self._agents.get(target)
        if not agent:
            logger.error("No agent registered for '%s'", target)
            return None

        if not self.breaker.is_available(target):
            logger.warning("Circuit open for '%s' — skipping", target)
            return None

        if not self.budget.has_budget(target):
            logger.warning("Token budget exhausted for '%s'", target)
            return None

        effective_timeout = timeout or self.default_dispatch_timeout
        start = time.monotonic()

        try:
            response = await asyncio.wait_for(
                agent.process(message),
                timeout=effective_timeout,
            )
            duration_ms = (time.monotonic() - start) * 1000
            self.breaker.record_success(target)
            self._metrics[target].record_success(duration_ms)

            # Record token usage if available
            tokens = response.payload.get("total_tokens", 0)
            if tokens:
                self.budget.record(target, tokens // 2, tokens // 2)

            return response
        except asyncio.TimeoutError:
            self.breaker.record_failure(target)
            self._metrics[target].record_timeout()
            logger.error(
                "Agent '%s' timed out after %.1fs", target, effective_timeout,
            )
            return None
        except Exception as exc:
            duration_ms = (time.monotonic() - start) * 1000
            self.breaker.record_failure(target)
            self._metrics[target].record_failure(duration_ms, str(exc))
            logger.error("Agent '%s' failed: %s", target, exc)
            return None

    def _make_handler(self, agent: AgentBase):
        """Create a message bus callback for an agent."""
        async def handler(message: AgentMessage) -> None:
            if not self.breaker.is_available(agent.agent_name):
                logger.warning("Circuit open for '%s'", agent.agent_name)
                return
            if not self.budget.has_budget(agent.agent_name):
                logger.warning("Budget exhausted for '%s'", agent.agent_name)
                return

            start = time.monotonic()
            try:
                response = await asyncio.wait_for(
                    agent.process(message),
                    timeout=self.default_dispatch_timeout,
                )
                duration_ms = (time.monotonic() - start) * 1000
                self.breaker.record_success(agent.agent_name)
                self._metrics[agent.agent_name].record_success(duration_ms)

                tokens = response.payload.get("total_tokens", 0)
                if tokens:
                    self.budget.record(agent.agent_name, tokens // 2, tokens // 2)

                # Publish response back to the bus
                await self.bus.publish(response)
            except asyncio.TimeoutError:
                self.breaker.record_failure(agent.agent_name)
                self._metrics[agent.agent_name].record_timeout()
                logger.error("Agent '%s' bus handler timed out", agent.agent_name)
            except Exception as exc:
                duration_ms = (time.monotonic() - start) * 1000
                self.breaker.record_failure(agent.agent_name)
                self._metrics[agent.agent_name].record_failure(duration_ms, str(exc))
                logger.error("Agent '%s' handler failed: %s", agent.agent_name, exc)

        return handler
