"""
CodePilot RAG — Shared API Dependencies

Authentication for endpoints that mutate state or consume paid LLM quota.

Design note: authentication is OPT-IN. When `API_KEY` is unset the dependency
is a no-op, so local development and the existing docker-compose flow keep
working untouched. Setting `API_KEY` in any internet-reachable deployment
turns protection on for every guarded route at once.
"""
import logging
import secrets

from fastapi import Header, HTTPException, status

from app.config import get_settings

logger = logging.getLogger("copilot-rag.auth")

settings = get_settings()


def _verify(provided: str | None) -> None:
    """Constant-time comparison against the configured key."""
    expected = settings.api_key

    # Auth disabled — nothing configured, so every request is allowed.
    if not expected:
        return

    if not provided:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Send it in the 'X-API-Key' header.",
            headers={"WWW-Authenticate": "X-API-Key"},
        )

    # compare_digest avoids leaking key length/prefix through timing.
    if not secrets.compare_digest(provided, expected):
        logger.warning("Rejected request with invalid API key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
            headers={"WWW-Authenticate": "X-API-Key"},
        )


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Guard for mutating / destructive endpoints.

    Applies to ingestion, deletion and patch application — the operations that
    write to disk, drop data, or burn embedding quota.
    """
    _verify(x_api_key)


async def require_api_key_for_chat(x_api_key: str | None = Header(default=None)) -> None:
    """Guard for the chat endpoint, enabled separately.

    Chat is the public demo surface, so it stays open by default and relies on
    the per-IP rate limiter. Set `PROTECT_CHAT=true` to require a key here too —
    useful when LLM quota is being drained by anonymous traffic.
    """
    if not settings.protect_chat:
        return
    _verify(x_api_key)


# ── User authentication (GitHub OAuth sessions) ─────────────────────────────

def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def get_optional_user(
    authorization: str | None = Header(default=None),
):
    """Resolve the signed-in user, or None.

    Never raises. Used by endpoints that must keep working for anonymous
    callers while still scoping data when someone IS signed in.
    """
    from app.models.db_models import User
    from app.services.auth_service import decode_session_token

    token = _bearer(authorization)
    if not token:
        return None

    claims = decode_session_token(token)
    if not claims:
        return None

    return await User.find_one(User.user_id == claims.get("sub"))


async def get_current_user(
    authorization: str | None = Header(default=None),
):
    """Require a signed-in user whenever AUTH_REQUIRED is on.

    With AUTH_REQUIRED off this behaves like get_optional_user, so the public
    demo keeps working unchanged and enabling auth is a single config flip.
    """
    user = await get_optional_user(authorization)

    if user is None and settings.auth_required:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in with GitHub to use this endpoint.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def require_user(
    authorization: str | None = Header(default=None),
):
    """Always require a signed-in user, regardless of AUTH_REQUIRED.

    For endpoints that are meaningless without an identity — anything reading
    the caller's own GitHub account.
    """
    user = await get_optional_user(authorization)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in with GitHub to use this endpoint.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
