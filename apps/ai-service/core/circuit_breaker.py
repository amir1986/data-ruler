"""Circuit breaker for agent fault tolerance."""

from __future__ import annotations

import logging
import time
from enum import Enum
from dataclasses import dataclass, field

logger = logging.getLogger("circuit_breaker")


class CircuitState(str, Enum):
    CLOSED = "closed"        # Normal operation
    OPEN = "open"            # Failures exceeded threshold -- reject calls
    HALF_OPEN = "half_open"  # Allowing a single probe request


@dataclass
class _AgentCircuit:
    """Internal record for a single agent's circuit state."""

    agent_name: str
    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    first_failure_time: float = 0.0
    last_failure_time: float = 0.0
    opened_at: float = 0.0
    half_open_attempts: int = 0


class CircuitBreaker:
    """Track failures per agent and trip the circuit when thresholds are hit.

    Parameters
    ----------
    failure_threshold:
        Number of consecutive failures required to open the circuit.
    failure_window_seconds:
        Rolling window (seconds) in which ``failure_threshold`` failures must
        occur.  Failures older than this are forgotten.
    recovery_timeout:
        Seconds to wait in *open* state before transitioning to *half-open*.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        failure_window_seconds: float = 600.0,  # 10 minutes
        recovery_timeout: float = 60.0,
    ) -> None:
        self.failure_threshold = failure_threshold
        self.failure_window_seconds = failure_window_seconds
        self.recovery_timeout = recovery_timeout
        self._circuits: dict[str, _AgentCircuit] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def is_available(self, agent_name: str) -> bool:
        """Return ``True`` if calls to *agent_name* should be allowed."""
        circuit = self._get_circuit(agent_name)
        now = time.monotonic()

        if circuit.state == CircuitState.CLOSED:
            return True

        if circuit.state == CircuitState.OPEN:
            # Check if enough time has passed to move to half-open
            if now - circuit.opened_at >= self.recovery_timeout:
                circuit.state = CircuitState.HALF_OPEN
                circuit.half_open_attempts = 0
                logger.info("Circuit for '%s' moved to HALF_OPEN", agent_name)
                return True
            return False

        # HALF_OPEN -- allow exactly one probe
        if circuit.state == CircuitState.HALF_OPEN:
            return circuit.half_open_attempts == 0

        return False

    def record_success(self, agent_name: str) -> None:
        """Record a successful call -- reset circuit to closed."""
        circuit = self._get_circuit(agent_name)
        if circuit.state != CircuitState.CLOSED:
            logger.info("Circuit for '%s' CLOSED (recovered)", agent_name)
        circuit.state = CircuitState.CLOSED
        circuit.failure_count = 0
        circuit.first_failure_time = 0.0
        circuit.last_failure_time = 0.0
        circuit.half_open_attempts = 0

    def record_failure(self, agent_name: str) -> None:
        """Record a failed call -- may open the circuit."""
        circuit = self._get_circuit(agent_name)
        now = time.monotonic()

        if circuit.state == CircuitState.HALF_OPEN:
            circuit.half_open_attempts += 1
            self._open_circuit(circuit, now)
            return

        # Reset window if first failure was too long ago
        if (
            circuit.first_failure_time > 0
            and now - circuit.first_failure_time > self.failure_window_seconds
        ):
            circuit.failure_count = 0
            circuit.first_failure_time = now

        if circuit.failure_count == 0:
            circuit.first_failure_time = now

        circuit.failure_count += 1
        circuit.last_failure_time = now

        if circuit.failure_count >= self.failure_threshold:
            self._open_circuit(circuit, now)

    def get_state(self, agent_name: str) -> CircuitState:
        return self._get_circuit(agent_name).state

    def reset(self, agent_name: str) -> None:
        """Manually reset the circuit for an agent."""
        self._circuits.pop(agent_name, None)
        logger.info("Circuit for '%s' manually reset", agent_name)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_circuit(self, agent_name: str) -> _AgentCircuit:
        if agent_name not in self._circuits:
            self._circuits[agent_name] = _AgentCircuit(agent_name=agent_name)
        return self._circuits[agent_name]

    def _open_circuit(self, circuit: _AgentCircuit, now: float) -> None:
        circuit.state = CircuitState.OPEN
        circuit.opened_at = now
        logger.warning(
            "Circuit for '%s' OPENED after %d failures",
            circuit.agent_name,
            circuit.failure_count,
        )
