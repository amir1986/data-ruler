"""Pydantic models shared across the AI service."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ProcessingStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class AgentMessageType(str, Enum):
    REQUEST = "request"
    RESPONSE = "response"
    ERROR = "error"
    STATUS = "status"


class Priority(int, Enum):
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


# ---------------------------------------------------------------------------
# File handling
# ---------------------------------------------------------------------------

class FileMetadata(BaseModel):
    file_id: UUID = Field(default_factory=uuid4)
    filename: str
    content_type: str
    size_bytes: int
    upload_time: datetime = Field(default_factory=datetime.utcnow)
    sha256: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


class FileUploadResponse(BaseModel):
    file_id: UUID
    filename: str
    content_type: str
    size_bytes: int
    message: str = "File uploaded successfully"


# ---------------------------------------------------------------------------
# Processing
# ---------------------------------------------------------------------------

class ProcessingTask(BaseModel):
    task_id: UUID = Field(default_factory=uuid4)
    file_id: UUID
    agent_name: str
    status: ProcessingStatus = ProcessingStatus.PENDING
    progress: float = 0.0
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context_id: UUID | None = None
    model: str = "llama3"
    temperature: float = 0.7
    max_tokens: int = 2048


class ChatResponse(BaseModel):
    message: ChatMessage
    context_id: UUID
    usage: dict[str, int] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class WidgetConfig(BaseModel):
    widget_id: UUID = Field(default_factory=uuid4)
    widget_type: str  # e.g. "chart", "table", "stat"
    title: str
    data_source: str
    config: dict[str, Any] = Field(default_factory=dict)
    position: dict[str, int] = Field(default_factory=dict)  # x, y, w, h


class DashboardConfig(BaseModel):
    dashboard_id: UUID = Field(default_factory=uuid4)
    name: str
    widgets: list[WidgetConfig] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Notes
# ---------------------------------------------------------------------------

class NoteCreate(BaseModel):
    title: str
    content: str
    tags: list[str] = Field(default_factory=list)


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    tags: list[str] | None = None


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    sql: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    limit: int = 1000


class QueryResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    execution_time_ms: float


# ---------------------------------------------------------------------------
# Agent communication protocol
# ---------------------------------------------------------------------------

class AgentMessage(BaseModel):
    """Structured message envelope for inter-agent communication."""

    message_id: UUID = Field(default_factory=uuid4)
    correlation_id: UUID = Field(default_factory=uuid4)
    message_type: AgentMessageType
    source_agent: str
    target_agent: str
    priority: Priority = Priority.NORMAL
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ttl_seconds: int = 300


# ---------------------------------------------------------------------------
# Auth / Users
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: str
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    user_id: UUID
    username: str
    email: str
    created_at: datetime
