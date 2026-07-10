"""
CodePilot RAG — Repository API Routes
Handles file uploads, GitHub repository clone triggers, indexing, list, and delete.
"""
import os
import shutil
from pathlib import Path
from uuid import uuid4

import asyncio
import zipfile
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, HTTPException, status
from pydantic import HttpUrl

from app.config import get_settings
from app.models.db_models import Repository, Job
from app.models.schemas import RepoUploadResponse, RepoListResponse, RepoInfo, LocalRepoIngestRequest
from app.services.job_queue import JobQueueService
from app.services.ingestion import IngestionService
from app.services.vectorstore import get_vectorstore_service

router = APIRouter(prefix="/repos", tags=["Repositories"])
settings = get_settings()
vector_service = get_vectorstore_service()


@router.post("/upload", response_model=RepoUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_repo(
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(None),
    github_url: str | None = Form(None),
):
    """
    Ingest a repository.
    Accepts either an uploaded zip file or a public GitHub repository clone URL.
    """
    if not file and not github_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either a zip file or a github_url must be provided."
        )

    repo_id = str(uuid4())
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # 1. Create Repository DB Record
    repo_name = "unknown"
    source_type = "zip"
    upload_path = None

    if github_url:
        source_type = "github_url"
        # Extract repo name from URL (e.g. https://github.com/user/repo -> repo)
        repo_name = github_url.rstrip("/").split("/")[-1].replace(".git", "")
    elif file:
        if not file.filename.endswith(".zip"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only ZIP archives are supported."
            )
        source_type = "zip"
        repo_name = file.filename.replace(".zip", "")
        upload_path = str(upload_dir / f"{repo_id}.zip")

        # Save uploaded file
        try:
            with open(upload_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save upload: {e}"
            )

    repo = Repository(
        repo_id=repo_id,
        name=repo_name,
        source_type=source_type,
        source_url=github_url,
        upload_path=upload_path,
        status="indexing",
    )
    await repo.insert()

    # 2. Create Job DB Record
    job = await JobQueueService.create_job(
        job_type="ingestion",
        metadata={"repo_id": repo_id, "name": repo_name}
    )

    # 3. Trigger Ingestion in Background
    JobQueueService.start_job(
        background_tasks,
        job.job_id,
        IngestionService.process_ingestion,
        repo_id
    )

    return RepoUploadResponse(
        repo_id=repo_id,
        name=repo_name,
        job_id=job.job_id,
        message="Repository ingestion queued. Indexing has started in the background."
    )


@router.post("/local", response_model=RepoUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_local_path(
    request: LocalRepoIngestRequest,
    background_tasks: BackgroundTasks,
):
    """
    Ingest a repository from a local directory path on the system.
    """
    local_path = Path(request.path)
    if not local_path.exists() or not local_path.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The specified path does not exist or is not a directory."
        )

    repo_id = str(uuid4())
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    repo_name = local_path.name or "local-repo"
    upload_path = str(upload_dir / f"{repo_id}.zip")

    # Zip the directory in a separate thread to avoid blocking FastAPI
    def zip_directory(src_dir: Path, zip_filepath: str):
        # Exclude directories
        exclude_dirs = {".git", "node_modules", "venv", ".next", "__pycache__", ".pytest_cache", ".gemini"}
        # Exclude extensions
        exclude_exts = {".zip", ".tar.gz", ".png", ".jpg", ".jpeg", ".webp", ".pdf", ".pyc"}
        
        with zipfile.ZipFile(zip_filepath, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(src_dir):
                # Modify dirs in-place to skip excluded directories
                dirs[:] = [d for d in dirs if d not in exclude_dirs]
                for file in files:
                    file_path = Path(root) / file
                    if file_path.suffix.lower() in exclude_exts:
                        continue
                    # Skip files that are too large (e.g. > 10MB)
                    try:
                        if file_path.stat().st_size > 10 * 1024 * 1024:
                            continue
                    except OSError:
                        continue
                    
                    rel_path = file_path.relative_to(src_dir)
                    zipf.write(str(file_path), str(rel_path))

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, zip_directory, local_path, upload_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to package local directory: {e}"
        )

    repo = Repository(
        repo_id=repo_id,
        name=repo_name,
        source_type="local_path",
        source_url=str(local_path),
        upload_path=upload_path,
        status="indexing",
    )
    await repo.insert()

    # Create Job DB Record
    job = await JobQueueService.create_job(
        job_type="ingestion",
        metadata={"repo_id": repo_id, "name": repo_name}
    )

    # Trigger Ingestion in Background
    JobQueueService.start_job(
        background_tasks,
        job.job_id,
        IngestionService.process_ingestion,
        repo_id
    )

    return RepoUploadResponse(
        repo_id=repo_id,
        name=repo_name,
        job_id=job.job_id,
        message="Local repository packaged and ingestion started in the background."
    )


