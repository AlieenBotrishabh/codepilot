"""
CodePilot RAG — FastAPI Main Entrypoint
"""
import sys
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import chromadb

from app.config import get_settings
from app.services.memory import init_db
from app.services.vectorstore import get_chroma_client
from app.api.routes import repo, chat, patch, jobs
from app.models.schemas import HealthResponse

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("copilot-rag")

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    logger.info("Initializing MongoDB connection and Beanie ODM...")
    try:
        await init_db()
        logger.info("MongoDB initialized successfully.")
    except Exception as e:
        logger.error(f"MongoDB initialization failed: {e}")
        sys.exit(1)

    logger.info("Testing ChromaDB connection...")
    try:
        client = get_chroma_client()
        client.heartbeat()
        logger.info("ChromaDB connection successful.")
    except Exception as e:
        logger.error(f"ChromaDB connection failed: {e}")

    yield

    # Shutdown actions
    logger.info("Shutting down application...")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Autonomous coding copilot with RAG and multi-agent workflows.",
    lifespan=lifespan
)

# CORS Middleware config
#
# An origin is allowed if it is in the explicit list OR matches the regex.
# The regex covers Vercel preview deployments, whose hostnames are generated
# per build and so cannot be listed up front. Starlette applies re.fullmatch,
# so the pattern must describe the entire origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info(
    "CORS allow-list: %s | regex: %s",
    settings.cors_origins,
    settings.cors_origin_regex or "(disabled)",
)

# Include API endpoints routers
app.include_router(repo.router)
app.include_router(chat.router)
app.include_router(patch.router)
app.include_router(jobs.router)


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Health check validating backend, DB, and ChromaDB availability."""
    services = {
        "mongodb": "ok",
        "chromadb": "ok"
    }

    # Verify MongoDB via Beanie
    from app.models.db_models import Repository
    try:
        await Repository.count()
    except Exception:
        services["mongodb"] = "error"

    # Verify Chroma DB connection
    try:
        client = get_chroma_client()
        client.heartbeat()
    except Exception:
        services["chromadb"] = "error"

    overall_status = "ok" if all(v == "ok" for v in services.values()) else "error"

    return HealthResponse(
        status=overall_status,
        version=settings.app_version,
        services=services
    )


@app.get("/", tags=["System"])
async def root():
    return {
        "app": settings.app_name,
        "version": settings.app_version,
        "docs_url": "/docs",
        "health_url": "/health"
    }
