"""Scheduler Agent - manages processing queues, concurrency, and timeouts."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable, Awaitable
from uuid import UUID, uuid4

from core.agent_base import AgentBase
from models.schemas import AgentMessage, Priority, ProcessingStatus

logger = logging.getLogger(__name__)

# Limits
DEFAULT_MAX_CONCURRENT = 5
DEFAULT_TASK_TIMEOUT = 300.0  # 5 minutes


class TaskEntry:
    """Represents a scheduled task in the priority queue."""

    def __init__(
        self,
        task_id: UUID,
        agent_name: str,
        payload: dict[str, Any],
        priority: Priority = Priority.NORMAL,
        timeout: float = DEFAULT_TASK_TIMEOUT,
    ) -> None:
        self.task_id = task_id
        self.agent_name = agent_name
        self.payload = payload
        self.priority = priority
        self.timeout = timeout
        self.status = ProcessingStatus.PENDING
        self.progress = 0.0
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.created_at = time.monotonic()
        self.started_at: float | None = None
        self.completed_at: float | None = None

    def __lt__(self, other: TaskEntry) -> bool:
        """Comparison for priority queue (higher priority = processed first)."""
        return self.priority.value > other.priority.value


class SchedulerAgent(AgentBase):
    """Manages a priority queue of processing tasks with concurrency limits."""

    def __init__(
        self,
        max_concurrent: int = DEFAULT_MAX_CONCURRENT,
        default_timeout: float = DEFAULT_TASK_TIMEOUT,
    ) -> None:
        super().__init__(
            agent_name="scheduler",
            description="Manages priority queue, concurrent processing limits, timeouts, and progress reporting.",
        )
        self.max_concurrent = max_concurrent
        self.default_timeout = default_timeout

        self._queue: asyncio.PriorityQueue[TaskEntry] = asyncio.PriorityQueue()
        self._active_tasks: dict[UUID, asyncio.Task[Any]] = {}
        self._task_registry: dict[UUID, TaskEntry] = {}
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._running = False
        self._worker_task: asyncio.Task[Any] | None = None

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        """Handle scheduler commands: submit, status, cancel, list."""
        payload = message.payload
        action = payload.get("action", "submit")

        if action == "submit":
            return await self._handle_submit(payload)
        elif action == "status":
            return await self._handle_status(payload)
        elif action == "cancel":
            return await self._handle_cancel(payload)
        elif action == "list":
            return self._handle_list()
        elif action == "start":
            return await self._handle_start()
        elif action == "stop":
            return await self._handle_stop()
        else:
            return {"error": f"Unknown scheduler action: {action}"}

    async def _handle_submit(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Submit a new task to the scheduler."""
        task_id = uuid4()
        agent_name = payload.get("agent_name", "")
        task_payload = payload.get("task_payload", {})
        priority_val = payload.get("priority", Priority.NORMAL.value)
        timeout = payload.get("timeout", self.default_timeout)

        if not agent_name:
            return {"error": "agent_name is required"}

        priority = Priority(priority_val) if isinstance(priority_val, int) else Priority.NORMAL

        entry = TaskEntry(
            task_id=task_id,
            agent_name=agent_name,
            payload=task_payload,
            priority=priority,
            timeout=timeout,
        )

        self._task_registry[task_id] = entry
        await self._queue.put(entry)

        self.logger.info(
            "Task %s submitted: agent=%s priority=%s",
            task_id, agent_name, priority.name,
        )

        # Auto-start the worker if not running
        if not self._running:
            await self._handle_start()

        return {
            "task_id": str(task_id),
            "agent_name": agent_name,
            "priority": priority.name,
            "status": ProcessingStatus.PENDING.value,
            "queue_size": self._queue.qsize(),
        }

    async def _handle_status(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Get the status of a specific task."""
        task_id_str = payload.get("task_id", "")
        try:
            task_id = UUID(task_id_str)
        except (ValueError, TypeError):
            return {"error": f"Invalid task_id: {task_id_str}"}

        entry = self._task_registry.get(task_id)
        if not entry:
            return {"error": f"Task not found: {task_id}"}

        elapsed = None
        if entry.started_at:
            end = entry.completed_at or time.monotonic()
            elapsed = round(end - entry.started_at, 2)

        return {
            "task_id": str(task_id),
            "agent_name": entry.agent_name,
            "status": entry.status.value,
            "progress": entry.progress,
            "result": entry.result,
            "error": entry.error,
            "elapsed_seconds": elapsed,
        }

    async def _handle_cancel(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Cancel a running or pending task."""
        task_id_str = payload.get("task_id", "")
        try:
            task_id = UUID(task_id_str)
        except (ValueError, TypeError):
            return {"error": f"Invalid task_id: {task_id_str}"}

        entry = self._task_registry.get(task_id)
        if not entry:
            return {"error": f"Task not found: {task_id}"}

        # Cancel running async task
        if task_id in self._active_tasks:
            self._active_tasks[task_id].cancel()
            del self._active_tasks[task_id]

        entry.status = ProcessingStatus.FAILED
        entry.error = "Cancelled by user"
        entry.completed_at = time.monotonic()

        return {"task_id": str(task_id), "status": "cancelled"}

    def _handle_list(self) -> dict[str, Any]:
        """List all tasks and their statuses."""
        tasks = []
        for task_id, entry in self._task_registry.items():
            tasks.append({
                "task_id": str(task_id),
                "agent_name": entry.agent_name,
                "status": entry.status.value,
                "priority": entry.priority.name,
                "progress": entry.progress,
            })

        return {
            "tasks": tasks,
            "total": len(tasks),
            "active": len(self._active_tasks),
            "queue_size": self._queue.qsize(),
            "max_concurrent": self.max_concurrent,
        }

    async def _handle_start(self) -> dict[str, Any]:
        """Start the scheduler worker loop."""
        if self._running:
            return {"status": "already_running"}

        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop())
        return {"status": "started"}

    async def _handle_stop(self) -> dict[str, Any]:
        """Stop the scheduler worker loop."""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None
        return {"status": "stopped"}

    async def _worker_loop(self) -> None:
        """Background loop that processes tasks from the queue."""
        while self._running:
            try:
                entry = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            # Acquire semaphore for concurrency limit
            await self._semaphore.acquire()

            task = asyncio.create_task(self._execute_task(entry))
            self._active_tasks[entry.task_id] = task
            task.add_done_callback(
                lambda t, tid=entry.task_id: self._task_completed(tid)
            )

    async def _execute_task(self, entry: TaskEntry) -> None:
        """Execute a single task with timeout handling."""
        entry.status = ProcessingStatus.RUNNING
        entry.started_at = time.monotonic()

        try:
            # In a full implementation, this would dispatch to the actual agent.
            # For now, simulate by creating a request message.
            self.logger.info("Executing task %s (agent: %s)", entry.task_id, entry.agent_name)

            # Timeout wrapping
            result = await asyncio.wait_for(
                self._dispatch_to_agent(entry),
                timeout=entry.timeout,
            )

            entry.status = ProcessingStatus.COMPLETED
            entry.progress = 1.0
            entry.result = result
        except asyncio.TimeoutError:
            entry.status = ProcessingStatus.FAILED
            entry.error = f"Task timed out after {entry.timeout}s"
            self.logger.warning("Task %s timed out", entry.task_id)
        except asyncio.CancelledError:
            entry.status = ProcessingStatus.FAILED
            entry.error = "Task cancelled"
        except Exception as exc:
            entry.status = ProcessingStatus.FAILED
            entry.error = str(exc)
            self.logger.error("Task %s failed: %s", entry.task_id, exc)
        finally:
            entry.completed_at = time.monotonic()
            self._semaphore.release()

    async def _dispatch_to_agent(self, entry: TaskEntry) -> dict[str, Any]:
        """Dispatch a task to its target agent via the message bus."""
        # Placeholder for actual agent dispatch
        return {
            "dispatched_to": entry.agent_name,
            "payload": entry.payload,
            "note": "Full dispatch requires message bus integration",
        }

    def _task_completed(self, task_id: UUID) -> None:
        """Callback when an async task finishes."""
        self._active_tasks.pop(task_id, None)

    def update_progress(self, task_id: UUID, progress: float) -> None:
        """Update the progress of a task (called by executing agents)."""
        entry = self._task_registry.get(task_id)
        if entry:
            entry.progress = min(max(progress, 0.0), 1.0)
