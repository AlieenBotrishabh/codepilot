"""
CodePilot RAG — Job Queue Service
Manages simple background jobs using FastAPI's background tasks
to avoid heavy Celery/Redis setups if running in basic Docker environments.
"""
from datetime import datetime, timezone
from typing import Callable, Coroutine, Any
from fastapi import BackgroundTasks
import asyncio

from app.models.db_models import Job


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobQueueService:
    """Simple background job scheduler updating progress in MongoDB."""

    @staticmethod
    async def create_job(job_type: str, metadata: dict[str, Any] | None = None) -> Job:
        """Initialize a new Job document in MongoDB."""
        job = Job(
            job_type=job_type,
            status="pending",
            progress=0.0,
            metadata=metadata or {},
        )
        await job.insert()
        return job

    @staticmethod
    def start_job(
        background_tasks: BackgroundTasks,
        job_id: str,
        task_func: Callable[[str, Any], Coroutine[Any, Any, None]],
        *args,
        **kwargs
    ) -> None:
        """Enqueues job execution in FastAPI BackgroundTasks."""
        background_tasks.add_task(JobQueueService._run_wrapper, job_id, task_func, *args, **kwargs)

    @staticmethod
    async def _run_wrapper(
        job_id: str,
        task_func: Callable[[str, Any], Coroutine[Any, Any, None]],
        *args,
        **kwargs
    ) -> None:
        """Wrapper around worker function to ensure DB state updates."""
        job = await Job.find_one(Job.job_id == job_id)
        if not job:
            return

        job.status = "running"
        job.updated_at = utcnow()
        await job.save()

        try:
            await task_func(job_id, *args, **kwargs)
        except Exception as e:
            job = await Job.find_one(Job.job_id == job_id)
            if job:
                job.status = "failed"
                job.error = str(e)
                job.updated_at = utcnow()
                await job.save()
