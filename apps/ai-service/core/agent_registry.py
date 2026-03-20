"""Agent Registry - manages agent lifecycle and discovery."""

from __future__ import annotations

import logging
from typing import Any

from core.agent_base import AgentBase
from core.circuit_breaker import CircuitBreaker
from core.token_budget import TokenBudgetManager
from core.message_bus import MessageBus
from models.schemas import AgentMessage

logger = logging.getLogger("agent_registry")


class AgentRegistry:
    """Central registry for all agents with automatic message bus wiring.

    Provides:
    * Agent registration with automatic message bus subscription.
    * Circuit breaker integration per agent.
    * Token budget enforcement per agent.
    * Agent discovery by name or capability.
    """

    def __init__(
        self,
        message_bus: MessageBus,
        circuit_breaker: CircuitBreaker | None = None,
        token_budget: TokenBudgetManager | None = None,
    ) -> None:
        self.bus = message_bus
        self.breaker = circuit_breaker or CircuitBreaker()
        self.budget = token_budget or TokenBudgetManager()
        self._agents: dict[str, AgentBase] = {}
        self._capabilities: dict[str, list[str]] = {}  # capability -> [agent_names]

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
            }
            for a in self._agents.values()
        ]

    async def dispatch(self, message: AgentMessage) -> AgentMessage | None:
        """Directly dispatch a message to the target agent.

        Used for synchronous (non-bus) dispatching when you need
        the result immediately.
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

        try:
            response = await agent.process(message)
            self.breaker.record_success(target)

            # Record token usage if available
            tokens = response.payload.get("total_tokens", 0)
            if tokens:
                self.budget.record(target, tokens // 2, tokens // 2)

            return response
        except Exception as exc:
            self.breaker.record_failure(target)
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

            try:
                response = await agent.process(message)
                self.breaker.record_success(agent.agent_name)

                tokens = response.payload.get("total_tokens", 0)
                if tokens:
                    self.budget.record(agent.agent_name, tokens // 2, tokens // 2)

                # Publish response back to the bus
                await self.bus.publish(response)
            except Exception as exc:
                self.breaker.record_failure(agent.agent_name)
                logger.error("Agent '%s' handler failed: %s", agent.agent_name, exc)

        return handler
