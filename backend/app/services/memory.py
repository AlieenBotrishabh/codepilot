"""
CodePilot RAG — Database and Memory Service
Initializes Beanie (MongoDB) and manages conversation history.
"""
from typing import Any
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from pymongo import MongoClient

from app.config import get_settings
from app.models.db_models import Repository, Thread, Message, Job, User

settings = get_settings()


async def init_db() -> None:
    """Initialize MongoDB connection and Beanie ODM."""
    client = AsyncIOMotorClient(settings.mongodb_url)
    await init_beanie(
        database=client[settings.mongodb_db_name],
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
