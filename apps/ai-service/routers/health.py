"""Health check router with detailed system status."""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
@router.get("/api/health")
async def health(request: Request):
    from services.ollama_client import get_client

    client = get_client()
    llm_status = await client.health_check()

    registry = getattr(request.app.state, "agent_registry", None)
    agents = registry.list_agents() if registry else []

    budget = getattr(request.app.state, "token_budget", None)

    return {
        "status": "ok",
        "cloud_llm": llm_status,
        "agents": {
            "registered": len(agents),
            "available": sum(1 for a in agents if a["available"]),
        },
        "token_budget": {
            "global_remaining": budget.remaining_global() if budget else 0,
            "usage": budget.usage_summary() if budget else {},
        },
    }
