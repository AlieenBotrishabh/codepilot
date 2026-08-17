"""
CodePilot RAG — Application Configuration
Loads settings from environment variables / .env file
"""
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=["../.env", ".env"],
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


    # ── Application ─────────────────────────────────────────────
    app_name: str = "CodePilot RAG"
    app_version: str = "1.0.0"
    debug: bool = False
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    secret_key: str = "change-me-in-production"

    cors_origins: str | list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Optional regex for origins that cannot be enumerated ahead of time —
    # Vercel preview deployments get a fresh random hostname per build.
    # Empty string disables regex matching entirely.
    #
    # Keep this tightly scoped. CORS runs with allow_credentials=True, so a
    # broad pattern like https://.*\.vercel\.app would let ANY Vercel-hosted
    # site make credentialed calls to this API.
    cors_origin_regex: str = ""


    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # ── LLM Provider ────────────────────────────────────────────
    llm_provider: Literal["gemini", "openai"] = "gemini"
    google_api_key: str = ""
    openai_api_key: str = ""
    gemini_model: str = "gemini-1.5-pro"
    openai_model: str = "gpt-4o"

    # ── Embeddings ──────────────────────────────────────────────
    embedding_model: str = "models/text-embedding-004"

    # ── ChromaDB ────────────────────────────────────────────────
    chroma_host: str = "localhost"
    chroma_port: int = 8001
    chroma_persist_dir: str = "./chroma_data"

    # ── MongoDB ─────────────────────────────────────────────────
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "copilot_rag"

    # ── File Upload ─────────────────────────────────────────────
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 100

    # ── GitHub ──────────────────────────────────────────────────
    github_token: str = ""

    # ── Security ────────────────────────────────────────────────
    # When empty, authentication is DISABLED and every endpoint is public
    # (the original behaviour, so local development is unchanged).
    # Set this in any deployment reachable from the internet.
    api_key: str = ""

    # Chat is the public demo surface, so it stays open by default and is
    # protected only by the per-IP rate limiter. Flip this on to require the
    # API key for chat too — e.g. if LLM quota is being drained.
    protect_chat: bool = False

    # /repos/local reads an arbitrary directory from the SERVER's filesystem.
    # That is fine on a developer machine and is a directory-disclosure
    # primitive on a hosted instance. Disable it in production.
    allow_local_ingest: bool = True

    # Optional containment: when set, /repos/local only accepts paths inside
    # this directory. Ignored when allow_local_ingest is False.
    local_ingest_root: str = ""

    # ── Ingestion ───────────────────────────────────────────────
    chunk_size: int = 1000
    chunk_overlap: int = 200
    max_chunks_per_file: int = 50
    retrieval_k: int = 8  # Number of chunks to retrieve

    # ── Retrieval quality ───────────────────────────────────────
    # Minimum relevance score (0..1, higher is better) a chunk must reach to
    # be used as grounding context. Chunks below this are discarded, and if
    # NOTHING clears the bar the agent refuses to answer instead of inventing
    # one. Raise for stricter grounding, lower for more recall.
    #
    # Calibrated against gemini-embedding-2 on a small web project:
    #   on-topic query  -> chunks scored 0.46 - 0.52
    #   off-topic query -> chunks scored 0.216 - 0.236
    # 0.35 sits in that gap. This is a limited sample, so treat it as a
    # starting point: if legitimate questions start getting refused, lower it;
    # if unrelated chunks keep slipping through, raise it. Changing the
    # embedding model invalidates this number entirely.
    retrieval_min_score: float = 0.35

    # Maximum number of distinct files cited back to the user.
    max_citations: int = 6

    # ── Agent ───────────────────────────────────────────────────
    max_iterations: int = 5
    agent_temperature: float = 0.1

    @property
    def chroma_http_url(self) -> str:
        return f"http://{self.chroma_host}:{self.chroma_port}"

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
