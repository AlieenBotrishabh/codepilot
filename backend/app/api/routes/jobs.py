"""
CodePilot RAG — Job Status Routes
Provides polling capability for background worker jobs (ingestion, processing).
"""
from fastapi import APIRouter, HTTPException, status
from app.models.db_models import Job
from app.models.schemas import JobStatus

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get("/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """Retrieve status and progress of an active background task."""
    job = await Job.find_one(Job.job_id == job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found."
        )

    return JobStatus(
        job_id=job.job_id,
        status=job.status,
        progress=job.progress,
        message=job.message,
        result=job.result,
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at
    )
