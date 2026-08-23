"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Code,
  Sparkles,
  Plus,
  RefreshCw,
  LayoutDashboard,
  FileCode,
  Database,
  ArrowLeft,
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  X,
} from "lucide-react";
import { api, RepoInfo } from "../../lib/api";
import AuthButton from "../../components/AuthButton";

const THEMES = [
  { id: "nebula",  label: "Nebula",  color: "#7c3aed" },
  { id: "aurora",  label: "Aurora",  color: "#059669" },
  { id: "sunset",  label: "Sunset",  color: "#ea580c" },
  { id: "ocean",   label: "Ocean",   color: "#2563eb" },
];

const SORTS = [
  { id: "recent", label: "Newest" },
  { id: "name",   label: "Name" },
  { id: "files",  label: "Most files" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

interface Toast { id: string; message: string; type: "success" | "error" | "info"; }
let _toastId = 0;
function makeToast(set: React.Dispatch<React.SetStateAction<Toast[]>>, message: string, type: Toast["type"] = "info") {
  const id = `t${_toastId++}`;
  set(prev => [...prev, { id, message, type }]);
  setTimeout(() => set(prev => prev.filter(t => t.id !== id)), 3500);
}

const STATUS_STYLES: Record<string, string> = {
  ready:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  error:    "bg-red-50 text-red-700 border-red-200",
  indexing: "bg-amber-50 text-amber-700 border-amber-200",
};

function DashboardContent() {
  const router = useRouter();
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [theme, setTheme] = useState("nebula");
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── Presentation-only controls ────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortId>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cprag-theme", theme);
  }, [theme]);

  // Load saved theme
  useEffect(() => {
    const saved = localStorage.getItem("cprag-theme");
    if (saved && THEMES.some(t => t.id === saved)) setTheme(saved);
  }, []);

  // Load repos on mount
  useEffect(() => { loadRepos(); }, []);

  const loadRepos = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const list = await api.listRepos();
      setRepos(list);
    } catch {
      setErrorMessage("Failed to load codebase repository list.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (repoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this codebase index? This action is permanent.")) return;
    try {
      await api.deleteRepo(repoId);
      loadRepos();
      makeToast(setToasts, "Codebase index deleted successfully.", "info");
    } catch {
      makeToast(setToasts, "Failed to delete codebase index.", "error");
    }
  };

  const startWorkspace = (repoId: string) => router.push(`/chat?repo_id=${repoId}`);

  // Summary stats
  const totalRepos = repos.length;
  const totalFiles = repos.reduce((acc, r) => acc + r.file_count, 0);
  const totalChunks = repos.reduce((acc, r) => acc + r.chunk_count, 0);

  // Client-side filtering + sorting (display only)
  const visibleRepos = repos
    .filter(r => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.languages.some(l => l.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "files") return b.file_count - a.file_count;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div className="min-h-screen bg-white">
      {/* ══ HEADER ══════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-gray-200">
        <nav className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto gap-4">
          <div
            onClick={() => router.push("/")}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-black">
              <Code className="w-[18px] h-[18px] text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight">CodePilot</span>
            <span className="hidden sm:inline-block text-[10px] font-semibold tracking-widest text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
              RAG
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="theme-switcher hidden md:flex">
              {THEMES.map(t => (
                <div
                  key={t.id}
                  className={`theme-dot${theme === t.id ? " active" : ""}`}
                  style={{ background: t.color }}
                  title={t.label}
                  onClick={() => setTheme(t.id)}
                />
              ))}
            </div>
            <AuthButton compact />
            <button className="secondary !px-4 !py-2 !text-sm hidden sm:inline-flex" onClick={() => router.push("/")}>
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button className="secondary !px-4 !py-2 !text-sm" onClick={loadRepos} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "spin" : ""}`} /> Refresh
            </button>
            <button
              onClick={() => router.push("/ingest")}
              className="!bg-black !text-white !px-5 !py-2.5 !rounded-full !text-sm !font-medium hover:!bg-gray-800"
            >
              <Plus className="w-4 h-4" /> Ingest
            </button>
          </div>
        </nav>
      </header>

      <main className="px-6 pt-12 pb-24 max-w-7xl mx-auto">
        {/* ══ TITLE ═════════════════════════════════════════════════════ */}
        <div className="animate-fade-in-up" style={{ opacity: 0, animationDelay: "0.1s" }}>
          <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-full px-3 py-1 mb-5">
            <LayoutDashboard className="w-3 h-3" /> Dashboard Workspace
          </span>
          <h1 className="text-4xl md:text-5xl font-normal leading-[1.15] tracking-tight mb-3">
            Indexed{" "}
            <span className="bg-gradient-to-r from-black via-gray-500 to-gray-400 bg-clip-text text-transparent">
              workspace codebases
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl">
            Select an active repository to start debugging, review code architecture,
            or write unified patches.
          </p>
        </div>

        {/* ══ STATS ═════════════════════════════════════════════════════ */}
        <section
          className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-200 rounded-2xl overflow-hidden border border-gray-200 mt-10 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.2s" }}
        >
          {[
            { label: "Active Repositories", value: totalRepos.toLocaleString(),   icon: <Code className="w-4 h-4" />,     desc: "Ingested codebases ready for analysis" },
            { label: "Files Indexed",       value: totalFiles.toLocaleString(),   icon: <FileCode className="w-4 h-4" />, desc: "Total source files processed" },
            { label: "Vector Chunks",       value: totalChunks.toLocaleString(),  icon: <Database className="w-4 h-4" />, desc: "Embeddings stored in Chroma DB" },
          ].map(stat => (
            <div key={stat.label} className="bg-white px-6 py-7">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
                  {stat.label}
                </span>
                <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
                  {stat.icon}
                </span>
              </div>
              <div className="text-4xl font-semibold tracking-tight">{stat.value}</div>
              <p className="text-xs text-gray-500 mt-1.5">{stat.desc}</p>
            </div>
          ))}
        </section>

        {/* ══ TOOLBAR ═══════════════════════════════════════════════════ */}
        <section
          className="flex flex-col md:flex-row md:items-center gap-3 mt-10 mb-6 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.3s" }}
        >
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search repositories or languages…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="!pl-10 !pr-10 !py-2.5 !rounded-full"
            />
            {search && (
              <button
                className="ghost absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setSearch("")}
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 mx-2" />
              {SORTS.map(sortOption => (
                <button
                  key={sortOption.id}
                  onClick={() => setSortBy(sortOption.id)}
                  className={`!rounded-md !px-3 !py-1.5 !text-xs !font-medium !shadow-none ${
                    sortBy === sortOption.id
                      ? "!bg-white !text-black shadow-sm"
                      : "!bg-transparent !text-gray-600 hover:!text-black"
                  }`}
                >
                  {sortOption.label}
                </button>
              ))}
            </div>

            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              {([
                { id: "grid", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
                { id: "list", icon: <List className="w-3.5 h-3.5" /> },
              ] as const).map(v => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  title={`${v.id} view`}
                  className={`!rounded-md !px-2.5 !py-1.5 !shadow-none ${
                    view === v.id
                      ? "!bg-white !text-black shadow-sm"
                      : "!bg-transparent !text-gray-500 hover:!text-black"
                  }`}
                >
                  {v.icon}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ══ LIST ══════════════════════════════════════════════════════ */}
        <section className="animate-fade-in-up" style={{ opacity: 0, animationDelay: "0.4s" }}>
          {errorMessage && (
            <div className="fade-in flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {loading && repos.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className="rounded-2xl border border-gray-200 p-6">
                  <div className="skeleton h-5 w-2/3 mb-4" />
                  <div className="skeleton h-3 w-1/3 mb-6" />
                  <div className="flex gap-3">
                    <div className="skeleton h-14 flex-1" />
                    <div className="skeleton h-14 flex-1" />
                  </div>
                </div>
              ))}
            </div>
          ) : repos.length === 0 ? (
            <div className="rounded-3xl border border-gray-200 bg-gray-50 px-8 py-20 text-center relative overflow-hidden">
              <div className="absolute inset-0 dot-bg opacity-60 pointer-events-none" />
              <div className="relative flex flex-col items-center">
                <span className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mb-5">
                  <Code className="w-6 h-6 text-gray-400" />
                </span>
                <p className="text-xl font-semibold tracking-tight mb-2">No Codebases Indexed</p>
                <p className="text-sm text-gray-600 max-w-sm mb-7">
                  Get started by uploading a ZIP file, specifying a local folder, or providing a public GitHub URL.
                </p>
                <button
                  onClick={() => router.push("/ingest")}
                  className="!bg-black !text-white !px-7 !py-3 !rounded-full !text-sm !font-medium hover:!bg-gray-800"
                >
                  <Plus className="w-4 h-4" /> Ingest Your First Codebase
                </button>
              </div>
            </div>
          ) : visibleRepos.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 px-8 py-16 text-center">
              <p className="text-sm text-gray-600">
                No repositories match <span className="font-medium text-black">“{search}”</span>.
              </p>
            </div>
          ) : (
            <div
              className={
                view === "grid"
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
                  : "flex flex-col gap-3"
              }
            >
              {visibleRepos.map((repo, idx) => (
                <div
                  key={repo.repo_id}
                  className={`group repo-card rounded-2xl border border-gray-200 bg-white hover-lift ${
                    view === "grid" ? "p-6 flex flex-col gap-4" : "px-5 py-4 flex items-center gap-4 flex-wrap"
                  } ${repo.status === "ready" ? "cursor-pointer" : "cursor-default"}`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                  onClick={() => repo.status === "ready" && startWorkspace(repo.repo_id)}
                >
                  {/* Title row */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center flex-shrink-0">
                      <Code className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold truncate" title={repo.name}>
                        {repo.name}
                      </h3>
                      <p className="text-xs text-gray-500 truncate">
                        Ingested {new Date(repo.created_at).toLocaleDateString("en-US", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </p>
                    </div>
                    <button
                      className="ghost opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={e => handleDelete(repo.repo_id, e)}
                      title="Delete codebase"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Metrics */}
                  <div className={view === "grid" ? "grid grid-cols-2 gap-3" : "flex gap-3"}>
                    {[
                      { v: repo.file_count.toLocaleString(),  l: "Files" },
                      { v: repo.chunk_count.toLocaleString(), l: "Chunks" },
                    ].map(m => (
                      <div
                        key={m.l}
                        className={`rounded-xl border border-gray-200 bg-gray-50 ${
                          view === "grid" ? "px-3 py-2.5 text-center" : "px-3 py-1.5 text-center min-w-[76px]"
                        }`}
                      >
                        <span className="block text-base font-semibold tracking-tight">{m.v}</span>
                        <span className="block text-[10px] uppercase tracking-wider text-gray-500">{m.l}</span>
                      </div>
                    ))}
                  </div>

                  {/* Languages */}
                  {repo.languages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {repo.languages.slice(0, 4).map(l => (
                        <span
                          key={l}
                          className="text-[11px] px-2.5 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600"
                        >
                          {l}
                        </span>
                      ))}
                      {repo.languages.length > 4 && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                          +{repo.languages.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div
                    className={`flex items-center justify-between gap-3 ${
                      view === "grid" ? "border-t border-gray-100 pt-4 mt-auto" : ""
                    }`}
                  >
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.08em] px-2.5 py-1 rounded-full border ${
                        STATUS_STYLES[repo.status] || STATUS_STYLES.indexing
                      }`}
                    >
                      {repo.status === "indexing" && <Loader2 className="w-2.5 h-2.5 spin" />}
                      {repo.status === "ready" && <CheckCircle2 className="w-2.5 h-2.5" />}
                      {repo.status === "error" && <AlertCircle className="w-2.5 h-2.5" />}
                      {repo.status.toUpperCase()}
                    </span>

                    {repo.status === "ready" && (
                      <button
                        className="!px-4 !py-1.5 !text-xs"
                        onClick={e => { e.stopPropagation(); startWorkspace(repo.repo_id); }}
                      >
                        <Play className="w-3 h-3" /> Open Chat
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Ingest card */}
              <div
                onClick={() => router.push("/ingest")}
                className={`rounded-2xl border-2 border-dashed border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-colors cursor-pointer flex flex-col items-center justify-center text-center gap-2 ${
                  view === "grid" ? "p-6 min-h-[200px]" : "px-5 py-6"
                }`}
              >
                <span className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-gray-700" />
                </span>
                <h4 className="text-sm font-semibold">Ingest Codebase</h4>
                <p className="text-xs text-gray-500 max-w-[200px]">
                  Analyze another local path or git clone repo.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ══ TOASTS ══════════════════════════════════════════════════════ */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            {t.type === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
            {t.type === "info" && <Sparkles className="w-3.5 h-3.5 text-gray-700" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="w-8 h-8 spin text-gray-900" />
        <p className="text-sm text-gray-500">Loading Dashboard Console…</p>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
