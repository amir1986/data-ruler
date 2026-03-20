"""In-memory message bus for agent-to-agent communication."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any, Awaitable, Callable
from uuid import UUID

from models.schemas import AgentMessage

logger = logging.getLogger("message_bus")

# Type alias for subscriber callbacks
Subscriber = Callable[[AgentMessage], Awaitable[None]]


class MessageBus:
    """Publish / subscribe message bus with priority queuing.

    Features
    --------
    * **Target-based routing** -- messages are delivered to subscribers
      registered for the ``target_agent`` field of each message.
    * **Correlation tracking** -- callers can ``await`` a response that
      shares the same ``correlation_id``.
    * **Priority queue** -- higher-priority messages are delivered first
      (Python's ``asyncio.PriorityQueue`` with negated priority value).
    """

    def __init__(self, max_queue_size: int = 10_000) -> None:
        # agent_name -> list of subscriber callbacks
        self._subscribers: dict[str, list[Subscriber]] = defaultdict(list)

        # correlation_id -> Future waiting for a response
        self._pending: dict[UUID, asyncio.Future[AgentMessage]] = {}

        # Internal priority queue:  items are ``(-priority, seq, message)``
        self._queue: asyncio.PriorityQueue[tuple[int, int, AgentMessage]] = (
            asyncio.PriorityQueue(maxsize=max_queue_size)
        )
        self._seq = 0  # tie-breaker for equal priorities
        self._dispatch_task: asyncio.Task[None] | None = None
        self._running = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the background dispatch loop."""
        if self._running:
            return
        self._running = True
        self._dispatch_task = asyncio.create_task(self._dispatch_loop())
        logger.info("Message bus started")

    async def shutdown(self) -> None:
        """Gracefully stop the dispatch loop."""
        self._running = False
        if self._dispatch_task is not None:
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except asyncio.CancelledError:
                pass
        # Cancel any pending correlation futures
        for fut in self._pending.values():
            if not fut.done():
                fut.cancel()
        self._pending.clear()
        logger.info("Message bus shut down")

    # ------------------------------------------------------------------
    # Subscribe / unsubscribe
    # ------------------------------------------------------------------

    def subscribe(self, agent_name: str, callback: Subscriber) -> None:
        """Register *callback* to receive messages targeted at *agent_name*."""
        self._subscribers[agent_name].append(callback)
        logger.debug("Subscribed %s to agent channel '%s'", callback, agent_name)

        # Auto-start the dispatch loop on first subscription
        if not self._running:
            self.start()

    def unsubscribe(self, agent_name: str, callback: Subscriber) -> None:
        subs = self._subscribers.get(agent_name, [])
        if callback in subs:
            subs.remove(callback)

    # ------------------------------------------------------------------
    # Publish
    # ------------------------------------------------------------------

    async def publish(self, message: AgentMessage) -> None:
        """Enqueue a message for delivery."""
        self._seq += 1
        # Negate priority so higher numeric priority is dequeued first
        await self._queue.put((-message.priority.value, self._seq, message))
        logger.debug(
            "Published message %s -> %s (priority=%s)",
            message.source_agent,
            message.target_agent,
            message.priority.name,
        )

    # ------------------------------------------------------------------
    # Request / reply with correlation
    # ------------------------------------------------------------------

    async def request(
        self,
        message: AgentMessage,
        timeout: float = 30.0,
    ) -> AgentMessage:
        """Publish *message* and wait for a correlated response."""
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[AgentMessage] = loop.create_future()
        self._pending[message.correlation_id] = fut
        await self.publish(message)
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self._pending.pop(message.correlation_id, None)

    # ------------------------------------------------------------------
    # Internal dispatch loop
    # ------------------------------------------------------------------

    async def _dispatch_loop(self) -> None:
        while self._running:
            try:
                neg_pri, _seq, message = await asyncio.wait_for(
                    self._queue.get(), timeout=1.0
                )
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            # Resolve pending correlation futures
            if message.correlation_id in self._pending:
                fut = self._pending[message.correlation_id]
                if not fut.done():
                    fut.set_result(message)

            # Fan-out to subscribers
            subscribers = self._subscribers.get(message.target_agent, [])
            for callback in subscribers:
                try:
                    await callback(message)
                except Exception:
                    logger.exception(
                        "Subscriber %s failed processing message %s",
                        callback,
                        message.message_id,
                    )
