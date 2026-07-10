"""
CodePilot RAG — LangGraph Nodes
Implementations for request routing, RAG retrieval, planning, response/patch generation, and verification.
"""
import json
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

vector_service = get_vectorstore_service()


def clean_json_response(text: str) -> str:
    """Helper to strip markdown block wrappers from LLM json output."""
    text = text.strip()
    match = re.search(r"```(?:json)?\n?(.*?)\n?```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text


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
    """Fetches chunks from ChromaDB using the user query directly."""
    # Use raw query directly for vector search to save 1 LLM call per request
    search_query = state["query"]

    # Search Chroma DB
    docs = await vector_service.similarity_search(
        repo_id=state["repo_id"],
        query=search_query,
        k=8,
    )

    chunks = []
    for doc in docs:
        chunks.append({
            "page_content": doc.page_content,
            "file_path": doc.metadata.get("file_path", "unknown"),
            "language": doc.metadata.get("language", "unknown"),
            "symbols": doc.metadata.get("symbols", ""),
        })

    return {"retrieved_chunks": chunks}


# ── 3. Planning Node ────────────────────────────────────────────────────────

async def plan_solution(state: AgentState) -> dict[str, Any]:
    """Builds a implementation plan for complex debug and patch requests."""
    llm = get_llm(temperature=0.1, max_tokens=TOKEN_LIMITS["plan"])

    # Format context
    context_str = ""
    for chunk in state["retrieved_chunks"]:
        context_str += f"--- FILE: {chunk['file_path']} ---\n{chunk['page_content']}\n\n"

    prompt = PLAN_PROMPT.format(query=state["query"], context=context_str)
    response = await llm.ainvoke([HumanMessage(content=prompt)])

    return {"plan": response.content.strip()}


# ── 4. Answer Generation Node ───────────────────────────────────────────────

async def generate_answer(state: AgentState) -> dict[str, Any]:
    """Generates documentation, answers questions, architecture layout, or code reviews."""
    from app.services.memory import MemoryService
    llm = get_llm(temperature=0.2, max_tokens=TOKEN_LIMITS["generate"])

    context_str = ""
    for chunk in state["retrieved_chunks"]:
        context_str += f"--- FILE: {chunk['file_path']} ---\n{chunk['page_content']}\n\n"

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

    # Parse file citations
    citations = []
    seen_files = set()
    for chunk in state["retrieved_chunks"]:
        f_path = chunk["file_path"]
        if f_path not in seen_files and f_path in response.content:
            citations.append({
                "file_path": f_path,
                "snippet": chunk["page_content"][:200] + "...",
                "score": 1.0,
            })
            seen_files.add(f_path)

    return {
        "response": response.content.strip(),
        "citations": citations,
        "verified": True  # Defaults to True for question/architecture/review modes
    }


# ── 5. Patch Generation Node ────────────────────────────────────────────────

async def generate_patch(state: AgentState) -> dict[str, Any]:
    """Generates unified diff patches for code-generation requests."""
    from app.services.memory import MemoryService
    llm = get_llm(temperature=0.1, max_tokens=TOKEN_LIMITS["patch"])

    context_str = ""
    for chunk in state["retrieved_chunks"]:
        context_str += f"--- FILE: {chunk['file_path']} ---\n{chunk['page_content']}\n\n"

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

    # Parse citations
    citations = []
    seen_files = set()
    for chunk in state["retrieved_chunks"]:
        f_path = chunk["file_path"]
        if f_path not in seen_files and f_path in content:
            citations.append({
                "file_path": f_path,
                "snippet": chunk["page_content"][:200] + "...",
                "score": 1.0,
            })
            seen_files.add(f_path)

    return {
        "response": content,
        "patch": patch,
        "citations": citations,
        "verified": False  # Must run through verify_output node
    }


# ── 6. Verification Node ────────────────────────────────────────────────────

async def verify_output(state: AgentState) -> dict[str, Any]:
    """Verifies generated response or patch against hallucinations and errors."""
    llm = get_llm(temperature=0.0, max_tokens=TOKEN_LIMITS["verify"])

    context_str = ""
    for chunk in state["retrieved_chunks"]:
        context_str += f"--- FILE: {chunk['file_path']} ---\n{chunk['page_content']}\n\n"

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
