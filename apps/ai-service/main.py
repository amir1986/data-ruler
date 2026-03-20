"""Data Ruler AI Service - FastAPI application with full agent orchestration."""

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.message_bus import MessageBus
from core.context_store import ContextStore
from core.circuit_breaker import CircuitBreaker
from core.token_budget import TokenBudgetManager
from core.agent_registry import AgentRegistry

logger = logging.getLogger("ai-service")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# Shared singletons
message_bus: MessageBus | None = None
context_store: ContextStore | None = None
agent_registry: AgentRegistry | None = None


def _register_all_agents(registry: AgentRegistry) -> None:
    """Register all specialist agents with the registry."""
    from agents.file_detection import FileDetectionAgent
    from agents.tabular_processor import TabularProcessorAgent
    from agents.document_processor import DocumentProcessorAgent
    from agents.database_importer import DatabaseImporterAgent
    from agents.media_processor import MediaProcessorAgent
    from agents.archive_processor import ArchiveProcessorAgent
    from agents.structured_data import StructuredDataAgent
    from agents.specialized_format import SpecializedFormatAgent
    from agents.schema_inference import SchemaInferenceAgent
    from agents.relationship_mining import RelationshipMiningAgent
    from agents.storage_router import StorageRouterAgent
    from agents.analytics import AnalyticsAgent
    from agents.visualization import VisualizationAgent
    from agents.sql_agent import SQLAgent
    from agents.document_qa import DocumentQAAgent
    from agents.cross_modal import CrossModalAgent
    from agents.export_agent import ExportAgent
    from agents.validation_security import ValidationSecurityAgent
    from agents.scheduler import SchedulerAgent
    from agents.orchestrator import OrchestratorAgent

    # Register all agents with capabilities
    registry.register(FileDetectionAgent(), capabilities=["detection", "file"])
    registry.register(TabularProcessorAgent(), capabilities=["processing", "tabular"])
    registry.register(DocumentProcessorAgent(), capabilities=["processing", "document"])
    registry.register(DatabaseImporterAgent(), capabilities=["processing", "database"])
    registry.register(MediaProcessorAgent(), capabilities=["processing", "media"])
    registry.register(ArchiveProcessorAgent(), capabilities=["processing", "archive"])
    registry.register(StructuredDataAgent(), capabilities=["processing", "structured"])
    registry.register(SpecializedFormatAgent(), capabilities=["processing", "specialized"])
    registry.register(SchemaInferenceAgent(), capabilities=["analysis", "schema"])
    registry.register(RelationshipMiningAgent(), capabilities=["analysis", "relationships"])
    registry.register(StorageRouterAgent(), capabilities=["storage"])
    registry.register(AnalyticsAgent(), capabilities=["analysis", "statistics"])
    registry.register(VisualizationAgent(), capabilities=["visualization", "charts"])
    registry.register(SQLAgent(), capabilities=["query", "sql"])
    registry.register(DocumentQAAgent(), capabilities=["qa", "chat"])
    registry.register(CrossModalAgent(), capabilities=["qa", "cross_modal"])
    registry.register(ExportAgent(), capabilities=["export"])
    registry.register(ValidationSecurityAgent(), capabilities=["security", "validation"])
    registry.register(SchedulerAgent(), capabilities=["scheduling"])

    # Orchestrator with registry reference
    orchestrator = OrchestratorAgent(registry=registry)
    registry.register(orchestrator, capabilities=["orchestration"])

    logger.info("Registered %d agents", len(registry.list_agents()))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    global message_bus, context_store, agent_registry

    logger.info("Starting AI service …")

    # Core infrastructure
    message_bus = MessageBus()
    context_store = ContextStore()

    # Agent orchestration
    breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=60)
    budget = TokenBudgetManager(global_budget=2_000_000, per_agent_budget=400_000)
    agent_registry = AgentRegistry(message_bus, breaker, budget)

    # Register all agents
    _register_all_agents(agent_registry)

    # Expose via app.state
    app.state.message_bus = message_bus
    app.state.context_store = context_store
    app.state.agent_registry = agent_registry
    app.state.circuit_breaker = breaker
    app.state.token_budget = budget

    # Start message bus dispatch loop
    message_bus.start()

    # Check cloud LLM connectivity
    from services.ollama_client import health_check
    llm_ok = await health_check()
    logger.info("Cloud LLM status: %s", "connected" if llm_ok else "unavailable")

    yield

    logger.info("Shutting down AI service …")
    await message_bus.shutdown()


app = FastAPI(
    title="Data Ruler AI Service",
    description="AI-powered data management platform with cloud LLM orchestration",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
from routers.files import router as files_router
from routers.chat import router as chat_router
from routers.health import router as health_router
from routers.agents import router as agents_router
from routers.pipelines import router as pipelines_router

app.include_router(health_router, tags=["health"])
app.include_router(files_router, prefix="/api/files", tags=["files"])
app.include_router(chat_router, prefix="/api/chat", tags=["chat"])
app.include_router(agents_router, prefix="/api/agents", tags=["agents"])
app.include_router(pipelines_router, prefix="/api/pipelines", tags=["pipelines"])

logger.info("All routers loaded successfully")
