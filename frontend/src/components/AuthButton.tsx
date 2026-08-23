"use client";

import { useEffect, useState } from "react";
import { Github, LogOut, Loader2, ShieldCheck } from "lucide-react";
import { api, AuthState } from "../lib/api";

/**
 * Sign-in control for page headers.
 *
 * Renders nothing at all when the backend reports that GitHub OAuth is not
 * configured, so a deployment without credentials does not show a button that
 * can only produce a 503.
 */
export default function AuthButton({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getAuthState().then(s => { if (alive) setState(s); });
    return () => { alive = false; };
  }, []);

  // Still probing, or the deployment has no OAuth app configured.
  if (!state || !state.github_oauth_configured) return null;

  if (!state.authenticated) {
    return (
      <button
        onClick={() => { window.location.href = api.githubLoginUrl(); }}
        className="!bg-black !text-white !px-4 !py-2 !rounded-full !text-sm !font-medium hover:!bg-gray-800"
        title="Sign in with GitHub"
      >
        <Github className="w-4 h-4" />
        {compact ? "Sign in" : "Sign in with GitHub"}
      </button>
    );
  }

  const user = state.user!;

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(o => !o)}
        className="!bg-white !text-gray-700 !border !border-gray-200 !px-2 !py-1.5 !rounded-full hover:!bg-gray-50"
        title={user.login}
      >
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt=""
            className="w-6 h-6 rounded-full"
          />
        ) : (
          <Github className="w-4 h-4" />
        )}
        {!compact && (
          <span className="text-sm font-medium max-w-[110px] truncate">{user.login}</span>
        )}
      </button>

      {menuOpen && (
        <>
          {/* click-away layer */}
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-60 rounded-xl border border-gray-200 bg-white shadow-lg p-3 fade-in">
            <div className="px-1 pb-2.5 mb-2.5 border-b border-gray-100">
              <p className="text-sm font-semibold truncate">{user.name || user.login}</p>
              <p className="text-xs text-gray-500 truncate">{user.email || `@${user.login}`}</p>
            </div>

            <div className="flex items-center gap-2 px-1 pb-2.5 text-xs text-gray-600">
              <ShieldCheck
                className={`w-3.5 h-3.5 ${user.can_read_private ? "text-emerald-600" : "text-gray-400"}`}
              />
              {user.can_read_private
                ? "Private repositories readable"
                : "Public repositories only"}
            </div>

            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await api.logout();
                window.location.reload();
              }}
              className="!w-full !justify-start !bg-transparent !text-gray-700 !shadow-none hover:!bg-gray-50 !px-2 !py-2 !rounded-lg !text-sm"
            >
              {busy ? <Loader2 className="w-4 h-4 spin" /> : <LogOut className="w-4 h-4" />}
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
