"""Token budget manager for LLM-backed agents."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger("token_budget")


@dataclass
class _UsageRecord:
    """Snapshot of token usage for a single LLM call."""

    agent_name: str
    prompt_tokens: int
    completion_tokens: int
    timestamp: float = field(default_factory=time.monotonic)

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


class TokenBudgetManager:
    """Enforce per-agent and global token budgets over a rolling window.

    Parameters
    ----------
    global_budget:
        Maximum total tokens across all agents per window.
    per_agent_budget:
        Default maximum tokens per individual agent per window.
    window_seconds:
        Length of the rolling window in seconds (default 1 hour).
    """

    def __init__(
        self,
        global_budget: int = 1_000_000,
        per_agent_budget: int = 200_000,
        window_seconds: float = 3600.0,
    ) -> None:
        self.global_budget = global_budget
        self.per_agent_budget = per_agent_budget
        self.window_seconds = window_seconds

        # Per-agent budget overrides
        self._agent_budgets: dict[str, int] = {}

        # All usage records (pruned lazily)
        self._records: list[_UsageRecord] = []

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    def set_agent_budget(self, agent_name: str, budget: int) -> None:
        """Override the token budget for a specific agent."""
        self._agent_budgets[agent_name] = budget

    def get_agent_budget(self, agent_name: str) -> int:
        return self._agent_budgets.get(agent_name, self.per_agent_budget)

    # ------------------------------------------------------------------
    # Querying
    # ------------------------------------------------------------------

    def has_budget(self, agent_name: str, estimated_tokens: int = 0) -> bool:
        """Return ``True`` if *agent_name* can spend *estimated_tokens*."""
        self._prune()
        agent_used = self._agent_usage(agent_name)
        global_used = self._global_usage()
        agent_limit = self.get_agent_budget(agent_name)

        if agent_used + estimated_tokens > agent_limit:
            logger.warning(
                "Agent '%s' would exceed its budget (%d + %d > %d)",
                agent_name,
                agent_used,
                estimated_tokens,
                agent_limit,
            )
            return False

        if global_used + estimated_tokens > self.global_budget:
            logger.warning(
                "Global budget would be exceeded (%d + %d > %d)",
                global_used,
                estimated_tokens,
                self.global_budget,
            )
            return False

        return True

    def remaining(self, agent_name: str) -> int:
        """Tokens remaining for *agent_name* in the current window."""
        self._prune()
        agent_limit = self.get_agent_budget(agent_name)
        return max(0, agent_limit - self._agent_usage(agent_name))

    def remaining_global(self) -> int:
        self._prune()
        return max(0, self.global_budget - self._global_usage())

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------

    def record(
        self,
        agent_name: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> None:
        """Record a completed LLM call."""
        rec = _UsageRecord(
            agent_name=agent_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
        self._records.append(rec)
        logger.debug(
            "Recorded %d tokens for '%s' (prompt=%d, completion=%d)",
            rec.total_tokens,
            agent_name,
            prompt_tokens,
            completion_tokens,
        )

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------

    def usage_summary(self) -> dict[str, int]:
        """Return ``{agent_name: total_tokens}`` for the current window."""
        self._prune()
        summary: dict[str, int] = {}
        for rec in self._records:
            summary[rec.agent_name] = (
                summary.get(rec.agent_name, 0) + rec.total_tokens
            )
        return summary

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _prune(self) -> None:
        """Remove records outside the rolling window."""
        cutoff = time.monotonic() - self.window_seconds
        self._records = [r for r in self._records if r.timestamp >= cutoff]

    def _agent_usage(self, agent_name: str) -> int:
        return sum(
            r.total_tokens for r in self._records if r.agent_name == agent_name
        )

    def _global_usage(self) -> int:
        return sum(r.total_tokens for r in self._records)
