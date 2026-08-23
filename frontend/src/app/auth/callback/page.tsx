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

const ERROR_COPY: Record<string, string> = {
  access_denied: "You cancelled the GitHub authorization.",
  invalid_state:
    "This sign-in link has expired or was already used. Please try signing in again.",
  exchange_failed:
    "GitHub accepted the sign-in but the token exchange failed. Check the server's GitHub OAuth credentials.",
  missing_code: "GitHub did not return an authorization code.",
};

function CallbackHandler() {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    // The fragment is only available client-side — this cannot run on the server.
    const fragment = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const params = new URLSearchParams(fragment);

    const token = params.get("token");
    const error = params.get("error");

    if (error) {
      setStatus("error");
      setMessage(ERROR_COPY[error] || `Sign-in failed: ${error}`);
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
              <button
                onClick={() => router.replace("/dashboard")}
                className="!bg-black !text-white !px-6 !py-2.5 !rounded-full !text-sm !font-medium hover:!bg-gray-800 mt-2"
              >
                Back to dashboard
              </button>
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
