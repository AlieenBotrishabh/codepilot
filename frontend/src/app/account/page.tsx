"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Code, ArrowLeft, Github, Mail, Lock, Loader2, ShieldCheck, ShieldAlert,
  Calendar, Clock, Database, FileCode, MessageSquare, GitBranch, Layers,
  LogOut, RefreshCw, AlertCircle, CheckCircle2, KeyRound, Unlink,
} from "lucide-react";
import { api, AccountStats, AuthUser } from "../../lib/api";
import { RequireAuth, useAuth } from "../../lib/auth-context";

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function AccountContent() {
  const router = useRouter();
  const { signOut, refresh } = useAuth();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getAccount();
      setUser(data.user);
      setStats(data.stats);
    } catch (err: any) {
      setError(err.message || "Could not load your account.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const disconnectGitHub = async () => {
    if (!confirm("Disconnect GitHub? Private repositories will no longer be readable.")) return;
    setBusy(true);
    try {
      await api.disconnectGitHub();
      await load();
      await refresh();
    } catch (err: any) {
      setError(err.message || "Could not disconnect GitHub.");
    } finally {
      setBusy(false);
    }
  };

  const STAT_CARDS = stats ? [
    { icon: <Database className="w-4 h-4" />,      label: "Repositories", value: stats.repositories,      sub: `${stats.repositories_ready} ready` },
    { icon: <FileCode className="w-4 h-4" />,      label: "Files indexed", value: stats.files_indexed.toLocaleString(), sub: "across all repos" },
    { icon: <Layers className="w-4 h-4" />,        label: "Vector chunks", value: stats.chunks_indexed.toLocaleString(), sub: "embeddings stored" },
    { icon: <MessageSquare className="w-4 h-4" />, label: "Conversations", value: stats.threads,           sub: `${stats.messages} messages` },
  ] : [];

  return (
    <div className="min-h-screen bg-white">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-gray-200">
        <nav className="px-6 py-4 flex items-center justify-between max-w-5xl mx-auto gap-4">
          <div
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-black">
              <Code className="w-[18px] h-[18px] text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight">CodePilot</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="secondary !px-4 !py-2 !text-sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin" : ""}`} /> Refresh
            </button>
            <button className="secondary !px-4 !py-2 !text-sm" onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            </button>
          </div>
        </nav>
      </header>

      <main className="px-6 pt-12 pb-24 max-w-5xl mx-auto">
        <div className="animate-fade-in-up" style={{ opacity: 0, animationDelay: "0.1s" }}>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-full px-3 py-1 mb-5">
            <KeyRound className="w-3 h-3" /> My Account
          </span>
          <h1 className="text-4xl md:text-5xl font-normal leading-[1.15] tracking-tight mb-3">
            Account{" "}
            <span className="bg-gradient-to-r from-black via-gray-500 to-gray-400 bg-clip-text text-transparent">
              overview
            </span>
          </h1>
          <p className="text-lg text-gray-600">
            Your profile, sign-in methods, and everything indexed under this account.
          </p>
        </div>

        {error && (
          <div className="fade-in flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mt-8">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="mt-10 space-y-4">
            <div className="skeleton h-32 w-full" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-28 w-full" />)}
            </div>
          </div>
        ) : user && (
          <>
            {/* ── Profile card ───────────────────────────────────── */}
            <section
              className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 md:p-8 hover-lift animate-fade-in-up"
              style={{ opacity: 0, animationDelay: "0.2s" }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="w-20 h-20 rounded-2xl border border-gray-200 object-cover"
                  />
                ) : (
                  <span className="w-20 h-20 rounded-2xl bg-gray-900 text-white flex items-center justify-center text-2xl font-semibold">
                    {(user.name || user.login || "?").charAt(0).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl font-semibold tracking-tight truncate">
                    {user.name || user.login}
                  </h2>
                  <p className="text-sm text-gray-600 truncate">{user.email || "No email on file"}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                      {user.auth_provider === "github"
                        ? <><Github className="w-3 h-3" /> GitHub account</>
                        : <><Mail className="w-3 h-3" /> Email account</>}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                      @{user.login}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mt-7 pt-6 border-t border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 flex-shrink-0">
                    <Calendar className="w-4 h-4" />
                  </span>
                  <span>
                    <span className="block text-[11px] uppercase tracking-wider text-gray-400">Member since</span>
                    <span className="block text-sm font-medium">{formatDate(user.created_at)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 flex-shrink-0">
                    <Clock className="w-4 h-4" />
                  </span>
                  <span>
                    <span className="block text-[11px] uppercase tracking-wider text-gray-400">Last sign-in</span>
                    <span className="block text-sm font-medium">{formatDate(user.last_login_at)}</span>
                  </span>
                </div>
              </div>
            </section>

            {/* ── Usage stats ────────────────────────────────────── */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              {STAT_CARDS.map((s, i) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-gray-200 bg-white p-5 hover-lift animate-fade-in-up"
                  style={{ opacity: 0, animationDelay: `${0.3 + i * 0.08}s` }}
                >
                  <span className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 mb-4">
                    {s.icon}
                  </span>
                  <div className="text-3xl font-semibold tracking-tight">{s.value}</div>
                  <div className="text-xs font-medium mt-1">{s.label}</div>
                  <div className="text-[11px] text-gray-500">{s.sub}</div>
                </div>
              ))}
            </section>

            {/* ── Sign-in methods ────────────────────────────────── */}
            <section
              className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 md:p-8 animate-fade-in-up"
              style={{ opacity: 0, animationDelay: "0.5s" }}
            >
              <h3 className="text-lg font-semibold tracking-tight mb-1">Sign-in methods</h3>
              <p className="text-sm text-gray-600 mb-6">
                Both can be attached to one account. Linking happens automatically
                when the email addresses match.
              </p>

              <div className="space-y-3">
                {/* Password */}
                <div className="flex items-center gap-4 rounded-xl border border-gray-200 px-4 py-3.5">
                  <span className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 flex-shrink-0">
                    <Lock className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">Email &amp; password</span>
                    <span className="block text-xs text-gray-500">
                      {user.has_password
                        ? `Enabled for ${user.email}`
                        : "Not set — this account signs in with GitHub"}
                    </span>
                  </span>
                  {user.has_password ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">Not configured</span>
                  )}
                </div>

                {/* GitHub */}
                <div className="flex items-center gap-4 rounded-xl border border-gray-200 px-4 py-3.5">
                  <span className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 flex-shrink-0">
                    <Github className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">GitHub</span>
                    <span className="block text-xs text-gray-500">
                      {user.github_connected
                        ? (user.can_read_private
                            ? "Connected with repository access"
                            : "Connected, but without repository access")
                        : "Not connected"}
                    </span>
                  </span>

                  {user.github_connected ? (
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                        user.can_read_private
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}>
                        {user.can_read_private
                          ? <><ShieldCheck className="w-3 h-3" /> Full access</>
                          : <><ShieldAlert className="w-3 h-3" /> Limited</>}
                      </span>
                      <button
                        disabled={busy}
                        onClick={disconnectGitHub}
                        className="secondary !px-3 !py-1.5 !text-xs"
                        title="Forget the stored GitHub token"
                      >
                        {busy ? <Loader2 className="w-3 h-3 spin" /> : <Unlink className="w-3 h-3" />}
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { window.location.href = api.githubLoginUrl(); }}
                      className="!px-4 !py-1.5 !text-xs"
                    >
                      <Github className="w-3 h-3" /> Connect
                    </button>
                  )}
                </div>
              </div>

              {user.github_connected && !user.can_read_private && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    This connection predates repository access. Reconnect to grant
                    it and enable the &quot;My GitHub&quot; ingestion tab.
                  </span>
                </div>
              )}

              {user.github_scopes && (
                <p className="text-[11px] text-gray-400 mt-4 font-mono">
                  scopes: {user.github_scopes}
                </p>
              )}
            </section>

            {/* ── Languages ──────────────────────────────────────── */}
            {stats && stats.languages.length > 0 && (
              <section
                className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6 md:p-8 relative overflow-hidden animate-fade-in-up"
                style={{ opacity: 0, animationDelay: "0.6s" }}
              >
                <div className="absolute inset-0 dot-bg opacity-60 pointer-events-none" />
                <div className="relative">
                  <h3 className="text-lg font-semibold tracking-tight mb-1 flex items-center gap-2">
                    <GitBranch className="w-4 h-4" /> Languages indexed
                  </h3>
                  <p className="text-sm text-gray-600 mb-5">
                    Detected across your {stats.repositories} repositor
                    {stats.repositories === 1 ? "y" : "ies"}.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {stats.languages.map((l, i) => (
                      <span
                        key={l}
                        className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white text-gray-700 animate-fade-in-up"
                        style={{ opacity: 0, animationDelay: `${0.65 + i * 0.04}s` }}
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ── Danger / session ───────────────────────────────── */}
            <section
              className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 md:p-8 animate-fade-in-up"
              style={{ opacity: 0, animationDelay: "0.7s" }}
            >
              <h3 className="text-lg font-semibold tracking-tight mb-1">Session</h3>
              <p className="text-sm text-gray-600 mb-5">
                Sessions are stateless tokens, so signing out discards the token on
                this device. It does not revoke it server-side.
              </p>
              <button
                onClick={async () => { await signOut(); router.replace("/login"); }}
                className="secondary !px-5 !py-2.5 !text-sm"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountContent />
    </RequireAuth>
  );
}
