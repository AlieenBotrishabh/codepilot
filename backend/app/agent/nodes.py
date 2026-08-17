"""
CodePilot RAG — LangGraph Nodes
Implementations for request routing, RAG retrieval, planning, response/patch generation, and verification.
"""
import json
import logging
import re
from typing import Any

from langchain_core.messages import SystemMessage, HumanMessage
from app.agent.state import AgentState
from app.agent.llm import get_llm, TOKEN_LIMITS
from app.agent.prompts import (
    CLASSIFY_PROMPT,
    PLAN_PROMPT,
    GENERATE_RESPONSE_PROMPT,
    PATCH_GEN_PROMPT,
    VERIFY_PROMPT,
)
from app.services.vectorstore import get_vectorstore_service
from app.config import get_settings

vector_service = get_vectorstore_service()
settings = get_settings()

logger = logging.getLogger("copilot-rag.agent")


# Returned verbatim when retrieval yields no chunk above the relevance
# threshold. This is deliberately NOT sent to the LLM: with an empty context
# the model will happily invent a detailed, confident, entirely fictional
# answer. Refusing here is both correct and free.
NO_CONTEXT_RESPONSE = """## Insufficient Context

I could not find anything in the indexed codebase relevant to this question, so I am not going to guess.

> ⚠️ **No matching context:** vector retrieval returned no chunks above the relevance threshold for this repository.

### Why this happens

*   The repository may still be indexing — check its status on the dashboard.
*   The index may have been lost if the backend restarted without persistent storage, in which case the repository needs re-ingesting.
*   The question may not relate to anything in this codebase.

### What to try

*   Rephrase using concrete file, function, or symbol names.
*   Confirm the repository reports a non-zero chunk count.
"""


