"""
CodePilot RAG — Authentication Routes

GitHub is the identity provider only. Signing in proves who you are; it grants
this application no access to your repositories.

Flow:
    1. Browser hits  GET /auth/github/login       -> redirect to GitHub consent
    2. GitHub calls  GET /auth/github/callback    -> read profile, issue JWT
    3. Browser is redirected to the frontend with the token in the URL fragment
    4. Frontend stores the token and sends it as  Authorization: Bearer <jwt>
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse

from app.api.deps import get_optional_user
from app.config import get_settings
from app.models.db_models import User
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
        # The access token lives only for the duration of this request.
        token = await auth_service.exchange_code_for_token(code, _callback_url(request))
        profile = await auth_service.fetch_github_profile(token)
        user = await auth_service.upsert_user(profile)
    except Exception as exc:
        logger.error("GitHub OAuth exchange failed: %s", exc)
        return _frontend_redirect("error=exchange_failed")

    return _frontend_redirect(f"token={auth_service.create_session_token(user)}")


# ── Session ─────────────────────────────────────────────────────────────────

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
        "user": {
            "user_id": user.user_id,
            "login": user.login,
            "name": user.name,
            "email": user.email,
            "avatar_url": user.avatar_url,
        },
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
