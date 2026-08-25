"""
CodePilot RAG — Database and Memory Service
Initializes Beanie (MongoDB) and manages conversation history.
"""
import logging
from typing import Any
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from pymongo import MongoClient

from app.config import get_settings
from app.models.db_models import Repository, Thread, Message, Job, User

settings = get_settings()
logger = logging.getLogger("copilot-rag.memory")


async def _drop_legacy_user_indexes(database) -> None:
    """Remove pre-existing non-sparse unique indexes on the users collection.

    Earlier versions declared `github_id` with Indexed(int, unique=True), which
    produced a plain unique index named `github_id_1`. That index treats every
    missing value as the same null, so once `github_id` became optional it would
    reject the SECOND email-only signup with a duplicate-key error.

    MongoDB cannot change an index's options in place, so the old one is dropped
    and Beanie recreates the sparse replacement on the next line. Dropping is
    safe: uniqueness is immediately re-established by the new index.
    """
    try:
        existing = await database["users"].index_information()
    except Exception as exc:  # collection may not exist yet on a fresh install
        logger.debug("Could not read user indexes (fresh database?): %s", exc)
        return

    for name, spec in existing.items():
        if name == "_id_":
            continue
        keys = [k for k, _ in spec.get("key", [])]
        if keys not in (["github_id"], ["email_lower"]):
            continue
        if not spec.get("unique"):
            continue
        # Keep only indexes that exclude nulls via a partial filter. Plain and
        # sparse unique indexes both index explicit nulls, which blocks the
        # second account that leaves the field unset.
        if "partialFilterExpression" in spec:
            continue
        try:
            await database["users"].drop_index(name)
            logger.info("Dropped unique index '%s' that would index nulls", name)
        except Exception as exc:
            logger.warning("Could not drop index '%s': %s", name, exc)


async def init_db() -> None:
    """Initialize MongoDB connection and Beanie ODM."""
    client = AsyncIOMotorClient(settings.mongodb_url)
    database = client[settings.mongodb_db_name]

    await _drop_legacy_user_indexes(database)

    await init_beanie(
        database=database,
        document_models=[Repository, Thread, Message, Job, User],
    )


class MemoryService:
    """Manages thread-based chat history and repository statistics in MongoDB."""

    @staticmethod
    async def create_thread(repo_id: str, title: str | None = None) -> Thread:
        """Create a new conversation thread for a repository."""
        thread = Thread(repo_id=repo_id, title=title)
        await thread.insert()
        return thread

    @staticmethod
    async def add_message(
        thread_id: str,
        repo_id: str,
        role: str,
        content: str,
        mode: str | None = None,
        citations: list[dict[str, Any]] | None = None,
        patch: str | None = None,
        plan: str | None = None,
        tokens_used: int | None = None,
        latency_ms: float | None = None,
    ) -> Message:
        """Append a message to a thread and update message counters."""
        citations = citations or []
        message = Message(
            thread_id=thread_id,
            repo_id=repo_id,
            role=role,
            content=content,
            mode=mode,
            citations=citations,
            patch=patch,
            plan=plan,
            tokens_used=tokens_used,
            latency_ms=latency_ms,
        )
        await message.insert()

        # Update Thread info
        thread = await Thread.find_one(Thread.thread_id == thread_id)
        if thread:
            thread.message_count += 1
            thread.updated_at = message.created_at
            if not thread.title and role == "user":
                # Create a simple title from the first query
                words = content.split()
                thread.title = " ".join(words[:5]) + ("..." if len(words) > 5 else "")
            await thread.save()

        return message

    @staticmethod
    async def get_messages(thread_id: str) -> list[Message]:
        """Fetch all messages inside a thread ordered by creation date."""
        return await Message.find(Message.thread_id == thread_id).sort(+Message.created_at).to_list()

    @staticmethod
    async def get_threads(repo_id: str) -> list[Thread]:
        """Fetch all threads for a given repository."""
        return await Thread.find(Thread.repo_id == repo_id).sort(-Thread.updated_at).to_list()

    @staticmethod
    async def delete_thread(thread_id: str) -> None:
        """Delete a thread and all of its messages."""
        await Message.find(Message.thread_id == thread_id).delete()
        await Thread.find_one(Thread.thread_id == thread_id).delete()
