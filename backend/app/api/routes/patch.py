"""
CodePilot RAG — Patch Generation Routes
Dedicated endpoints for generating unified patches/diffs.
"""
from fastapi import APIRouter, HTTPException, status, BackgroundTasks
from app.models.schemas import PatchRequest, PatchResponse, Citation, ApplyPatchRequest
from app.api.routes.chat import chat_interaction
from app.models.schemas import ChatRequest
from app.models.db_models import Repository, Job
from app.services.job_queue import JobQueueService
from app.services.ingestion import IngestionService
from app.services.vectorstore import get_vectorstore_service
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from app.utils.diff_utils import apply_patch_to_content

router = APIRouter(prefix="/patch", tags=["Patch Generation"])
vector_service = get_vectorstore_service()


@router.post("/generate", response_model=PatchResponse)
async def generate_patch_endpoint(request: PatchRequest):
    """
    Dedicated endpoint to generate a patch/diff for a specific description of changes.
    Directly routes the request to LangGraph's patch-generation workflow mode.
    """
    # Build query combining files if specified
    query = request.description
    if request.target_files:
        files_str = ", ".join(request.target_files)
        query += f"\nTarget files: {files_str}"

    chat_req = ChatRequest(
        query=query,
        repo_id=request.repo_id,
        thread_id=request.thread_id,
        mode="patch"  # Hardcode to patch mode
    )

    try:
        chat_resp = await chat_interaction(chat_req)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate patch: {e}"
        )

    if not chat_resp.patch:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The agent generated an explanation but was unable to produce a structured unified diff patch."
        )

    # Extract target files affected
    from app.utils.diff_utils import extract_affected_files
    affected = extract_affected_files(chat_resp.patch)

    return PatchResponse(
        thread_id=chat_resp.thread_id,
        patch=chat_resp.patch,
        affected_files=affected,
        explanation=chat_resp.answer,
        citations=chat_resp.citations
    )


@router.post("/apply")
async def apply_patch_endpoint(
    request: ApplyPatchRequest,
    background_tasks: BackgroundTasks
):
    """
    Apply a unified diff patch to the files of the repository,
    overwrite the zip archive, delete old vector embeddings,
    and trigger a re-indexing background job.
    """
    repo = await Repository.find_one(Repository.repo_id == request.repo_id)
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found."
        )
    
    if not repo.upload_path or not os.path.exists(repo.upload_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository archive not found on disk. Cannot apply patch."
        )

    # 1. Create temporary directories
    temp_extract_dir = tempfile.mkdtemp(prefix=f"patch-apply-{request.repo_id}-")
    temp_extract_path = Path(temp_extract_dir)

    try:
        # 2. Extract current zip content to temp dir
        with zipfile.ZipFile(repo.upload_path, 'r') as z:
            z.extractall(temp_extract_path)

        # 3. Parse and apply patch
        patch_content = request.patch.strip()
        
        # If the patch is wrapped in ```diff ... ``` code blocks, extract the content of those blocks
        import re
        blocks = re.findall(r"```(?:diff)?\n(.*?)```", patch_content, re.DOTALL)
        if not blocks:
            # If no code block markdown is found, treat the whole string as the patch block
            blocks = [patch_content]

        # Apply each block
        applied_files = []
        for block in blocks:
            block = block.strip()
            if not block:
                continue

            # Determine the file path from the unified diff header (e.g., +++ b/filename)
            file_path = None
            lines = block.splitlines()
            for line in lines:
                if line.startswith("+++ b/"):
                    file_path = line[6:].strip()
                    break
                elif line.startswith("+++ "):
                    file_path = line[4:].strip()
                    break

            if not file_path:
                # Skip blocks without clear file headers
                continue

            target_file_path = temp_extract_path / file_path
            
            # Ensure target file directory exists
            target_file_path.parent.mkdir(parents=True, exist_ok=True)

            original_content = ""
            if target_file_path.exists():
                with open(target_file_path, "r", encoding="utf-8", errors="replace") as f:
                    original_content = f.read()

            try:
                # Apply diff using apply_patch_to_content
                patched_content = apply_patch_to_content(original_content, block)
                with open(target_file_path, "w", encoding="utf-8") as f:
                    f.write(patched_content)
                applied_files.append(file_path)
            except Exception as patch_err:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Failed to apply patch to file {file_path}: {patch_err}"
                )

        if not applied_files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No files were patched. Ensure the diff block has standard headers (e.g. +++ b/filename)."
            )

        # 4. Overwrite original zip archive with new content
        temp_zip_path = temp_extract_path.parent / f"{request.repo_id}_new.zip"
        with zipfile.ZipFile(temp_zip_path, 'w', zipfile.ZIP_DEFLATED) as new_z:
            for root, _, files in os.walk(temp_extract_path):
                for f in files:
                    file_abs_path = Path(root) / f
                    file_rel_path = file_abs_path.relative_to(temp_extract_path)
                    new_z.write(file_abs_path, file_rel_path)

        # Move new zip to original upload path
        shutil.move(str(temp_zip_path), repo.upload_path)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal patch application error: {e}"
        )
    finally:
        # Cleanup temporary directories
        if os.path.exists(temp_extract_dir):
            shutil.rmtree(temp_extract_dir, ignore_errors=True)

    # 5. Clear old vector database collection
    try:
        await vector_service.delete_collection(request.repo_id)
    except Exception:
        pass

    # 6. Create Job and trigger re-indexing in background
    repo.status = "indexing"
    await repo.save()

    job = await JobQueueService.create_job(
        job_type="ingestion",
        metadata={"repo_id": request.repo_id, "name": repo.name}
    )

    JobQueueService.start_job(
        background_tasks,
        job.job_id,
        IngestionService.process_ingestion,
        request.repo_id
    )

    return {
        "message": "Patch applied successfully. Re-indexing has started.",
        "job_id": job.job_id,
        "affected_files": applied_files
    }


@router.post("/generate", response_model=PatchResponse)
async def generate_patch_endpoint(request: PatchRequest):
    """
    Dedicated endpoint to generate a patch/diff for a specific description of changes.
    Directly routes the request to LangGraph's patch-generation workflow mode.
    """
    # Build query combining files if specified
    query = request.description
    if request.target_files:
        files_str = ", ".join(request.target_files)
        query += f"\nTarget files: {files_str}"

    chat_req = ChatRequest(
        query=query,
        repo_id=request.repo_id,
        thread_id=request.thread_id,
        mode="patch"  # Hardcode to patch mode
    )

    try:
        chat_resp = await chat_interaction(chat_req)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate patch: {e}"
        )

    if not chat_resp.patch:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The agent generated an explanation but was unable to produce a structured unified diff patch."
        )

    # Extract target files affected
    from app.utils.diff_utils import extract_affected_files
    affected = extract_affected_files(chat_resp.patch)

    return PatchResponse(
        thread_id=chat_resp.thread_id,
        patch=chat_resp.patch,
        affected_files=affected,
        explanation=chat_resp.answer,
        citations=chat_resp.citations
    )
