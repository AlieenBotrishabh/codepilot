"""
CodePilot RAG — Authentication Service

GitHub OAuth covers BOTH concerns at once: it establishes who the user is, and
it yields the token needed to read their repositories. That avoids running a
separate password system alongside a separate GitHub connection flow.

Because the token can read private repositories it is stored ENCRYPTED at rest,
never in plaintext. Rotating the app secret makes stored tokens undecryptable,
which surfaces to the user as "reconnect GitHub" rather than as an error.

Three responsibilities:
  1. Session JWTs   — issue and verify bearer tokens.
  2. Token secrecy  — encrypt GitHub access tokens before they touch the DB.
  3. OAuth exchange — swap an authorization code for a token and a profile.
"""
import base64
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import bcrypt
import httpx
import jwt
from cryptography.fernet import Fernet, InvalidToken

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


# ── Token encryption ────────────────────────────────────────────

def _fernet() -> Fernet:
    """Derive a stable Fernet key from the application secret.

    Fernet needs a 32-byte urlsafe-base64 key while the configured secret is
    arbitrary text, so it is hashed to a fixed width first.
    """
    digest = hashlib.sha256(settings.effective_jwt_secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_token(raw: str) -> str:
    return _fernet().encrypt(raw.encode("utf-8")).decode("utf-8")


def decrypt_token(blob: str | None) -> str | None:
    """Return the plaintext token, or None when it cannot be decrypted.

    A rotated secret makes every stored token undecryptable. That is treated as
    "not connected" rather than an error, so the user is asked to reconnect
    GitHub instead of hitting a 500.
    """
    if not blob:
        return None
    try:
        return _fernet().decrypt(blob.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        logger.warning("Stored GitHub token could not be decrypted (secret rotated?)")
        return None


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


async def exchange_code_for_token(code: str, redirect_uri: str) -> tuple[str, str]:
    """Trade an authorization code for an access token. Returns (token, scopes)."""
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
    return token, payload.get("scope", "")


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


async def upsert_user(profile: dict[str, Any], token: str, scopes: str) -> User:
    """Create or refresh the local user record for a GitHub identity.

    Matching is on the numeric GitHub id, not the login, because usernames can
    be changed and reused while the id is permanent.
    """
    github_id = int(profile["id"])
    user = await User.find_one(User.github_id == github_id)

    # Fall back to matching on the verified email. Someone who registered with
    # a password and later clicks "Continue with GitHub" should land on the SAME
    # account rather than silently creating a second one they cannot reconcile.
    if user is None:
        verified_email = profile.get("email")
        if verified_email:
            existing = await User.find_one(
                User.email_lower == normalize_email(verified_email)
            )
            if existing is not None:
                existing.github_id = github_id
                user = existing
                logger.info(
                    "Linked GitHub identity %s to existing account %s",
                    github_id, existing.email_lower,
                )

    if user is None:
        email = profile.get("email")
        user = User(
            auth_provider="github",
            github_id=github_id,
            login=profile["login"],
            name=profile.get("name"),
            email=email,
            email_lower=normalize_email(email) if email else None,
            avatar_url=profile.get("avatar_url"),
            encrypted_github_token=encrypt_token(token),
            github_scopes=scopes,
        )
        await user.insert()
        logger.info("Registered new user %s (github_id=%s)", user.login, github_id)
    else:
        user.login = profile["login"]
        user.name = profile.get("name") or user.name
        # Only overwrite the address when GitHub actually supplies one —
        # otherwise a private GitHub email would wipe the address an email
        # account registered with.
        if profile.get("email"):
            user.email = profile["email"]
            user.email_lower = normalize_email(profile["email"])
        user.avatar_url = profile.get("avatar_url") or user.avatar_url
        user.encrypted_github_token = encrypt_token(token)
        user.github_scopes = scopes
        user.last_login_at = utcnow()
        await user.save()
        logger.info("Signed in existing user %s", user.login)

    return user


async def list_user_repositories(token: str, per_page: int = 100) -> list[dict[str, Any]]:
    """List repositories the token can see, most recently pushed first."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
    }
    repos: list[dict[str, Any]] = []

    async with httpx.AsyncClient(timeout=30) as client:
        # Two pages is plenty for a picker UI and keeps the response quick.
        for page in (1, 2):
            resp = await client.get(
                f"{GITHUB_API}/user/repos",
                headers=headers,
                params={
                    "per_page": per_page,
                    "page": page,
                    "sort": "pushed",
                    "affiliation": "owner,collaborator,organization_member",
                },
            )
            if resp.status_code != 200:
                break
            batch = resp.json()
            if not batch:
                break
            repos.extend(batch)
            if len(batch) < per_page:
                break

    return [{
        "full_name": r["full_name"],
        "name": r["name"],
        "private": r["private"],
        "description": r.get("description"),
        "language": r.get("language"),
        "default_branch": r.get("default_branch"),
        "html_url": r["html_url"],
        "clone_url": r["clone_url"],
        "updated_at": r.get("pushed_at") or r.get("updated_at"),
        "stars": r.get("stargazers_count", 0),
    } for r in repos]

# ── Passwords ──────────────────────────────────────────────────

# bcrypt silently truncates anything past 72 bytes, so two long passwords
# sharing a 72-byte prefix would validate against each other. Pre-hashing to a
# fixed-width digest removes the limit entirely and is the standard mitigation.
# base64 is used rather than raw digest bytes because bcrypt also stops at the
# first NUL byte, which a raw digest can contain.
def _prehash(raw: str) -> bytes:
    digest = hashlib.sha256(raw.encode("utf-8")).digest()
    return base64.b64encode(digest)


MIN_PASSWORD_LENGTH = 8


def password_problem(raw: str) -> str | None:
    """Return a human-readable reason the password is unacceptable, or None."""
    if len(raw) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if raw.strip() == "":
        return "Password cannot be only whitespace."
    return None


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(_prehash(raw), bcrypt.gensalt()).decode("utf-8")


def verify_password(raw: str, hashed: str | None) -> bool:
    """Constant-time check that tolerates a missing or malformed hash.

    Accounts created through GitHub have no password_hash. Returning False
    rather than raising keeps the login endpoint's timing and error shape
    identical whether the address is unknown, GitHub-only, or simply wrong.
    """
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_prehash(raw), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        logger.warning("Malformed password hash encountered")
        return False


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def find_user_by_email(email: str) -> User | None:
    return await User.find_one(User.email_lower == normalize_email(email))


async def register_email_user(email: str, password: str, name: str | None = None) -> User:
    """Create an email/password account. Caller must have checked availability."""
    normalized = normalize_email(email)
    user = User(
        auth_provider="email",
        email=email.strip(),
        email_lower=normalized,
        password_hash=hash_password(password),
        login=normalized.split("@")[0] or normalized,
        name=(name or "").strip() or None,
    )
    await user.insert()
    logger.info("Registered email account %s", normalized)
    return user
