"""Agent management router - list, inspect, and control agents."""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter()


@router.get("/")
async def list_agents(request: Request):
    """List all registered agents with their status."""
    registry = request.app.state.agent_registry
    return {"agents": registry.list_agents()}


@router.get("/{agent_name}")
async def get_agent(agent_name: str, request: Request):
    """Get details for a specific agent."""
    registry = request.app.state.agent_registry
    agent = registry.get(agent_name)
    if not agent:
        raise HTTPException(404, f"Agent '{agent_name}' not found")

    breaker = request.app.state.circuit_breaker
    budget = request.app.state.token_budget

    return {
        "name": agent.agent_name,
        "description": agent.description,
        "circuit_state": breaker.get_state(agent_name).value,
        "tokens_remaining": budget.remaining(agent_name),
        "max_retries": agent.max_retries,
    }


class AgentResetRequest(BaseModel):
    agent_name: str


@router.post("/reset-circuit")
async def reset_circuit(req: AgentResetRequest, request: Request):
    """Reset the circuit breaker for an agent."""
    breaker = request.app.state.circuit_breaker
    breaker.reset(req.agent_name)
    return {"status": "reset", "agent": req.agent_name}
