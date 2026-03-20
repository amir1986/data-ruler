"""Data Ruler AI Service - FastAPI application entry point."""

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.message_bus import MessageBus
from core.context_store import ContextStore

logger = logging.getLogger("ai-service")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# Shared singletons initialised during lifespan
message_bus: MessageBus | None = None
context_store: ContextStore | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    global message_bus, context_store

    logger.info("Starting AI service …")
    message_bus = MessageBus()
    context_store = ContextStore()

    # Expose via app.state so routers can access them
    app.state.message_bus = message_bus
    app.state.context_store = context_store

    yield

    logger.info("Shutting down AI service …")
    await message_bus.shutdown()


app = FastAPI(
    title="Data Ruler AI Service",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
try:
    from routers.files import router as files_router
    from routers.chat import router as chat_router
    from routers.health import router as health_router
    app.include_router(files_router, prefix="/api/files", tags=["files"])
    app.include_router(chat_router, prefix="/api/chat", tags=["chat"])
    app.include_router(health_router, tags=["health"])
    logger.info("All routers loaded successfully")
except ImportError as e:
    logger.warning(f"Some routers not yet available: {e}")


@app.get("/health")
async def health_check():
    """Basic health check endpoint."""
    from services.ollama_client import health_check as ollama_health
    ollama_ok = await ollama_health()
    return {
        "status": "ok",
        "ollama": "connected" if ollama_ok else "unavailable",
    }
