"""In-memory message bus for agent-to-agent communication."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable
from uuid import UUID

from models.schemas import AgentMessage

logger = logging.getLogger("message_bus")

# Type alias for subscriber callbacks
Subscriber = Callable[[AgentMessage], Awaitable[None]]


class DeadLetterQueue:
    """Stores messages that could not be delivered or expired.

    Provides visibility into failed message delivery for debugging
    and operational monitoring.
    """

    def __init__(self, max_size: int = 1000) -> None:
        self._entries: deque[dict[str, Any]] = deque(maxlen=max_size)

    def add(self, message: AgentMessage, reason: str) -> None:
        self._entries.append({
            "message_id": str(message.message_id),
            "correlation_id": str(message.correlation_id),
            "source_agent": message.source_agent,
            "target_agent": message.target_agent,
            "message_type": message.message_type.value,
            "reason": reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        logger.warning(
            "Dead letter: %s -> %s (reason=%s, msg_id=%s)",
            message.source_agent,
            message.target_agent,
            reason,
            message.message_id,
        )

    def recent(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return the most recent dead-letter entries."""
        items = list(self._entries)
        return items[-limit:]

    @property
    def count(self) -> int:
        return len(self._entries)

    def clear(self) -> None:
        self._entries.clear()


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
    * **TTL enforcement** -- messages past their TTL are moved to the
      dead letter queue instead of being delivered.
    * **Dead letter queue** -- undeliverable messages are captured for
      operational visibility.
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

        # Dead letter queue for undeliverable messages
        self.dead_letters = DeadLetterQueue()

        # Metrics
        self._published_count = 0
        self._delivered_count = 0
        self._expired_count = 0

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
        self._published_count += 1
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
    # Observability
    # ------------------------------------------------------------------

    def stats(self) -> dict[str, Any]:
        """Return bus-level operational statistics."""
        return {
            "published": self._published_count,
            "delivered": self._delivered_count,
            "expired": self._expired_count,
            "queue_size": self._queue.qsize(),
            "pending_correlations": len(self._pending),
            "subscriber_channels": len(self._subscribers),
            "dead_letter_count": self.dead_letters.count,
        }

    # ------------------------------------------------------------------
    # Internal dispatch loop
    # ------------------------------------------------------------------

    def _is_expired(self, message: AgentMessage) -> bool:
        """Check if the message has exceeded its TTL."""
        if message.ttl_seconds <= 0:
            return False
        age = (datetime.now(timezone.utc) - message.timestamp.replace(
            tzinfo=timezone.utc
        )).total_seconds()
        return age > message.ttl_seconds

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

            # TTL enforcement
            if self._is_expired(message):
                self._expired_count += 1
                self.dead_letters.add(message, "ttl_expired")
                # Still resolve correlation futures so callers aren't stuck
                if message.correlation_id in self._pending:
                    fut = self._pending.pop(message.correlation_id)
                    if not fut.done():
                        fut.cancel()
                continue

            # Resolve pending correlation futures
            if message.correlation_id in self._pending:
                fut = self._pending[message.correlation_id]
                if not fut.done():
                    fut.set_result(message)

            # Fan-out to subscribers with per-callback timeout
            subscribers = self._subscribers.get(message.target_agent, [])
            if not subscribers and message.target_agent:
                self.dead_letters.add(message, "no_subscribers")
            else:
                for callback in subscribers:
                    try:
                        await asyncio.wait_for(callback(message), timeout=180.0)
                        self._delivered_count += 1
                    except asyncio.TimeoutError:
                        logger.error(
                            "Subscriber %s timed out on message %s (180s)",
                            callback, message.message_id,
                        )
                        self.dead_letters.add(message, "subscriber_timeout")
                    except Exception:
                        logger.exception(
                            "Subscriber %s failed processing message %s",
                            callback,
                            message.message_id,
                        )
