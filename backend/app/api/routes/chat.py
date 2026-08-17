"""
CodePilot RAG — Chat Routing
Handles sending messages, triggering the LangGraph agent, and persisting history.
"""
import time
import asyncio
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.api.deps import require_api_key, require_api_key_for_chat

from app.models.schemas import ChatRequest, ChatResponse, Citation
from app.models.db_models import Repository, Thread, Message
from app.services.memory import MemoryService
from app.agent.graph import agent_graph

router = APIRouter(tags=["Chat"])


# ── In-process rate limiter ───────────────────────────────────────────────────
# Tracks request timestamps per IP using a sliding window.
# No Redis / external dependency required.
_rate_store: dict[str, list[float]] = defaultdict(list)
_CHAT_RATE_LIMIT = 10       # max requests
_CHAT_RATE_WINDOW = 60.0    # per window (seconds)
_rate_lock = asyncio.Lock()


async def _check_rate_limit(ip: str) -> None:
    """Raise HTTP 429 if the IP exceeds the sliding-window chat rate limit."""
    now = time.monotonic()
    async with _rate_lock:
        # Prune timestamps outside the current window
        _rate_store[ip] = [t for t in _rate_store[ip] if now - t < _CHAT_RATE_WINDOW]
        if len(_rate_store[ip]) >= _CHAT_RATE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Rate limit exceeded: max {_CHAT_RATE_LIMIT} chat requests "
                    f"per {int(_CHAT_RATE_WINDOW)}s per IP. Please wait before retrying."
                ),
            )
        _rate_store[ip].append(now)


# ── Chat endpoint ─────────────────────────────────────────────────────────────

@router.post(
    "/chat",
    response_model=ChatResponse,
    dependencies=[Depends(require_api_key_for_chat)],
)
async def chat_interaction(request: ChatRequest, http_request: Request):
    """
    Send a message to the autonomous coding copilot.
    Rate-limited to 10 requests/minute per IP to stay within Gemini quota.
    Executes the optimised LangGraph workflow.
    """
    # Enforce per-IP rate limit
    client_ip = http_request.client.host if http_request.client else "unknown"
    await _check_rate_limit(client_ip)

    start_time = time.time()

    # 1. Verify Repository exists and is indexed
    repo = await Repository.find_one(Repository.repo_id == request.repo_id)
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not found."
        )
    if repo.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Repository is not ready. Current status: {repo.status}"
        )

    # 2. Check/Create Thread
    thread = await Thread.find_one(Thread.thread_id == request.thread_id)
    if not thread:
        thread = await MemoryService.create_thread(repo_id=request.repo_id, title=None)
        request.thread_id = thread.thread_id

    # 3. Store User message in database
    await MemoryService.add_message(
        thread_id=request.thread_id,
        repo_id=request.repo_id,
        role="user",
        content=request.query,
    )

    # 4. Prepare initial state for the LangGraph agent
    initial_state = {
        "query": request.query,
        "repo_id": request.repo_id,
        "thread_id": request.thread_id,
        "mode": request.mode,
        "retrieved_chunks": [],
        "plan": None,
        "raw_response": None,
        "response": "",
        "patch": None,
        "citations": [],
        "verified": False,
        "error": None,
    }

    # 5. Execute LangGraph Agent
    config = {"configurable": {"thread_id": request.thread_id}}
    try:
        final_state = await agent_graph.ainvoke(initial_state, config=config)
    except Exception as e:
        str_e = str(e).lower()
        if "quota" in str_e or "429" in str_e or "resourceexhausted" in str_e or "rate limit" in str_e:
            error_msg = "The AI service is currently rate limited or out of quota. Please wait a moment before trying again."
            err_status = status.HTTP_429_TOO_MANY_REQUESTS
        else:
            error_msg = f"An error occurred during workflow execution: {e}"
            err_status = status.HTTP_500_INTERNAL_SERVER_ERROR

        await MemoryService.add_message(
            thread_id=request.thread_id,
            repo_id=request.repo_id,
            role="assistant",
            content=error_msg,
        )
        raise HTTPException(status_code=err_status, detail=error_msg)

    latency_ms = (time.time() - start_time) * 1000

    # 6. Parse and store assistant response
    answer = final_state.get("response", "")
    citations = final_state.get("citations", [])
    plan = final_state.get("plan")
    patch = final_state.get("patch")
    mode_resolved = final_state.get("mode", "question")
    verified = final_state.get("verified", True)

    await MemoryService.add_message(
        thread_id=request.thread_id,
        repo_id=request.repo_id,
        role="assistant",
        content=answer,
        mode=mode_resolved,
        citations=citations,
        patch=patch,
        plan=plan,
        latency_ms=latency_ms
    )

    response_citations = [
        Citation(
            file_path=c["file_path"],
            snippet=c["snippet"],
            score=c.get("score", 1.0)
        )
        for c in citations
    ]

    return ChatResponse(
        thread_id=request.thread_id,
        query=request.query,
        mode=mode_resolved,
        answer=answer,
        citations=response_citations,
        plan=plan,
        patch=patch,
        verified=verified,
        latency_ms=latency_ms
    )


@router.get("/threads/{repo_id}")
async def get_repo_threads(repo_id: str):
    """Retrieve all conversations threads for a repository."""
    threads = await MemoryService.get_threads(repo_id)
    return {"threads": threads}


@router.get("/threads/{thread_id}/messages")
async def get_thread_messages(thread_id: str):
    """Retrieve message history for a conversation thread."""
    messages = await MemoryService.get_messages(thread_id)
    return {"messages": messages}


@router.delete("/threads/{thread_id}", dependencies=[Depends(require_api_key)])
async def delete_thread(thread_id: str):
    """Delete a conversation thread and its messages."""
    await MemoryService.delete_thread(thread_id)
    return {"message": "Thread deleted successfully."}
