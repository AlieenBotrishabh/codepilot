"""
CodePilot RAG — LangGraph Workflow Orchestration
Assembles the multi-step agent flow: classify -> retrieve -> plan -> generate -> verify.
"""
from typing import Literal

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from app.agent.state import AgentState
from app.agent.nodes import (
    classify_request,
    retrieve_context,
    plan_solution,
    generate_answer,
    generate_patch,
    verify_output,
)


def route_start(state: AgentState) -> Literal["classify_request", "retrieve_context"]:
    """Bypasses classification if mode is already set explicitly."""
    if state.get("mode") == "auto":
        return "classify_request"
    return "retrieve_context"


def route_by_mode(state: AgentState) -> Literal["retrieve_context", "end"]:
    """Conditional router based on classification result."""
    mode = state.get("mode", "question")
    if mode in ["question", "debug", "patch", "review", "architecture"]:
        return "retrieve_context"
    return "end"


def route_after_retrieve(state: AgentState) -> Literal["plan_solution", "generate_answer"]:
    """Routes debug and patch modes to planning first; others directly to generation."""
    mode = state.get("mode", "question")
    if mode in ["debug", "patch"]:
        return "plan_solution"
    return "generate_answer"


def route_after_planning(state: AgentState) -> Literal["generate_answer", "generate_patch"]:
    """Routes to answer vs patch generation after plan is finalized."""
    mode = state.get("mode", "question")
    if mode == "patch":
        return "generate_patch"
    return "generate_answer"


def route_after_generation(state: AgentState) -> Literal["verify_output", "end"]:
    """Routes generated response/patch to validation, or directly to end for reviews/arch."""
    mode = state.get("mode", "question")
    if mode == "patch":
        return "verify_output"
    return "end"


# ── Create the StateGraph ─────────────────────────────────────────────────────

workflow = StateGraph(AgentState)

# Add Nodes
workflow.add_node("classify_request", classify_request)
workflow.add_node("retrieve_context", retrieve_context)
workflow.add_node("plan_solution", plan_solution)
workflow.add_node("generate_answer", generate_answer)
workflow.add_node("generate_patch", generate_patch)
workflow.add_node("verify_output", verify_output)

# Set Entrance Connection (Conditional routing from START)
workflow.add_conditional_edges(
    START,
    route_start,
    {
        "classify_request": "classify_request",
        "retrieve_context": "retrieve_context"
    }
)

# Conditional Router Edges
workflow.add_conditional_edges(
    "classify_request",
    route_by_mode,
    {
        "retrieve_context": "retrieve_context",
        "end": END
    }
)

workflow.add_conditional_edges(
    "retrieve_context",
    route_after_retrieve,
    {
        "plan_solution": "plan_solution",
        "generate_answer": "generate_answer"
    }
)

workflow.add_conditional_edges(
    "plan_solution",
    route_after_planning,
    {
        "generate_answer": "generate_answer",
        "generate_patch": "generate_patch"
    }
)

workflow.add_conditional_edges(
    "generate_answer",
    route_after_generation,
    {
        "verify_output": "verify_output",
        "end": END
    }
)

workflow.add_conditional_edges(
    "generate_patch",
    route_after_generation,
    {
        "verify_output": "verify_output",
        "end": END
    }
)

workflow.add_edge("verify_output", END)

# Checkpointing Memory
memory_saver = MemorySaver()

# Compile the execution graph
agent_graph = workflow.compile(checkpointer=memory_saver)
