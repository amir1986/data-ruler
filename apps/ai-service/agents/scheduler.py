"""Scheduler Agent - manages recurring tasks and background processing."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING
from uuid import UUID, uuid4

from core.agent_base import AgentBase, AgentContract
from models.schemas import AgentMessage, AgentMessageType, Priority

if TYPE_CHECKING:
    from core.agent_registry import AgentRegistry

logger = logging.getLogger(__name__)


class ScheduledTask:
    """A single scheduled recurring task."""

    __slots__ = (
        "task_id", "task_type", "target_agent", "payload",
        "interval_seconds", "created_at", "status",
        "last_run_at", "run_count", "last_error", "_handle",
    )

    def __init__(
        self,
        target_agent: str,
        interval_seconds: int,
        payload: dict[str, Any] | None = None,
        task_type: str = "refresh",
    ) -> None:
        self.task_id = str(uuid4())
        self.task_type = task_type
        self.target_agent = target_agent
        self.payload = payload or {}
        self.interval_seconds = interval_seconds
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.status = "scheduled"
        self.last_run_at: str | None = None
        self.run_count = 0
        self.last_error: str | None = None
        self._handle: asyncio.Task | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type,
            "target_agent": self.target_agent,
            "interval_seconds": self.interval_seconds,
            "created_at": self.created_at,
            "status": self.status,
            "last_run_at": self.last_run_at,
            "run_count": self.run_count,
            "last_error": self.last_error,
        }


class SchedulerAgent(AgentBase):
    """Manages recurring tasks by dispatching to target agents on a schedule.

    Supports:
    * ``schedule`` – create a new recurring task
    * ``cancel`` – stop a running scheduled task
    * ``status`` – list all tasks and their state
    """

    def __init__(self) -> None:
        super().__init__(
            agent_name="scheduler",
            description="Manages recurring tasks, background processing queues, and scheduled data refreshes.",
            contract=AgentContract(
                optional_inputs=("action", "task_id", "target_agent", "interval_seconds", "task_payload"),
                output_keys=("task_id", "status"),
            ),
        )
        self._tasks: dict[str, ScheduledTask] = {}
        self._registry: AgentRegistry | None = None

    def set_registry(self, registry: AgentRegistry) -> None:
        """Inject the agent registry for dispatching scheduled work."""
        self._registry = registry

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        action = payload.get("action", "status")

        if action == "schedule":
            return await self._schedule_task(payload)
        elif action == "cancel":
            return self._cancel_task(payload.get("task_id", ""))
        else:
            return self._list_tasks()

    _MAX_SCHEDULED_TASKS = 50

    async def _schedule_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        target_agent = payload.get("target_agent")
        if not target_agent:
            return {"error": "target_agent is required for scheduling"}

        active = sum(1 for t in self._tasks.values() if t.status == "running")
        if active >= self._MAX_SCHEDULED_TASKS:
            return {"error": f"Max scheduled tasks ({self._MAX_SCHEDULED_TASKS}) reached"}

        interval = int(payload.get("interval_seconds", 3600))
        if interval < 60:
            return {"error": "Minimum interval is 60 seconds"}

        task = ScheduledTask(
            target_agent=target_agent,
            interval_seconds=interval,
            payload=payload.get("task_payload", {}),
            task_type=payload.get("task_type", "refresh"),
        )

        self._tasks[task.task_id] = task

        # Start the background loop for this task
        task._handle = asyncio.create_task(self._run_loop(task))
        logger.info(
            "Scheduled task %s -> %s every %ds",
            task.task_id, target_agent, interval,
        )

        return {"task_id": task.task_id, "status": "scheduled"}

    def _cancel_task(self, task_id: str) -> dict[str, Any]:
        task = self._tasks.get(task_id)
        if not task:
            return {"error": f"Task '{task_id}' not found"}

        task.status = "cancelled"
        if task._handle and not task._handle.done():
            task._handle.cancel()
        logger.info("Cancelled task %s", task_id)

        return {"task_id": task_id, "status": "cancelled"}

    def _list_tasks(self) -> dict[str, Any]:
        return {
            "tasks": [t.to_dict() for t in self._tasks.values()],
            "count": len(self._tasks),
        }

    async def _run_loop(self, task: ScheduledTask) -> None:
        """Background loop that dispatches to the target agent periodically."""
        task.status = "running"
        try:
            while task.status == "running":
                await asyncio.sleep(task.interval_seconds)

                if task.status != "running":
                    break

                task.run_count += 1
                task.last_run_at = datetime.now(timezone.utc).isoformat()

                if not self._registry:
                    task.last_error = "No registry available"
                    logger.warning("Scheduler has no registry — skipping dispatch for %s", task.task_id)
                    continue

                try:
                    msg = AgentMessage(
                        message_id=uuid4(),
                        correlation_id=uuid4(),
                        message_type=AgentMessageType.REQUEST,
                        source_agent=self.agent_name,
                        target_agent=task.target_agent,
                        priority=Priority.LOW,
                        payload={
                            **task.payload,
                            "_scheduled": True,
                            "_task_id": task.task_id,
                        },
                    )
                    response = await self._registry.dispatch(msg, timeout=60.0)
                    if response is None:
                        task.last_error = "Dispatch returned None"
                    else:
                        task.last_error = None
                        logger.info(
                            "Scheduled task %s completed (run #%d)",
                            task.task_id, task.run_count,
                        )
                except Exception as exc:
                    task.last_error = str(exc)
                    logger.error("Scheduled dispatch failed for %s: %s", task.task_id, exc)

        except asyncio.CancelledError:
            task.status = "cancelled"
        except Exception as exc:
            task.status = "failed"
            task.last_error = str(exc)
            logger.error("Scheduler loop crashed for %s: %s", task.task_id, exc)
