"""
CodePilot RAG — LangGraph Agent State
Defines the state structure that flows through the LangGraph agent nodes.
"""
from typing import Any, TypedDict, Literal


class AgentState(TypedDict):
    # Inputs
    query: str
    repo_id: str
    thread_id: str

    # Intermediate Variables
    mode: Literal["auto", "question", "debug", "patch", "review", "architecture"]
    retrieved_chunks: list[dict[str, Any]]
    plan: str | None
    raw_response: str | None

    # Outputs
    response: str
    patch: str | None
    citations: list[dict[str, Any]]
    verified: bool
    error: str | None
