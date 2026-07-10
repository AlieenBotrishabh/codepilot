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


    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
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

    # ── Ingestion ───────────────────────────────────────────────
    chunk_size: int = 1000
    chunk_overlap: int = 200
    max_chunks_per_file: int = 50
    retrieval_k: int = 8  # Number of chunks to retrieve

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
