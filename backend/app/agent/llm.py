"""
CodePilot RAG — LLM Instance Provider
Provides configured Gemini or OpenAI models.
"""
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from app.config import get_settings

settings = get_settings()

# Default model — can be overridden per-call
_DEFAULT_GEMINI = "models/gemini-2.5-flash"  # Active free-tier quota on this key

# Token limits per call type to stay within quota and keep responses tight
TOKEN_LIMITS = {
    "classify": 128,     # JSON classification output — tiny
    "retrieve": 64,      # Search query expansion — tiny
    "plan": 512,         # Implementation plan — short
    "generate": 2048,    # Main answer / code review / architecture
    "patch": 2048,       # Unified diff generation
    "verify": 512,       # Verification JSON — short
}


def get_llm(
    temperature: float = 0.1,
    streaming: bool = False,
    model: str | None = None,
    max_tokens: int | None = None,
):
    """Factory function for LLM wrapper."""
    if settings.llm_provider == "gemini":
        resolved_model = model or settings.gemini_model or _DEFAULT_GEMINI
        kwargs = dict(
            model=resolved_model,
            google_api_key=settings.google_api_key,
            temperature=temperature,
            streaming=streaming,
            max_retries=2,          # Fail fast — don't silently hang for minutes
            request_timeout=45,     # Hard cap per call
        )
        if max_tokens:
            kwargs["max_output_tokens"] = max_tokens
        return ChatGoogleGenerativeAI(**kwargs)
    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=temperature,
        streaming=streaming,
        request_timeout=45,
        max_tokens=max_tokens,
    )
