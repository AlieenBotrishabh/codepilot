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
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, HttpUrl

from app.api.deps import require_api_key, get_current_user, require_user
from app.config import get_settings
from app.models.db_models import Repository, Job, User
from app.models.schemas import RepoUploadResponse, RepoListResponse, RepoInfo, LocalRepoIngestRequest
from app.services.job_queue import JobQueueService
from app.services.ingestion import IngestionService
from app.services.vectorstore import get_vectorstore_service

router = APIRouter(prefix="/repos", tags=["Repositories"])
settings = get_settings()
vector_service = get_vectorstore_service()


# ── Ownership ───────────────────────────────────────────────────────────────
# A repository with owner_id=None predates authentication (or was created while
# AUTH_REQUIRED was off). Those stay readable by everyone so that switching auth
# on never silently orphans existing data. Anything WITH an owner is private to
# that owner.

def _owns(repo: Repository, user: User | None) -> bool:
    if repo.owner_id is None:
        return True
    return user is not None and repo.owner_id == user.user_id


async def _get_owned_repo(repo_id: str, user: User | None) -> Repository:
    """Fetch a repository the caller is allowed to touch.

    Returns 404 rather than 403 for someone else's repository, so the endpoint
    does not confirm that a given repo_id exists to a user who cannot see it.
    """
    repo = await Repository.find_one(Repository.repo_id == repo_id)
    if not repo or not _owns(repo, user):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found.",
        )
    return repo


@router.post(
    "/upload",
    response_model=RepoUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_api_key)],
)
async def upload_repo(
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(None),
    github_url: str | None = Form(None),
    user: User | None = Depends(get_current_user),
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
        owner_id=user.user_id if user else None,
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


@router.post(
    "/local",
    response_model=RepoUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_api_key)],
)
async def ingest_local_path(
    request: LocalRepoIngestRequest,
    background_tasks: BackgroundTasks,
    user: User | None = Depends(get_current_user),
):
    """
    Ingest a repository from a local directory path on the system.

    This reads an arbitrary directory from the SERVER's filesystem. That is the
    intended behaviour on a developer machine, and a directory-disclosure
    primitive on a hosted instance — so it is gated by ALLOW_LOCAL_INGEST and
    can be further confined to a single root via LOCAL_INGEST_ROOT.
    """
    if not settings.allow_local_ingest:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Local path ingestion is disabled on this deployment. "
                "Use a GitHub URL or upload a ZIP archive instead."
            ),
        )

    try:
        local_path = Path(request.path).resolve(strict=True)
    except (OSError, RuntimeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The specified path does not exist or is not a directory."
        )

    # Confinement check. resolve() above collapses '..' and symlinks first, so
    # a traversal like /allowed/../../etc cannot escape the configured root.
    if settings.local_ingest_root:
        root = Path(settings.local_ingest_root).resolve()
        if root not in local_path.parents and local_path != root:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Path must be inside the permitted ingest root: {root}",
            )

    if not local_path.is_dir():
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


class GitHubIngestRequest(BaseModel):
    full_name: str          # "owner/repo"


@router.post(
    "/github",
    response_model=RepoUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def ingest_github_repo(
    request: GitHubIngestRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_user),
):
    """Ingest one of the signed-in user's own GitHub repositories.

    Unlike /repos/upload with a github_url, this always requires a session and
    clones with the user's OAuth token, so PRIVATE repositories work. The token
    is resolved at clone time from the owner record — it is never stored on the
    repository row or embedded in source_url.
    """
    from app.services.auth_service import decrypt_token, list_user_repositories

    token = decrypt_token(user.encrypted_github_token)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub is not connected for this account. Sign in with GitHub again.",
        )

    # Confirm the caller actually has access to this repo rather than trusting
    # the supplied name. Without this the endpoint would clone any repository
    # the user's token can reach, including ones they never selected.
    try:
        available = await list_user_repositories(token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach the GitHub API. Try again shortly.",
        )

    match = next((r for r in available
                  if r["full_name"].lower() == request.full_name.lower()), None)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"'{request.full_name}' is not accessible with your GitHub account.",
        )

    repo_id = str(uuid4())
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)

    repo = Repository(
        repo_id=repo_id,
        name=match["name"],
        description=match.get("description"),
        source_type="github_url",
        source_url=match["clone_url"],
        status="indexing",
        owner_id=user.user_id,
        is_private=bool(match["private"]),
    )
    await repo.insert()

    job = await JobQueueService.create_job(
        job_type="ingestion",
        metadata={"repo_id": repo_id, "name": match["name"],
                  "private": match["private"]},
    )
    JobQueueService.start_job(
        background_tasks, job.job_id,
        IngestionService.process_ingestion, repo_id,
    )

    return RepoUploadResponse(
        repo_id=repo_id,
        name=match["name"],
        job_id=job.job_id,
        message=(
            f"Cloning {'private' if match['private'] else 'public'} repository "
            f"{match['full_name']}. Indexing has started in the background."
        ),
    )


@router.get("", response_model=RepoListResponse)
async def list_repos(user: User | None = Depends(get_current_user)):
    """List all indexed repositories, reconciled against the live vector index.

    Repository metadata lives in MongoDB while the vectors live in Chroma, so
    the two can drift — most commonly when the backend restarts without
    persistent storage and the index is wiped while Mongo still says "ready".
    That produced a ghost repository the UI happily opened, and every question
    against it fell through to an ungrounded answer.

    Reporting the live chunk count makes the drift visible instead of silent.
    """
    repos = await Repository.find_all().to_list()
    # Hide other users' repositories. Legacy rows (owner_id=None) stay visible.
    repos = [r for r in repos if _owns(r, user)]
    repo_infos = []

    for r in repos:
        status_value = r.status
        chunk_count = r.chunk_count

        # Only meaningful for repos that claim to be queryable.
        if r.status == "ready":
            try:
                live_count = await vector_service.collection_count(r.repo_id)
            except Exception:
                live_count = 0

            if live_count == 0 and r.chunk_count > 0:
                status_value = "error"
                chunk_count = 0
            elif live_count:
                chunk_count = live_count

        repo_infos.append(RepoInfo(
            repo_id=r.repo_id,
            name=r.name,
            description=r.description,
            file_count=r.file_count,
            chunk_count=chunk_count,
            languages=r.languages,
            status=status_value,
            created_at=r.created_at,
            indexed_at=r.indexed_at
        ))

    return RepoListResponse(repos=repo_infos, total=len(repo_infos))


@router.delete(
    "/{repo_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_api_key)],
)
async def delete_repo(repo_id: str, user: User | None = Depends(get_current_user)):
    """Delete repository metadata, uploaded zip files, and Chroma collection."""
    repo = await _get_owned_repo(repo_id, user)
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
async def list_repo_files(repo_id: str, user: User | None = Depends(get_current_user)):
    """List all relative file paths within the repository ZIP archive."""
    import zipfile
    repo = await _get_owned_repo(repo_id, user)
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
async def get_repo_file_content(repo_id: str, path: str, user: User | None = Depends(get_current_user)):
    """Retrieve the text content of a specific file within the repository ZIP archive."""
    import zipfile
    repo = await _get_owned_repo(repo_id, user)
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
async def download_repo_archive(repo_id: str, user: User | None = Depends(get_current_user)):
    """Download the repository ZIP archive."""
    from fastapi.responses import FileResponse
    repo = await _get_owned_repo(repo_id, user)
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
