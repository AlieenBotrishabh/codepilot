"""
CodePilot RAG — Pydantic Schemas (API Request / Response Models)
"""
from datetime import datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


# ── Repo Schemas ─────────────────────────────────────────────────────────────

class RepoUploadResponse(BaseModel):
    repo_id: str
    name: str
    job_id: str
    message: str = "Repository ingestion started"


class LocalRepoIngestRequest(BaseModel):
    path: str = Field(..., description="Absolute local directory path of the codebase to ingest")


class RepoInfo(BaseModel):
    repo_id: str
    name: str
    description: str | None = None
    file_count: int
    chunk_count: int
    languages: list[str]
    status: Literal["indexing", "ready", "error"]
    created_at: datetime
    indexed_at: datetime | None = None


class RepoListResponse(BaseModel):
    repos: list[RepoInfo]
    total: int


# ── Chat Schemas ─────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=5000, description="Developer question or task")
    repo_id: str = Field(..., description="Target repository ID")
    thread_id: str = Field(default_factory=lambda: str(uuid4()), description="Conversation thread ID")
    mode: Literal["auto", "question", "debug", "patch", "review", "architecture"] = Field(
        default="auto", description="Agent mode (auto = classify automatically)"
    )


class Citation(BaseModel):
    file_path: str
    start_line: int | None = None
    end_line: int | None = None
    snippet: str
    score: float


class ChatResponse(BaseModel):
    thread_id: str
    query: str
    mode: str  # resolved mode after classification
    answer: str
    citations: list[Citation]
    plan: str | None = None
    patch: str | None = None
    verified: bool
    tokens_used: int | None = None
    latency_ms: float | None = None


# ── Patch Schemas ─────────────────────────────────────────────────────────────

class PatchRequest(BaseModel):
    description: str = Field(..., description="What change to implement")
    repo_id: str
    thread_id: str = Field(default_factory=lambda: str(uuid4()))
    target_files: list[str] = Field(default=[], description="Optional target files to focus on")


class PatchResponse(BaseModel):
    thread_id: str
    patch: str  # unified diff format
    affected_files: list[str]
    explanation: str
    citations: list[Citation]


# ── Job Schemas ───────────────────────────────────────────────────────────────

class JobStatus(BaseModel):
    job_id: str
    status: Literal["pending", "running", "completed", "failed"]
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    message: str | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


# ── Health Schema ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str
    services: dict[str, str]  # service_name -> "ok" | "error"


# ── Apply Patch Schema ────────────────────────────────────────────────────────

class ApplyPatchRequest(BaseModel):
    repo_id: str
    patch: str