@router.get("", response_model=RepoListResponse)
async def list_repos():
    """List all indexed repositories and their status."""
    repos = await Repository.find_all().to_list()
    repo_infos = []

    for r in repos:
        repo_infos.append(RepoInfo(
            repo_id=r.repo_id,
            name=r.name,
            description=r.description,
            file_count=r.file_count,
            chunk_count=r.chunk_count,
            languages=r.languages,
            status=r.status,
            created_at=r.created_at,
            indexed_at=r.indexed_at
        ))

    return RepoListResponse(repos=repo_infos, total=len(repo_infos))


@router.delete("/{repo_id}", status_code=status.HTTP_200_OK)
async def delete_repo(repo_id: str):
    """Delete repository metadata, uploaded zip files, and Chroma collection."""
    repo = await Repository.find_one(Repository.repo_id == repo_id)
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found."
        )

    # 1. Delete Chroma Vector DB Collection
    await vector_service.delete_collection(repo_id)

    # 2. Delete local uploaded file if present
    if repo.upload_path and os.path.exists(repo.upload_path):
        try:
            os.remove(repo.upload_path)
        except Exception:
            pass

    # 3. Delete DB record
    await repo.delete()

    return {"message": f"Repository {repo.name} deleted successfully from all stores."}


@router.get("/{repo_id}/files")
async def list_repo_files(repo_id: str):
    """List all relative file paths within the repository ZIP archive."""
    import zipfile
    repo = await Repository.find_one(Repository.repo_id == repo_id)
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found."
        )
    if not repo.upload_path or not os.path.exists(repo.upload_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository archive does not exist on disk."
        )

    try:
        with zipfile.ZipFile(repo.upload_path, 'r') as z:
            # Filter out directories and metadata files (Mac metadata, git etc.)
            files = []
            for name in z.namelist():
                if name.endswith('/') or '__MACOSX' in name or '.git/' in name or '.github/' in name:
                    continue
                files.append(name)
            return {"files": sorted(files)}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read archive: {e}"
        )


@router.get("/{repo_id}/files/content")
async def get_repo_file_content(repo_id: str, path: str):
    """Retrieve the text content of a specific file within the repository ZIP archive."""
    import zipfile
    repo = await Repository.find_one(Repository.repo_id == repo_id)
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found."
        )
    if not repo.upload_path or not os.path.exists(repo.upload_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository archive does not exist on disk."
        )

    try:
        with zipfile.ZipFile(repo.upload_path, 'r') as z:
            if path not in z.namelist():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"File {path} not found in archive."
                )
            
            with z.open(path) as f:
                content = f.read().decode('utf-8', errors='replace')
                return {"content": content, "path": path}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read file content: {e}"
        )


@router.get("/{repo_id}/download")
async def download_repo_archive(repo_id: str):
    """Download the repository ZIP archive."""
    from fastapi.responses import FileResponse
    repo = await Repository.find_one(Repository.repo_id == repo_id)
    if not repo or not repo.upload_path or not os.path.exists(repo.upload_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository archive not found."
        )
    
    return FileResponse(
        path=repo.upload_path,
        media_type="application/zip",
        filename=f"{repo.name}.zip"
    )
