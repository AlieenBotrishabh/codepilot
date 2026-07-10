"""
CodePilot RAG — MongoDB Document Models (Beanie ODM)
"""
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from beanie import Document, Indexed
from pydantic import Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Repository ────────────────────────────────────────────────────────────────

class Repository(Document):
    """Stores metadata about an indexed code repository."""
    repo_id: Indexed(str, unique=True) = Field(default_factory=lambda: str(uuid4()))
    name: str
    description: str | None = None
    source_type: Literal["zip", "github_url", "local"] = "zip"
    source_url: str | None = None  # GitHub URL if applicable
    file_count: int = 0
    chunk_count: int = 0
    languages: list[str] = []
    status: Literal["indexing", "ready", "error"] = "indexing"
    error_message: str | None = None
    upload_path: str | None = None  # path to uploaded file/dir
    created_at: datetime = Field(default_factory=utcnow)
    indexed_at: datetime | None = None

    class Settings:
        name = "repositories"
        indexes = [
            [("repo_id", 1)],
            [("status", 1)],
            [("created_at", -1)],
        ]


# ── Thread ────────────────────────────────────────────────────────────────────

class Thread(Document):
    """Conversation thread associated with a repository."""
    thread_id: Indexed(str, unique=True) = Field(default_factory=lambda: str(uuid4()))
    repo_id: Indexed(str)
    title: str | None = None
    message_count: int = 0
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "threads"


# ── Message ───────────────────────────────────────────────────────────────────

class Message(Document):
    """Individual message in a conversation thread."""
    message_id: str = Field(default_factory=lambda: str(uuid4()))
    thread_id: Indexed(str)
    repo_id: str
    role: Literal["user", "assistant"]
    content: str
    mode: str | None = None
    citations: list[dict[str, Any]] = []
    patch: str | None = None
    plan: str | None = None
    tokens_used: int | None = None
    latency_ms: float | None = None
    created_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "messages"
        indexes = [
            [("thread_id", 1), ("created_at", 1)],
        ]


# ── Job ───────────────────────────────────────────────────────────────────────

class Job(Document):
    """Background job for async operations (ingestion, etc.)."""
    job_id: Indexed(str, unique=True) = Field(default_factory=lambda: str(uuid4()))
    job_type: str  # "ingestion", "patch_generation"
    status: Literal["pending", "running", "completed", "failed"] = "pending"
    progress: float = 0.0  # 0.0 to 1.0
    message: str | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    metadata: dict[str, Any] = {}
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "jobs"