def clean_json_response(text: str) -> str:
    """Helper to strip markdown block wrappers from LLM json output."""
    text = text.strip()
    match = re.search(r"```(?:json)?\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text


def build_citations(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build citations from what retrieval actually returned, ranked by score.

    Previously citations were only attached when the model happened to echo a
    file path verbatim in its prose, so any summary-style answer silently lost
    all of its sources even though retrieval had worked. Ranking the retrieved
    chunks is both accurate and independent of how the model phrases things.
    """
    citations: list[dict[str, Any]] = []
    seen: set[str] = set()

    for chunk in sorted(chunks, key=lambda c: c.get("score", 0.0), reverse=True):
        file_path = chunk.get("file_path", "unknown")
        if file_path in seen:
            continue
        seen.add(file_path)
        citations.append({
            "file_path": file_path,
            "snippet": chunk.get("page_content", "")[:200] + "...",
            "score": round(float(chunk.get("score", 0.0)), 4),
        })
        if len(citations) >= settings.max_citations:
            break

    return citations


def format_context(chunks: list[dict[str, Any]]) -> str:
    """Render retrieved chunks into the prompt context block."""
    return "".join(
        f"--- FILE: {chunk['file_path']} ---\n{chunk['page_content']}\n\n"
        for chunk in chunks
    )


# ── 1. Classification Node ──────────────────────────────────────────────────

async def classify_request(state: AgentState) -> dict[str, Any]:
    """Classifies user request into one of the operational modes."""
    llm = get_llm(temperature=0.0, max_tokens=TOKEN_LIMITS["classify"])
    prompt = CLASSIFY_PROMPT.format(query=state["query"])

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    cleaned = clean_json_response(response.content)

    try:
        data = json.loads(cleaned)
        mode = data.get("mode", "question")
    except Exception:
        # Fallback based on keywords
        q_lower = state["query"].lower()
        if "patch" in q_lower or "diff" in q_lower or "implement" in q_lower:
            mode = "patch"
        elif "bug" in q_lower or "fail" in q_lower or "error" in q_lower or "debug" in q_lower:
            mode = "debug"
        elif "architecture" in q_lower or "structure" in q_lower or "flow" in q_lower:
            mode = "architecture"
        elif "review" in q_lower or "lint" in q_lower:
            mode = "review"
        else:
            mode = "question"

    return {"mode": mode}


# ── 2. Context Retrieval Node ───────────────────────────────────────────────

async def retrieve_context(state: AgentState) -> dict[str, Any]:
    """Fetch chunks from ChromaDB, keeping only those above the relevance floor.

    Scored retrieval matters: an unfiltered top-k always returns k chunks, even
    when every one of them is irrelevant, which then reads to the model as
    legitimate grounding. Filtering on score means an off-topic question ends up
    with zero chunks and the generation nodes refuse rather than improvise.
    """
    # Raw query is used directly for vector search — saves one LLM call per request.
    search_query = state["query"]
    repo_id = state["repo_id"]

    try:
        results = await vector_service.similarity_search_with_score(
            repo_id=repo_id,
            query=search_query,
            k=settings.retrieval_k,
        )
    except Exception as exc:
        # A missing or corrupt collection must not 500 the request. Returning
        # no chunks routes into the insufficient-context response, which tells
        # the user something real instead of surfacing a stack trace.
        logger.warning("Retrieval failed for repo %s: %s", repo_id, exc)
        return {"retrieved_chunks": []}

    chunks: list[dict[str, Any]] = []
    discarded = 0

    for doc, score in results:
        score = float(score)
        if score < settings.retrieval_min_score:
            discarded += 1
            continue
        chunks.append({
            "page_content": doc.page_content,
            "file_path": doc.metadata.get("file_path", "unknown"),
            "language": doc.metadata.get("language", "unknown"),
            "symbols": doc.metadata.get("symbols", ""),
            "score": score,
        })

    logger.info(
        "Retrieval repo=%s kept=%d discarded=%d min_score=%.2f",
        repo_id, len(chunks), discarded, settings.retrieval_min_score,
    )

    return {"retrieved_chunks": chunks}


# ── 3. Planning Node ────────────────────────────────────────────────────────

async def plan_solution(state: AgentState) -> dict[str, Any]:
    """Builds a implementation plan for complex debug and patch requests."""
    # No grounding means no plan worth making — a plan built on an empty
    # context is fiction that the patch node would then act on.
    if not state.get("retrieved_chunks"):
        return {"plan": None}

    llm = get_llm(temperature=0.1, max_tokens=TOKEN_LIMITS["plan"])

    context_str = format_context(state["retrieved_chunks"])

    prompt = PLAN_PROMPT.format(query=state["query"], context=context_str)
    response = await llm.ainvoke([HumanMessage(content=prompt)])

    return {"plan": response.content.strip()}


# ── 4. Answer Generation Node ───────────────────────────────────────────────

async def generate_answer(state: AgentState) -> dict[str, Any]:
    """Generates documentation, answers questions, architecture layout, or code reviews."""
    from app.services.memory import MemoryService

    # Grounding gate. Without it the model receives an empty context block and
    # produces a fluent, confident, entirely invented answer — the single worst
    # failure mode for a RAG system, because it is indistinguishable from a
    # good one at a glance.
    if not state.get("retrieved_chunks"):
        logger.warning(
            "No context for repo=%s mode=%s — refusing to generate",
            state.get("repo_id"), state.get("mode"),
        )
        return {"response": NO_CONTEXT_RESPONSE, "citations": [], "verified": True}

    llm = get_llm(temperature=0.2, max_tokens=TOKEN_LIMITS["generate"])

    context_str = format_context(state["retrieved_chunks"])

    # Fetch last 6 messages from DB to maintain context
    history_messages = await MemoryService.get_messages(state["thread_id"])
    history_str = ""
    for msg in history_messages[-6:]:
        history_str += f"{msg.role.capitalize()}: {msg.content}\n"

    plan_context = f"Implementation Plan:\n{state['plan']}\n" if state.get("plan") else ""
    full_plan_context = f"{plan_context}Conversation History:\n{history_str}" if history_str else plan_context

    prompt = GENERATE_RESPONSE_PROMPT.format(
        query=state["query"],
        mode=state["mode"],
        plan_context=full_plan_context,
        context=context_str
    )

    response = await llm.ainvoke([HumanMessage(content=prompt)])

    return {
        "response": response.content.strip(),
        "citations": build_citations(state["retrieved_chunks"]),
        "verified": True  # Defaults to True for question/architecture/review modes
    }


# ── 5. Patch Generation Node ────────────────────────────────────────────────

async def generate_patch(state: AgentState) -> dict[str, Any]:
    """Generates unified diff patches for code-generation requests."""
    from app.services.memory import MemoryService

    # Hardest gate in the system. A patch generated without real file context
    # is a diff against imagined code — it either fails to apply or, worse,
    # applies to the wrong place. Never generate one blind.
    if not state.get("retrieved_chunks"):
        logger.warning(
            "No context for repo=%s — refusing to generate patch",
            state.get("repo_id"),
        )
        return {
            "response": NO_CONTEXT_RESPONSE,
            "patch": None,
            "citations": [],
            "verified": True,
        }

    llm = get_llm(temperature=0.1, max_tokens=TOKEN_LIMITS["patch"])

    context_str = format_context(state["retrieved_chunks"])

    # Fetch last 6 messages from DB
    history_messages = await MemoryService.get_messages(state["thread_id"])
    history_str = ""
    for msg in history_messages[-6:]:
        history_str += f"{msg.role.capitalize()}: {msg.content}\n"

    plan_context = f"Implementation Plan:\n{state['plan']}\n" if state.get("plan") else ""
    full_plan_context = f"{plan_context}Conversation History:\n{history_str}" if history_str else plan_context

    prompt = PATCH_GEN_PROMPT.format(
        query=state["query"],
        plan_context=full_plan_context,
        context=context_str
    )


    response = await llm.ainvoke([HumanMessage(content=prompt)])
    content = response.content.strip()

    # Extract patch if present
    patch_match = re.search(r"```diff\n(.*?)\n```", content, re.DOTALL)
    patch = patch_match.group(1).strip() if patch_match else None

    return {
        "response": content,
        "patch": patch,
        "citations": build_citations(state["retrieved_chunks"]),
        "verified": False  # Must run through verify_output node
    }


# ── 6. Verification Node ────────────────────────────────────────────────────

async def verify_output(state: AgentState) -> dict[str, Any]:
    """Verifies generated response or patch against hallucinations and errors."""
    # Nothing was generated from context, so there is nothing to verify against.
    # Calling the verifier with an empty context wastes a request and its answer
    # would be meaningless.
    if not state.get("retrieved_chunks"):
        return {"verified": True}

    llm = get_llm(temperature=0.0, max_tokens=TOKEN_LIMITS["verify"])

    context_str = format_context(state["retrieved_chunks"])

    prompt = VERIFY_PROMPT.format(
        query=state["query"],
        response=state["response"],
        context=context_str
    )

    response = await llm.ainvoke([HumanMessage(content=prompt)])
    cleaned = clean_json_response(response.content)

    verified = True
    corrected_response = None

    try:
        data = json.loads(cleaned)
        verified = data.get("verified", True)
        if not verified:
            corrected_response = data.get("corrected_response")
    except Exception:
        pass  # fallback to verified

    output = {"verified": verified}
    if not verified and corrected_response:
        output["response"] = corrected_response
        # Re-extract patch if corrected response contained one
        patch_match = re.search(r"```diff\n(.*?)\n```", corrected_response, re.DOTALL)
        if patch_match:
            output["patch"] = patch_match.group(1).strip()

    return output
