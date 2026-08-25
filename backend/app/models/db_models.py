"""
CodePilot RAG — MongoDB Document Models (Beanie ODM)
"""
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from beanie import Document, Indexed
from pydantic import Field
from pymongo import ASCENDING, IndexModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── User ──────────────────────────────────────────────────────────────────────

class User(Document):
    """An account, created either by email/password or by GitHub OAuth.

    A person can end up with both credentials on ONE record: signing in with
    GitHub while an email account already exists with the same verified address
    links the two rather than creating a duplicate. `auth_provider` records how
    the account was first created, not what it can currently use.

    The GitHub access token is stored ENCRYPTED (Fernet, keyed off the app
    secret) because it can read private repositories. Rotating the secret makes
    stored tokens undecryptable, which surfaces as "reconnect GitHub".
    """
    user_id: str = Field(default_factory=lambda: str(uuid4()))
    auth_provider: Literal["github", "email"] = "github"

    # ── Email identity ──────────────────────────────────────────
    # `email_lower` is the uniqueness key. Addresses are case-insensitive in
    # practice, so storing a normalised copy prevents Bob@x.com and bob@x.com
    # from becoming two accounts, while `email` keeps what the user typed.
    email: str | None = None
    email_lower: str | None = None
    password_hash: str | None = None

    # ── GitHub identity ─────────────────────────────────────────
    # Absent on email-only accounts, which is why the index below is sparse:
    # a plain unique index treats every missing value as the same null and
    # would reject the second password-only signup.
    github_id: int | None = None
    encrypted_github_token: str | None = None
    github_scopes: str | None = None

    # ── Profile ─────────────────────────────────────────────────
    login: str                      # display handle (GitHub username or email local-part)
    name: str | None = None
    avatar_url: str | None = None

    created_at: datetime = Field(default_factory=utcnow)
    last_login_at: datetime = Field(default_factory=utcnow)

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)

    @property
    def has_github(self) -> bool:
        return self.github_id is not None

    class Settings:
        name = "users"
        # Declared explicitly rather than via Indexed() annotations so the
        # sparse flag can be set. Names are explicit so a future change to the
        # options does not silently collide with an auto-generated name.
        indexes = [
            IndexModel([("user_id", ASCENDING)], unique=True, name="uq_user_id"),
            # partialFilterExpression, NOT sparse. Pydantic writes an explicit
            # `null` for an unset optional field, and a sparse index happily
            # indexes nulls — so two password-only accounts would both store
            # github_id: null and collide. Filtering on type means only real
            # values participate in the uniqueness constraint.
            IndexModel([("github_id", ASCENDING)], unique=True,
                       name="uq_github_id_partial",
                       partialFilterExpression={"github_id": {"$type": "number"}}),
            IndexModel([("email_lower", ASCENDING)], unique=True,
                       name="uq_email_lower_partial",
                       partialFilterExpression={"email_lower": {"$type": "string"}}),
        ]


# ── Repository ────────────────────────────────────────────────────────────────

class Repository(Document):
    """Stores metadata about an indexed code repository."""
    repo_id: Indexed(str, unique=True) = Field(default_factory=lambda: str(uuid4()))
    name: str
    description: str | None = None
    source_type: Literal["zip", "github_url", "local"] = "zip"
    source_url: str | None = None  # GitHub URL if applicable

    # Owning user. None means "created before auth existed, or created while
    # AUTH_REQUIRED was off" — such rows stay visible to everyone so enabling
    # auth never silently orphans existing data.
    owner_id: str | None = None
    is_private: bool = False        # cloned from a private GitHub repo
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
            [("owner_id", 1), ("created_at", -1)],
        ]


# ── Thread ────────────────────────────────────────────────────────────────────

class Thread(Document):
    """Conversation thread associated with a repository."""
    thread_id: Indexed(str, unique=True) = Field(default_factory=lambda: str(uuid4()))
    repo_id: Indexed(str)
    owner_id: str | None = None     # see Repository.owner_id
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
