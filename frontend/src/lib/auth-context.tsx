"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, AuthState, AuthUser, clearToken, getToken } from "./api";

/**
 * Single source of truth for "who is signed in".
 *
 * Without this, every page called /auth/me independently — three requests on a
 * dashboard→chat→account walk, each with its own loading flicker. The provider
 * resolves the session once and shares it.
 */

interface AuthContextValue {
  loading: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  authRequired: boolean;
  githubConfigured: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await api.getAuthState();
    setState(next);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // A token written by the OAuth callback in another tab, or cleared by a 401,
  // should propagate rather than leaving this tab on a stale session.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "cprag-session") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api.logout();
    await refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    authenticated: !!state?.authenticated,
    user: state?.user ?? null,
    authRequired: state?.auth_required ?? true,
    githubConfigured: state?.github_oauth_configured ?? false,
    refresh,
    signOut,
  }), [loading, state, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * Wrap any page that must not render for signed-out visitors.
 *
 * Renders a skeleton while the session resolves — returning null would flash
 * the login page for a fraction of a second on every navigation, which reads
 * as a bug even when auth succeeds.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, authenticated, authRequired } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (authRequired && !authenticated) {
      // Preserve the destination so login can return the user to it.
      const next = encodeURIComponent(pathname || "/dashboard");
      router.replace(`/login?next=${next}`);
    }
  }, [loading, authenticated, authRequired, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-full max-w-5xl px-6 space-y-4">
          <div className="skeleton h-10 w-56" />
          <div className="skeleton h-4 w-80" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
            {[0, 1, 2].map(i => <div key={i} className="skeleton h-28 w-full" />)}
          </div>
        </div>
      </div>
    );
  }

  if (authRequired && !authenticated) {
    // The redirect above is already in flight; render nothing rather than a
    // half-populated page the user would see for one frame.
    return null;
  }

  return <>{children}</>;
}

/** True once a token exists locally, without waiting for the server round trip. */
export function hasLocalSession(): boolean {
  return !!getToken();
}

export { clearToken };
