"""Scheduler Agent - manages recurring tasks and background processing."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from core.agent_base import AgentBase
from models.schemas import AgentMessage

logger = logging.getLogger(__name__)


class SchedulerAgent(AgentBase):
    def __init__(self) -> None:
        super().__init__(
            agent_name="scheduler",
            description="Manages recurring tasks, background processing queues, and scheduled data refreshes.",
        )
        self._tasks: dict[str, dict[str, Any]] = {}

    async def handle(self, message: AgentMessage) -> dict[str, Any]:
        payload = message.payload
        action = payload.get("action", "status")

        if action == "schedule":
            task_id = str(uuid4())
            self._tasks[task_id] = {
                "task_type": payload.get("task_type", "refresh"),
                "target_agent": payload.get("target_agent"),
                "interval_seconds": payload.get("interval_seconds", 3600),
                "created_at": datetime.utcnow().isoformat(),
                "status": "scheduled",
            }
            return {"task_id": task_id, "status": "scheduled"}
        elif action == "cancel":
            task_id = payload.get("task_id", "")
            if task_id in self._tasks:
                self._tasks[task_id]["status"] = "cancelled"
                return {"task_id": task_id, "status": "cancelled"}
            return {"error": "Task not found"}
        else:
            return {"tasks": list(self._tasks.values()), "count": len(self._tasks)}
