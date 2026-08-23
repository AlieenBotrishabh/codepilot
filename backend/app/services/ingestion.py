"""
CodePilot RAG — Ingestion Service
Handles cloning GitHub repositories or extracting zip files,
parsing them, chunking them, and loading them into ChromaDB.
"""
import asyncio
from datetime import datetime
import os
import shutil

import tempfile
import zipfile
from pathlib import Path
import aiofiles

from git import Repo as GitRepo
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import get_settings
from app.models.db_models import Repository, Job
from app.services.vectorstore import get_vectorstore_service
from app.utils.file_parser import iter_repo_files, extract_symbols

settings = get_settings()
vector_service = get_vectorstore_service()


async def download_github_repo(url: str, dest_dir: Path,
                               token: str | None = None) -> None:
    """Clone a Git repository, using a token when one is available.

    The token is injected into the clone URL and never logged or persisted —
    GitPython receives it, the clone completes, and the string is discarded.
    """
    loop = asyncio.get_event_loop()

    clone_url = url
    effective = token or settings.github_token
    if effective and "github.com" in url and "oauth2" not in url and "@" not in url.split("//", 1)[-1].split("/")[0]:
        clone_url = url.replace("https://", f"https://x-access-token:{effective}@", 1)

    try:
        await loop.run_in_executor(
            None,
            lambda: GitRepo.clone_from(clone_url, dest_dir, depth=1)
        )
    except Exception as exc:
        # Never let a credential reach logs or the user-facing error string.
        message = str(exc)
        if effective:
            message = message.replace(effective, "***")
        raise RuntimeError(f"git clone failed: {message}") from None


async def extract_zip_file(zip_path: Path, dest_dir: Path) -> None:
    """Extracts a zip file to the destination directory."""
    loop = asyncio.get_event_loop()
    def unzip():
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(dest_dir)
    await loop.run_in_executor(None, unzip)


class IngestionService:
    """Service to ingest a repository, chunk it, and save chunks in a vector store."""

    @staticmethod
    async def process_ingestion(job_id: str, repo_db_id: str) -> None:
        """Background worker function to ingest a repository."""
        job = await Job.find_one(Job.job_id == job_id)
        repo = await Repository.find_one(Repository.repo_id == repo_db_id)
        if not job or not repo:
            return

        job.status = "running"
        job.progress = 0.1
        job.message = "Initializing ingestion directory..."
        await job.save()

        temp_dir = Path(tempfile.mkdtemp(prefix=f"copilot-ingest-{repo_db_id}-"))
        try:
            # 1. Fetch code depending on source type
            if repo.source_type == "github_url":
                job.message = "Cloning repository from GitHub..."
                await job.save()
                await download_github_repo(repo.source_url, temp_dir)
                # Zip the cloned repo and save to uploads/
                upload_dir = Path(settings.upload_dir)
                upload_dir.mkdir(parents=True, exist_ok=True)
                zip_filename = f"{repo_db_id}"
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    lambda: shutil.make_archive(
                        str(upload_dir / zip_filename),
                        "zip",
                        temp_dir
                    )
                )
                repo.upload_path = str(upload_dir / f"{zip_filename}.zip")
                await repo.save()
            elif repo.source_type == "zip":
                job.message = "Extracting uploaded zip archive..."
                await job.save()
                await extract_zip_file(Path(repo.upload_path), temp_dir)
            else:
                raise ValueError(f"Unsupported source type: {repo.source_type}")

            job.progress = 0.3
            job.message = "Parsing files & extracting symbols..."
            await job.save()

            # 2. Parse files & chunk
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=settings.chunk_size,
                chunk_overlap=settings.chunk_overlap,
            )

            documents: list[Document] = []
            languages = set()
            file_count = 0

            # Scan the temporary directory for files
            for file_path, language, content in iter_repo_files(temp_dir):
                file_count += 1
                languages.add(language)
                relative_path = file_path.relative_to(temp_dir).as_posix()

                # Extract code symbols (functions/classes)
                symbols = extract_symbols(content, language)
                symbols_summary = ", ".join([s["name"] for s in symbols[:10]])

                # Split code/text content
                chunks = text_splitter.split_text(content)
                # Restrict max chunks per file to prevent single massive file from dominating DB
                chunks = chunks[:settings.max_chunks_per_file]

                for i, chunk in enumerate(chunks):
                    metadata = {
                        "repo_id": repo.repo_id,
                        "file_path": relative_path,
                        "language": language,
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                        "symbols": symbols_summary
                    }
                    documents.append(Document(page_content=chunk, metadata=metadata))

            if not documents:
                raise ValueError("No indexable code files found in the repository.")

            job.progress = 0.5
            job.message = f"Indexing {len(documents)} chunks to Vector Store (ChromaDB)..."
            await job.save()

            # 3. Add to ChromaDB
            # Add in batches of 100 to report progress
            batch_size = 100
            for i in range(0, len(documents), batch_size):
                batch = documents[i:i + batch_size]
                await vector_service.add_documents(repo.repo_id, batch)
                progress = 0.5 + (0.45 * (i + len(batch)) / len(documents))
                job.progress = min(progress, 0.95)
                job.message = f"Indexed {i + len(batch)} / {len(documents)} code chunks..."
                await job.save()

            # Update Repository DB Object
            repo.status = "ready"
            repo.file_count = file_count
            repo.chunk_count = len(documents)
            repo.languages = list(languages)
            repo.indexed_at = datetime.now()
            await repo.save()

            # Complete Job
            job.status = "completed"
            job.progress = 1.0
            job.message = "Ingestion completed successfully."
            job.result = {
                "repo_id": repo.repo_id,
                "file_count": file_count,
                "chunk_count": len(documents),
                "languages": list(languages)
            }
            await job.save()

        except Exception as e:
            repo.status = "error"
            repo.error_message = str(e)
            await repo.save()

            job.status = "failed"
            job.error = str(e)
            job.message = f"Ingestion failed: {e}"
            await job.save()

        finally:
            # Clean up temp directory
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)
