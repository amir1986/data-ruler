"""Base class for all agents in the Data Ruler system."""

from __future__ import annotations

import asyncio
import logging
import traceback
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from models.schemas import AgentMessage, AgentMessageType, Priority


class AgentBase(ABC):
    """Abstract base class every agent must inherit from.

    Provides:
    * Standard identity fields (name, description).
    * An async ``process`` entry-point with automatic retries and logging.
    * Helpers for building ``AgentMessage`` instances.
    """

    def __init__(
        self,
        agent_name: str,
        description: str = "",
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ) -> None:
        self.agent_name = agent_name
        self.description = description
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.logger = logging.getLogger(f"agent.{agent_name}")

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Process a single agent message and return a result payload.

        Sub-classes **must** implement this method.
        """
        ...

    # ------------------------------------------------------------------
    # Public entry-point (with retries)
    # ------------------------------------------------------------------

    async def process(self, message: AgentMessage) -> AgentMessage:
        """Execute ``handle`` with automatic retries on failure."""
        last_error: Exception | None = None

        for attempt in range(1, self.max_retries + 1):
            try:
                self.logger.info(
                    "Processing message %s (attempt %d/%d)",
                    message.message_id,
                    attempt,
                    self.max_retries,
                )
                result = await self.handle(message)
                return self.create_response(
                    source_message=message,
                    payload=result,
                )
            except Exception as exc:
                last_error = exc
                self.logger.warning(
                    "Attempt %d failed for message %s: %s",
                    attempt,
                    message.message_id,
                    exc,
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay * attempt)

        # All retries exhausted
        self.logger.error(
            "All %d attempts failed for message %s:\n%s",
            self.max_retries,
            message.message_id,
            traceback.format_exception(last_error) if last_error else "unknown",
        )
        return self.create_error(
            source_message=message,
            error=str(last_error),
        )

    # ------------------------------------------------------------------
    # Message factory helpers
    # ------------------------------------------------------------------

    def create_request(
        self,
        target_agent: str,
        payload: dict[str, Any],
        *,
        correlation_id: UUID | None = None,
        priority: Priority = Priority.NORMAL,
    ) -> AgentMessage:
        return AgentMessage(
            message_id=uuid4(),
            correlation_id=correlation_id or uuid4(),
            message_type=AgentMessageType.REQUEST,
            source_agent=self.agent_name,
            target_agent=target_agent,
            priority=priority,
            payload=payload,
        )

    def create_response(
        self,
        source_message: AgentMessage,
        payload: dict[str, Any],
    ) -> AgentMessage:
        return AgentMessage(
            message_id=uuid4(),
            correlation_id=source_message.correlation_id,
            message_type=AgentMessageType.RESPONSE,
            source_agent=self.agent_name,
            target_agent=source_message.source_agent,
            payload=payload,
        )

    def create_error(
        self,
        source_message: AgentMessage,
        error: str,
    ) -> AgentMessage:
        return AgentMessage(
            message_id=uuid4(),
            correlation_id=source_message.correlation_id,
            message_type=AgentMessageType.ERROR,
            source_agent=self.agent_name,
            target_agent=source_message.source_agent,
            payload={"error": error},
        )

    def create_status(
        self,
        target_agent: str,
        status: str,
        *,
        correlation_id: UUID | None = None,
        extra: dict[str, Any] | None = None,
    ) -> AgentMessage:
        payload: dict[str, Any] = {"status": status}
        if extra:
            payload.update(extra)
        return AgentMessage(
            message_id=uuid4(),
            correlation_id=correlation_id or uuid4(),
            message_type=AgentMessageType.STATUS,
            source_agent=self.agent_name,
            target_agent=target_agent,
            payload=payload,
        )
