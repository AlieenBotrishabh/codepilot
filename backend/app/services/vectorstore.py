"""
CodePilot RAG — Vector Store Service (ChromaDB)
Manages collections per repository for semantic code search.
"""
import asyncio
from functools import lru_cache
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_openai import OpenAIEmbeddings

from app.config import get_settings

settings = get_settings()


def get_embedding_function():
    """Return the appropriate embedding function based on config."""
    if settings.llm_provider == "gemini":
        return GoogleGenerativeAIEmbeddings(
            model=settings.embedding_model,
            google_api_key=settings.google_api_key,
        )
    return OpenAIEmbeddings(
        model="text-embedding-3-small",
        api_key=settings.openai_api_key,
    )


def get_chroma_client():
    """Return a ChromaDB client (local persistent client or HTTP client)."""
    import socket
    
    is_server_up = False
    try:
        with socket.create_connection((settings.chroma_host, settings.chroma_port), timeout=0.5):
            is_server_up = True
    except OSError:
        is_server_up = False

    if is_server_up:
        try:
            return chromadb.HttpClient(
                host=settings.chroma_host,
                port=settings.chroma_port,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
        except Exception:
            pass

    return chromadb.PersistentClient(
        path=settings.chroma_persist_dir,
        settings=ChromaSettings(anonymized_telemetry=False)
    )




def get_collection_name(repo_id: str) -> str:
    """Generate a valid Chroma collection name for a repo."""
    # Chroma collection names must be alphanumeric + hyphens, 3-63 chars
    safe = repo_id.replace("_", "-").replace(" ", "-").lower()
    return f"repo-{safe[:55]}"


class VectorStoreService:
    """Manages ChromaDB collections for repository code search."""

    def __init__(self):
        self._client = get_chroma_client()
        self._embeddings_cached = None

    @property
    def embeddings(self):
        if self._embeddings_cached is None:
            self._embeddings_cached = get_embedding_function()
        return self._embeddings_cached

    def get_vectorstore(self, repo_id: str) -> Chroma:
        """Get or create a Chroma vectorstore for the given repo."""
        return Chroma(
            client=self._client,
            collection_name=get_collection_name(repo_id),
            embedding_function=self.embeddings,
        )


    async def add_documents(self, repo_id: str, documents: list[Document]) -> int:
        """Add documents to the repo's collection. Returns count added."""
        if not documents:
            return 0
        vectorstore = self.get_vectorstore(repo_id)
        
        # Batch size for embedding requests to avoid rate limits
        batch_size = 5  # Small batch size for free-tier key
        loop = asyncio.get_event_loop()
        
        added_count = 0
        import time
        
        for i in range(0, len(documents), batch_size):
            chunk = documents[i:i + batch_size]
            
            # Add with retries and exponential backoff
            max_retries = 5
            backoff = 1.0
            
            for attempt in range(max_retries):
                try:
                    await loop.run_in_executor(
                        None,
                        lambda c=chunk: vectorstore.add_documents(c),
                    )
                    added_count += len(chunk)
                    # Introduce a small pause between successful batches to respect RPM rate limits
                    await asyncio.sleep(0.5)
                    break
                except Exception as e:
                    # If it's a rate limit error (429 or ResourceExhausted), wait and retry
                    if "429" in str(e) or "quota" in str(e).lower() or "exhausted" in str(e).lower():
                        if attempt == max_retries - 1:
                            raise e
                        print(f"Rate limit hit during embedding. Retrying in {backoff}s... (Attempt {attempt + 1}/{max_retries})")
                        await asyncio.sleep(backoff)
                        backoff *= 2.0  # Exponential backoff
                    else:
                        raise e
                        
        return added_count


    async def similarity_search(
        self,
        repo_id: str,
        query: str,
        k: int = 8,
        filter_dict: dict[str, Any] | None = None,
    ) -> list[Document]:
        """Perform semantic similarity search on repo collection."""
        vectorstore = self.get_vectorstore(repo_id)
        loop = asyncio.get_event_loop()

        kwargs: dict[str, Any] = {"k": k}
        if filter_dict:
            kwargs["filter"] = filter_dict

        docs = await loop.run_in_executor(
            None,
            lambda: vectorstore.similarity_search(query, **kwargs),
        )
        return docs

    async def similarity_search_with_score(
        self,
        repo_id: str,
        query: str,
        k: int = 8,
    ) -> list[tuple[Document, float]]:
        """Search and return documents with relevance scores."""
        vectorstore = self.get_vectorstore(repo_id)
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None,
            lambda: vectorstore.similarity_search_with_relevance_scores(query, k=k),
        )
        return results

    async def delete_collection(self, repo_id: str) -> None:
        """Delete all documents for a repository."""
        collection_name = get_collection_name(repo_id)
        try:
            self._client.delete_collection(collection_name)
        except Exception:
            pass  # Collection may not exist

    async def collection_count(self, repo_id: str) -> int:
        """Return number of chunks stored for a repo."""
        collection_name = get_collection_name(repo_id)
        try:
            collection = self._client.get_collection(collection_name)
            return collection.count()
        except Exception:
            return 0


@lru_cache(maxsize=1)
def get_vectorstore_service() -> VectorStoreService:
    return VectorStoreService()
