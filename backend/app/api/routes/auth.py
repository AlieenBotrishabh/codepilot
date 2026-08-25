"""
CodePilot RAG — Authentication Routes

GitHub provides both identity and repository access. Signing in proves who you
are and authorizes CodePilot to list and clone repositories you can reach,
including private ones when the "repo" scope is granted.

Flow:
    1. Browser hits  GET /auth/github/login       -> redirect to GitHub consent
    2. GitHub calls  GET /auth/github/callback    -> read profile, issue JWT
    3. Browser is redirected to the frontend with the token in the URL fragment
    4. Frontend stores the token and sends it as  Authorization: Bearer <jwt>
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from fastapi.responses import RedirectResponse

from app.api.deps import get_optional_user, require_user
from app.config import get_settings
from app.models.db_models import User, utcnow
from app.services import auth_service

logger = logging.getLogger("copilot-rag.auth")
router = APIRouter(tags=["Authentication"])
settings = get_settings()


def _callback_url(request: Request) -> str:
    """Absolute callback URL, which must match the GitHub OAuth App exactly."""
    return str(request.url_for("github_callback"))


def _frontend_redirect(fragment: str) -> RedirectResponse:
    """Send the browser back to the app with a result in the URL fragment.

    A fragment is used rather than a query string because fragments are not
    sent to servers, kept in access logs, or forwarded in the Referer header.
    """
    base = settings.frontend_url.rstrip("/")
    return RedirectResponse(url=f"{base}/auth/callback#{fragment}", status_code=302)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


def _session_payload(user: User) -> dict:
    """Shape returned by both register and login."""
    return {
        "token": auth_service.create_session_token(user),
        "user": _public_user(user),
    }


# ── Email + password ────────────────────────────────────────────

@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    """Create an email/password account and return a session immediately."""
    problem = auth_service.password_problem(body.password)
    if problem:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=problem)

    existing = await auth_service.find_user_by_email(body.email)
    if existing is not None:
        # The address is already taken. Whether it belongs to a password account
        # or a GitHub one changes what the user should do next, so the message
        # distinguishes them — this reveals nothing an attacker cannot learn by
        # attempting to register anyway.
        if existing.has_password:
            detail = "An account with this email already exists. Sign in instead."
        else:
            detail = (
                "This email is already registered through GitHub. "
                "Use 'Continue with GitHub' to sign in."
            )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    user = await auth_service.register_email_user(body.email, body.password, body.name)
    return _session_payload(user)


@router.post("/auth/login")
async def login(body: LoginRequest):
    """Exchange email + password for a session token."""
    user = await auth_service.find_user_by_email(body.email)

    # One message for every failure mode — unknown address, wrong password, or
    # a GitHub-only account — so the endpoint cannot be used to enumerate which
    # addresses are registered.
    if user is None or not auth_service.verify_password(body.password, user.password_hash):
        logger.info("Failed password login for %s", auth_service.normalize_email(body.email))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    user.last_login_at = utcnow()
    await user.save()
    return _session_payload(user)


# ── OAuth ───────────────────────────────────────────────────────────────────

@router.get("/auth/github/login")
async def github_login(request: Request):
    """Begin the GitHub OAuth handshake."""
    if not settings.github_oauth_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "GitHub sign-in is not configured on this deployment. "
                "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET."
            ),
        )
    return RedirectResponse(
        url=auth_service.build_authorize_url(_callback_url(request)),
        status_code=302,
    )


@router.get("/auth/github/callback", name="github_callback")
async def github_callback(request: Request, code: str | None = None,
                          state: str | None = None, error: str | None = None):
    """Complete the handshake and hand a session token to the frontend.

    Errors redirect back to the app rather than rendering JSON, because the
    caller here is a browser mid-redirect, not an API client.
    """
    if error:
        logger.warning("GitHub OAuth denied: %s", error)
        return _frontend_redirect(f"error={error}")

    if not code:
        return _frontend_redirect("error=missing_code")

    # Single-use state: blocks CSRF and replayed callbacks alike.
    if not auth_service.consume_state(state):
        logger.warning("GitHub OAuth callback with invalid or reused state")
        return _frontend_redirect("error=invalid_state")

    try:
        token, scopes = await auth_service.exchange_code_for_token(
            code, _callback_url(request)
        )
        profile = await auth_service.fetch_github_profile(token)
        user = await auth_service.upsert_user(profile, token, scopes)
    except Exception as exc:
        logger.error("GitHub OAuth exchange failed: %s", exc)
        return _frontend_redirect("error=exchange_failed")

    return _frontend_redirect(f"token={auth_service.create_session_token(user)}")


# ── Session ─────────────────────────────────────────────────────────────────

def _public_user(user: User) -> dict:
    """Everything the account page needs, and nothing secret.

    Deliberately omits password_hash and the encrypted GitHub token; only their
    presence is reported, as booleans.
    """
    return {
        "user_id": user.user_id,
        "login": user.login,
        "name": user.name,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "auth_provider": user.auth_provider,
        "has_password": user.has_password,
        "github_connected": bool(
            auth_service.decrypt_token(user.encrypted_github_token)
        ),
        "can_read_private": "repo" in (user.github_scopes or ""),
        "github_scopes": user.github_scopes,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }


@router.get("/auth/me")
async def read_me(user: User | None = Depends(get_optional_user)):
    """Return the current session, or an anonymous marker.

    Deliberately 200-with-null rather than 401, so the frontend can call this
    on boot to decide what to render without treating "logged out" as an error.
    """
    if user is None:
        return {
            "authenticated": False,
            "user": None,
            "auth_required": settings.auth_required,
            "github_oauth_configured": settings.github_oauth_configured,
        }

    return {
        "authenticated": True,
        "auth_required": settings.auth_required,
        "github_oauth_configured": settings.github_oauth_configured,
        "user": _public_user(user),
    }


@router.post("/auth/logout")
async def logout(user: User | None = Depends(get_optional_user)):
    """Log out.

    Sessions are stateless JWTs, so the server cannot revoke one; the client
    discards it. Documented plainly rather than implying a revocation that does
    not happen. Shorten JWT_EXPIRY_HOURS if the exposure window matters.
    """
    return {
        "message": "Signed out. Discard the session token on the client.",
        "revoked_server_side": False,
    }


@router.delete("/auth/github/disconnect")
async def disconnect_github(user: User = Depends(require_user)):
    """Forget the stored GitHub token while keeping the account."""
    user.encrypted_github_token = None
    user.github_scopes = None
    await user.save()
    return {"message": "GitHub disconnected. Private repositories are no longer readable."}


# ── GitHub repositories ────────────────────────────────────────

@router.get("/github/repos")
async def list_github_repos(user: User = Depends(require_user)):
    """List repositories the signed-in user can access, private included."""
    token = auth_service.decrypt_token(user.encrypted_github_token)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub is not connected for this account. Sign in with GitHub again.",
        )

    granted = user.github_scopes or ""
    can_read_private = "repo" in granted

    # A token issued before the "repo" scope was added cannot see repositories
    # at all — /user/repos returns an empty list rather than an error. Reporting
    # that as "no repositories found" sends people hunting for a problem that
    # does not exist, so the scope gap is detected explicitly and surfaced as
    # the actionable thing it is: sign in again to grant the wider scope.
    if not can_read_private:
        logger.info(
            "User %s has scopes '%s' — missing 'repo', cannot list repositories",
            user.login, granted or "(none)",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your GitHub connection was authorized before repository access "
                "was enabled, so it cannot list your repositories. Sign out and "
                "sign in with GitHub again to grant it."
            ),
        )

    try:
        repos = await auth_service.list_user_repositories(token)
    except Exception as exc:
        logger.error("Failed to list GitHub repositories for %s: %s", user.login, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach the GitHub API. Try again shortly.",
        )

    return {
        "repos": repos,
        "total": len(repos),
        "can_read_private": can_read_private,
        "granted_scopes": granted,
    }


@router.get("/auth/account")
async def account_overview(user: User = Depends(require_user)):
    """Profile plus a usage summary for the account page.

    Counts are scoped to this user, so the numbers match exactly what the
    dashboard shows them.
    """
    from app.models.db_models import Repository, Thread, Message

    repos = await Repository.find(Repository.owner_id == user.user_id).to_list()
    thread_count = await Thread.find(Thread.owner_id == user.user_id).count()

    repo_ids = [r.repo_id for r in repos]
    message_count = 0
    if repo_ids:
        message_count = await Message.find({"repo_id": {"$in": repo_ids}}).count()

    languages = sorted({lang for r in repos for lang in (r.languages or [])})

    return {
        "user": _public_user(user),
        "stats": {
            "repositories": len(repos),
            "repositories_ready": sum(1 for r in repos if r.status == "ready"),
            "private_repositories": sum(1 for r in repos if getattr(r, "is_private", False)),
            "files_indexed": sum(r.file_count for r in repos),
            "chunks_indexed": sum(r.chunk_count for r in repos),
            "threads": thread_count,
            "messages": message_count,
            "languages": languages,
        },
    }
