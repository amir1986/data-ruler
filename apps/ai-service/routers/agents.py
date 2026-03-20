"""Agent management router - list, inspect, control, and observe agents."""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter()


@router.get("/")
async def list_agents(request: Request):
    """List all registered agents with their status and metrics."""
    registry = request.app.state.agent_registry
    return {"agents": registry.list_agents()}


@router.get("/metrics")
async def get_all_metrics(request: Request):
    """Get execution metrics for all agents."""
    registry = request.app.state.agent_registry
    return {"metrics": registry.get_all_metrics()}


@router.get("/bus-stats")
async def get_bus_stats(request: Request):
    """Get message bus operational statistics."""
    bus = request.app.state.message_bus
    return {"bus": bus.stats(), "dead_letters": bus.dead_letters.recent(20)}


@router.get("/{agent_name}")
async def get_agent(agent_name: str, request: Request):
    """Get details for a specific agent, including contract and metrics."""
    registry = request.app.state.agent_registry
    agent = registry.get(agent_name)
    if not agent:
        raise HTTPException(404, f"Agent '{agent_name}' not found")

    breaker = request.app.state.circuit_breaker
    budget = request.app.state.token_budget

    return {
        **agent.info(),
        "circuit_state": breaker.get_state(agent_name).value,
        "tokens_remaining": budget.remaining(agent_name),
        "metrics": registry.get_metrics(agent_name),
    }


class AgentResetRequest(BaseModel):
    agent_name: str


@router.post("/reset-circuit")
async def reset_circuit(req: AgentResetRequest, request: Request):
    """Reset the circuit breaker for an agent."""
    breaker = request.app.state.circuit_breaker
    breaker.reset(req.agent_name)
    return {"status": "reset", "agent": req.agent_name}
