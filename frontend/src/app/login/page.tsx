"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Code, Github, Loader2, Mail, Lock, User as UserIcon,
  AlertCircle, ArrowRight, Eye, EyeOff, Sparkles, ShieldCheck, Zap,
} from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

type Mode = "login" | "register";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { authenticated, loading: authLoading, githubConfigured, refresh } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Where to land after a successful sign-in.
  const next = params.get("next") || "/dashboard";

  // Already signed in? Skip the form entirely.
  useEffect(() => {
    if (!authLoading && authenticated) router.replace(next);
  }, [authLoading, authenticated, router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(email, password, name);
      } else {
        await api.login(email, password);
      }
      await refresh();
      router.replace(next);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
  };

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row">
      {/* ── Left: the form ─────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div
          className="w-full max-w-sm animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.1s" }}
        >
          <div
            className="flex items-center gap-2 mb-10 cursor-pointer select-none"
            onClick={() => router.push("/")}
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-black">
              <Code className="w-5 h-5 text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight">CodePilot</span>
          </div>

          <h1 className="text-3xl font-normal tracking-tight mb-2">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-gray-600 mb-8">
            {mode === "login"
              ? "Sign in to reach your indexed codebases."
              : "Your repositories stay private to your account."}
          </p>

          {/* Mode toggle */}
          <div className="bg-gray-100 rounded-lg p-1 grid grid-cols-2 gap-1 mb-7">
            {(["login", "register"] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`!rounded-md !px-4 !py-2 !text-sm !font-medium !shadow-none transition-colors ${
                  mode === m
                    ? "!bg-white !text-black shadow-sm"
                    : "!bg-transparent !text-gray-600 hover:!text-black"
                }`}
              >
                {m === "login" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === "register" && (
              <div className="fade-in">
                <label className="block text-sm font-medium mb-1.5">
                  Name <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ada Lovelace"
                    disabled={busy}
                    className="!pl-10"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={busy}
                  className="!pl-10"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                  disabled={busy}
                  className="!pl-10 !pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="ghost absolute right-2 top-1/2 -translate-y-1/2"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === "register" && (
                <p className="text-xs text-gray-500 mt-1.5">Minimum 8 characters.</p>
              )}
            </div>

            {error && (
              <div className="fade-in flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !email || !password}
              className="!w-full !bg-black !text-white !py-3 !rounded-full !text-sm !font-medium hover:!bg-gray-800 mt-1"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 spin" />
                  {mode === "login" ? "Signing in…" : "Creating account…"}
                </>
              ) : (
                <>
                  {mode === "login" ? "Sign in" : "Create account"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {githubConfigured && (
            <>
              <div className="flex items-center gap-3 my-6">
                <span className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400">or</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => { window.location.href = api.githubLoginUrl(); }}
                className="secondary !w-full !py-3 !rounded-full !text-sm !font-medium"
              >
                <Github className="w-4 h-4" /> Continue with GitHub
              </button>

              <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                Signing in with GitHub using an email address you already
                registered links both to the same account.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Right: value panel (desktop only) ──────────────────────── */}
      <div className="hidden lg:flex flex-1 bg-gray-50 border-l border-gray-200 items-center justify-center px-12 relative overflow-hidden">
        <div className="absolute inset-0 dot-bg opacity-60 pointer-events-none" />
        <div
          className="relative max-w-sm animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.25s" }}
        >
          <h2 className="text-2xl font-normal tracking-tight mb-6">
            Your codebase,{" "}
            <span className="bg-gradient-to-r from-black via-gray-500 to-gray-400 bg-clip-text text-transparent">
              understood
            </span>
          </h2>
          <ul className="space-y-5">
            {[
              {
                icon: <ShieldCheck className="w-4 h-4" />,
                title: "Private by default",
                desc: "Repositories are scoped to your account. Nobody else can list, read or delete them.",
              },
              {
                icon: <Sparkles className="w-4 h-4" />,
                title: "Answers with citations",
                desc: "Every response names the files it was grounded in — or refuses rather than guessing.",
              },
              {
                icon: <Zap className="w-4 h-4" />,
                title: "Patches you can apply",
                desc: "Review a unified diff line by line, then apply it and let the index re-sync.",
              },
            ].map((f, i) => (
              <li
                key={f.title}
                className="flex gap-3.5 animate-fade-in-up"
                style={{ opacity: 0, animationDelay: `${0.35 + i * 0.1}s` }}
              >
                <span className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-900 flex-shrink-0">
                  {f.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="block text-xs text-gray-600 leading-relaxed mt-0.5">
                    {f.desc}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center h-screen gap-4">
          <Loader2 className="w-8 h-8 spin text-gray-900" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
