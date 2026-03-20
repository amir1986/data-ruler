"""Pipeline router - orchestrate multi-agent pipelines."""

from uuid import uuid4

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from models.schemas import AgentMessage, AgentMessageType, Priority

router = APIRouter()


class PipelineRequest(BaseModel):
    message: str
    user_id: str
    file_id: str | None = None
    schema_context: str | None = None
    action: str | None = None


class QueryRequest(BaseModel):
    query: str
    user_id: str
    schema_context: str | None = None


@router.post("/orchestrate")
async def orchestrate(req: PipelineRequest, request: Request):
    """Run a full orchestration pipeline for a user request."""
    registry = request.app.state.agent_registry
    orchestrator = registry.get("orchestrator")
    if not orchestrator:
        raise HTTPException(500, "Orchestrator agent not registered")

    message = AgentMessage(
        message_id=uuid4(),
        correlation_id=uuid4(),
        message_type=AgentMessageType.REQUEST,
        source_agent="api",
        target_agent="orchestrator",
        priority=Priority.HIGH,
        payload={
            "message": req.message,
            "user_id": req.user_id,
            "file_id": req.file_id,
            "schema_context": req.schema_context or "",
            "action": req.action,
        },
    )

    response = await registry.dispatch(message)
    if not response:
        raise HTTPException(500, "Orchestration failed")

    return response.payload


@router.post("/query")
async def run_query(req: QueryRequest, request: Request):
    """Run a natural language query through the SQL agent."""
    registry = request.app.state.agent_registry

    message = AgentMessage(
        message_id=uuid4(),
        correlation_id=uuid4(),
        message_type=AgentMessageType.REQUEST,
        source_agent="api",
        target_agent="sql_agent",
        payload={
            "message": req.query,
            "user_id": req.user_id,
            "schema_context": req.schema_context or "",
        },
    )

    response = await registry.dispatch(message)
    if not response:
        raise HTTPException(500, "Query execution failed")

    return response.payload


@router.post("/analyze")
async def analyze_data(req: PipelineRequest, request: Request):
    """Run analytics pipeline on user data."""
    registry = request.app.state.agent_registry

    message = AgentMessage(
        message_id=uuid4(),
        correlation_id=uuid4(),
        message_type=AgentMessageType.REQUEST,
        source_agent="api",
        target_agent="analytics",
        payload={
            "user_id": req.user_id,
            "file_id": req.file_id,
            "message": req.message,
        },
    )

    response = await registry.dispatch(message)
    if not response:
        raise HTTPException(500, "Analysis failed")

    return response.payload


@router.post("/visualize")
async def visualize_data(req: PipelineRequest, request: Request):
    """Generate visualization for user data."""
    registry = request.app.state.agent_registry

    message = AgentMessage(
        message_id=uuid4(),
        correlation_id=uuid4(),
        message_type=AgentMessageType.REQUEST,
        source_agent="api",
        target_agent="visualization",
        payload={
            "user_id": req.user_id,
            "file_id": req.file_id,
            "chart_request": req.message,
            "schema_context": req.schema_context or "",
        },
    )

    response = await registry.dispatch(message)
    if not response:
        raise HTTPException(500, "Visualization failed")

    return response.payload
