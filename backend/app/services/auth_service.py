"""
CodePilot RAG — Authentication Service

GitHub is used purely as an identity provider. The OAuth handshake establishes
who the user is and nothing more: the access token is used once, server-side, to
read the public profile, and is then discarded.

Deliberately NOT stored. A token that is never persisted cannot leak from the
database, cannot be decrypted by a future attacker, and needs no key rotation
policy. If repository access is ever added back, that decision has to be
revisited along with encryption at rest.

Two responsibilities:
  1. Session JWTs   — issue and verify bearer tokens.
  2. OAuth exchange — swap an authorization code for a profile.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt

from app.config import get_settings
from app.models.db_models import User, utcnow

logger = logging.getLogger("copilot-rag.auth")
settings = get_settings()

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API = "https://api.github.com"

# Anti-CSRF state values for in-flight OAuth handshakes. In-process on purpose:
# the handshake completes in seconds, and this service already runs as a single
# replica (the chat rate limiter has the same constraint). Running more than one
# replica requires relocating this to Redis along with that limiter.
_oauth_states: dict[str, datetime] = {}
_STATE_TTL = timedelta(minutes=10)


# ── Session JWTs ────────────────────────────────────────────────────────────

def create_session_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.user_id,
        "login": user.login,
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.effective_jwt_secret,
                      algorithm=settings.jwt_algorithm)


def decode_session_token(token: str) -> dict[str, Any] | None:
    """Return the claims, or None when the token is invalid or expired."""
    try:
        return jwt.decode(token, settings.effective_jwt_secret,
                          algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        logger.info("Rejected an expired session token")
        return None
    except jwt.InvalidTokenError as exc:
        logger.warning("Rejected an invalid session token: %s", exc)
        return None


# ── OAuth handshake ─────────────────────────────────────────────────────────

def _prune_states() -> None:
    cutoff = datetime.now(timezone.utc) - _STATE_TTL
    for key in [k for k, v in _oauth_states.items() if v < cutoff]:
        _oauth_states.pop(key, None)


def build_authorize_url(redirect_uri: str) -> str:
    """Create the GitHub consent URL and remember its anti-CSRF state."""
    _prune_states()
    state = secrets.token_urlsafe(24)
    _oauth_states[state] = datetime.now(timezone.utc)

    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": redirect_uri,
        "scope": settings.github_oauth_scopes,
        "state": state,
        "allow_signup": "true",
    }
    return f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"


def consume_state(state: str | None) -> bool:
    """Validate and burn a state value. Single use, so a replayed callback fails."""
    _prune_states()
    if not state or state not in _oauth_states:
        return False
    _oauth_states.pop(state, None)
    return True


async def exchange_code_for_token(code: str, redirect_uri: str) -> str:
    """Trade an authorization code for a short-lived access token.

    The caller uses the returned token immediately to read the profile and then
    drops it; it is never returned to the browser or written to the database.
    """
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
    resp.raise_for_status()
    payload = resp.json()

    # GitHub reports failures with HTTP 200 and an "error" key, so the status
    # code alone is not a sufficient success check.
    if "error" in payload:
        raise ValueError(payload.get("error_description") or payload["error"])

    token = payload.get("access_token")
    if not token:
        raise ValueError("GitHub did not return an access token")
    return token


async def fetch_github_profile(token: str) -> dict[str, Any]:
    """Fetch the authenticated user, falling back to the email endpoint.

    /user omits the email when the user has kept it private, so the primary
    verified address is looked up separately.
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(f"{GITHUB_API}/user", headers=headers)
        resp.raise_for_status()
        profile = resp.json()

        if not profile.get("email"):
            try:
                emails = await client.get(f"{GITHUB_API}/user/emails", headers=headers)
                if emails.status_code == 200:
                    primary = next(
                        (e for e in emails.json()
                         if e.get("primary") and e.get("verified")),
                        None,
                    )
                    if primary:
                        profile["email"] = primary["email"]
            except httpx.HTTPError:
                pass  # email is optional; never block sign-in on it

    return profile


async def upsert_user(profile: dict[str, Any]) -> User:
    """Create or refresh the local user record for a GitHub identity.

    Matching is on the numeric GitHub id, not the login, because usernames can
    be changed and reused while the id is permanent.
    """
    github_id = int(profile["id"])
    user = await User.find_one(User.github_id == github_id)

    if user is None:
        user = User(
            github_id=github_id,
            login=profile["login"],
            name=profile.get("name"),
            email=profile.get("email"),
            avatar_url=profile.get("avatar_url"),
        )
        await user.insert()
        logger.info("Registered new user %s (github_id=%s)", user.login, github_id)
    else:
        user.login = profile["login"]
        user.name = profile.get("name")
        user.email = profile.get("email")
        user.avatar_url = profile.get("avatar_url")
        user.last_login_at = utcnow()
        await user.save()
        logger.info("Signed in existing user %s", user.login)

    return user
