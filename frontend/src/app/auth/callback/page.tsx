"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2, Code } from "lucide-react";
import { setToken } from "../../../lib/api";

/**
 * Landing point for the GitHub OAuth handshake.
 *
 * The backend redirects here with the result in the URL *fragment*
 * (#token=... or #error=...). A fragment is never sent to a server, so the
 * session token stays out of access logs, proxy logs and the Referer header.
 * It is read client-side, persisted, and immediately stripped from the URL.
 */

/** Top-level failure, keyed by the `error` fragment value. */
const ERROR_COPY: Record<string, string> = {
  access_denied: "You cancelled the GitHub authorization.",
  invalid_state:
    "This sign-in link has expired or was already used. Please start again from the login page.",
  missing_code: "GitHub did not return an authorization code.",
  token_exchange: "GitHub could not complete the sign-in.",
  profile_fetch:
    "Sign-in succeeded but your GitHub profile could not be read. This is usually a temporary GitHub API problem.",
  account_save:
    "Sign-in succeeded but your account could not be saved. This is a problem on our side, not with GitHub.",
  // Kept so links issued by an older build still render something sensible.
  exchange_failed: "GitHub could not complete the sign-in.",
};

/**
 * Second-level detail for token_exchange, keyed by GitHub's own error code.
 *
 * Each entry names the concrete misconfiguration, because "check your
 * credentials" sends people to re-paste a secret that was often fine — the
 * redirect_uri and an expired code are far more common causes.
 */
const REASON_COPY: Record<string, string> = {
  not_configured:
    "The server has no GitHub client ID or secret set. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
  incorrect_client_credentials:
    "GitHub rejected the client ID or secret. Re-copy the secret from the OAuth App — a trailing space or newline is the usual culprit.",
  redirect_uri_mismatch:
    "The callback URL does not match the one registered on the OAuth App. It must match exactly, including https and no trailing slash.",
  bad_verification_code:
    "The authorization code was already used or has expired. Codes are single-use — start the sign-in again.",
  unknown_client:
    "No GitHub OAuth App matches the configured client ID. Check GITHUB_CLIENT_ID against the App on github.com/settings/developers.",
  github_unavailable: "GitHub is having trouble right now. Try again shortly.",
  network_error: "The server could not reach GitHub. Try again shortly.",
  http_error: "GitHub returned an unexpected status. Try again shortly.",
  bad_response: "GitHub returned a response we could not parse.",
  no_token: "GitHub completed the handshake without issuing a token.",
  unexpected: "An unexpected error occurred while contacting GitHub.",
};

function CallbackHandler() {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Completing sign-in…");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    // The fragment is only available client-side — this cannot run on the server.
    const fragment = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const params = new URLSearchParams(fragment);

    const token = params.get("token");
    const error = params.get("error");
    const reason = params.get("reason");

    if (error) {
      setStatus("error");
      setMessage(ERROR_COPY[error] || `Sign-in failed: ${error}`);
      // The reason narrows a token_exchange failure to an actionable cause.
      setDetail(reason ? (REASON_COPY[reason] || `GitHub reported: ${reason}`) : "");
      return;
    }

    if (!token) {
      setStatus("error");
      setMessage(
        "No session token was returned. Try signing in again from the dashboard."
      );
      return;
    }

    setToken(token);

    // Remove the token from the address bar so it is not left in history or
    // exposed by a shared screenshot.
    window.history.replaceState({}, "", "/auth/callback");

    setStatus("ok");
    setMessage("Signed in. Redirecting…");
    const t = setTimeout(() => router.replace("/dashboard"), 900);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center animate-fade-in-up"
        style={{ opacity: 0, animationDelay: "0.1s" }}
      >
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-black mb-6">
          <Code className="w-5 h-5 text-white" />
        </span>

        <div className="flex flex-col items-center gap-4">
          {status === "working" && (
            <>
              <Loader2 className="w-7 h-7 spin text-gray-900" />
              <p className="text-sm text-gray-600">{message}</p>
            </>
          )}

          {status === "ok" && (
            <>
              <span className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
              <p className="text-sm text-gray-600">{message}</p>
            </>
          )}

          {status === "error" && (
            <>
              <span className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </span>
              <h1 className="text-xl font-semibold tracking-tight">Sign-in failed</h1>
              <p className="text-sm text-gray-600 leading-relaxed">{message}</p>

              {detail && (
                <div className="w-full text-left rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mt-1">
                  <p className="text-xs text-amber-800 leading-relaxed">{detail}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                <button
                  onClick={() => router.replace("/login")}
                  className="!bg-black !text-white !px-6 !py-2.5 !rounded-full !text-sm !font-medium hover:!bg-gray-800"
                >
                  Try again
                </button>
                <button
                  onClick={() => router.replace("/login")}
                  className="secondary !px-6 !py-2.5 !rounded-full !text-sm !font-medium"
                >
                  Use email instead
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <Loader2 className="w-8 h-8 spin text-gray-900" />
          <p className="text-sm text-gray-500">Completing sign-in…</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
