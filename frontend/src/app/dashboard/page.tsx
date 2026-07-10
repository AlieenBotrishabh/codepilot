"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  Play,
  CheckCircle,
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
} from "lucide-react";
import { api, RepoInfo } from "../../lib/api";

const THEMES = [
  { id: "nebula",  label: "Nebula",  color: "#9333ea" },
  { id: "aurora",  label: "Aurora",  color: "#10b981" },
  { id: "sunset",  label: "Sunset",  color: "#f97316" },
  { id: "ocean",   label: "Ocean",   color: "#3b82f6" },
];

interface Toast { id: string; message: string; type: "success" | "error" | "info"; }
let _toastId = 0;
function makeToast(set: React.Dispatch<React.SetStateAction<Toast[]>>, message: string, type: Toast["type"] = "info") {
  const id = `t${_toastId++}`;
  set(prev => [...prev, { id, message, type }]);
  setTimeout(() => set(prev => prev.filter(t => t.id !== id)), 3500);
}

function DashboardContent() {
  const router = useRouter();
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [theme, setTheme] = useState("nebula");
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  return (
    <div style={s.page}>
      <div style={s.orb1} />
      <div style={s.orb2} />

      {/* Header */}
      <header style={s.header}>
        <div onClick={() => router.push("/")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={s.logoIcon}>
            <Code size={20} color="#fff" />
          </div>
          <span style={s.logoText}>CodePilot RAG</span>
        </div>

        <nav style={s.nav}>
          <div className="theme-switcher">
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
          <button className="secondary" style={s.headerBtn} onClick={() => router.push("/")}>
            <ArrowLeft size={14} /> Back
          </button>
          <button className="secondary" style={s.headerBtn} onClick={loadRepos} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
          </button>
          <button onClick={() => router.push("/ingest")} style={s.headerIngestBtn}>
            <Plus size={16} /> Ingest Codebase
          </button>
        </nav>
      </header>

      {/* Title block */}
      <div style={s.titleBlock} className="fade-in-up">
        <div style={s.badge}>
          <LayoutDashboard size={12} /> Dashboard Workspace
        </div>
        <h1 style={s.title}>Indexed Workspace Codebases</h1>
        <p style={s.subtitle}>
          Select an active repository to start debugging, review code architecture, or write unified patches.
        </p>
      </div>

      {/* Summary stats row */}
      <section style={s.statsRow} className="fade-in-up">
        <div className="glass-card" style={s.statCard}>
          <div style={s.statHeader}>
            <span style={s.statTitle}>Active Repositories</span>
            <Code size={16} color="var(--primary-light)" />
          </div>
          <div style={s.statValue}>{totalRepos}</div>
          <p style={s.statDesc}>Ingested codebases ready for analysis</p>
        </div>

        <div className="glass-card" style={s.statCard}>
          <div style={s.statHeader}>
            <span style={s.statTitle}>Files Indexed</span>
            <FileCode size={16} color="var(--secondary)" />
          </div>
          <div style={s.statValue}>{totalFiles.toLocaleString()}</div>
          <p style={s.statDesc}>Total source files processed</p>
        </div>

        <div className="glass-card" style={s.statCard}>
          <div style={s.statHeader}>
            <span style={s.statTitle}>Vector Chunks</span>
            <Database size={16} color="var(--accent)" />
          </div>
          <div style={s.statValue}>{totalChunks.toLocaleString()}</div>
          <p style={s.statDesc}>Embeddings stored in Chroma DB</p>
        </div>
      </section>

      {/* Codebase list */}
      <main style={s.mainGrid} className="fade-in-up">
        {errorMessage && (
          <div style={s.alertError} className="fade-in">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {loading && repos.length === 0 ? (
          <div style={s.loadingWrap}>
            <Loader2 size={36} style={{ animation: "spin 1s linear infinite", color: "var(--primary)" }} />
            <p style={{ color: "var(--text-secondary)" }}>Scanning indexing stores...</p>
          </div>
        ) : repos.length === 0 ? (
          <div className="glass" style={s.emptyState}>
            <Code size={48} style={{ opacity: 0.15, marginBottom: 16 }} />
            <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>No Codebases Indexed</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 320, marginBottom: 20 }}>
              Get started by uploading a ZIP file, specifying a local folder, or providing a public GitHub URL.
            </p>
            <button onClick={() => router.push("/ingest")}>
              <Plus size={16} /> Ingest Your First Codebase
            </button>
          </div>
        ) : (
          <div style={s.reposGrid}>
            {repos.map((repo, idx) => (
              <div
                key={repo.repo_id}
                className="glass-card"
                style={{
                  ...s.repoCard,
                  cursor: repo.status === "ready" ? "pointer" : "default",
                  animationDelay: `${idx * 50}ms`,
                }}
                onClick={() => repo.status === "ready" && startWorkspace(repo.repo_id)}
              >
                <div style={s.cardTop}>
                  <div style={s.cardIcon}>
                    <Code size={16} color="var(--primary-light)" />
                  </div>
                  <h3 style={s.repoName} title={repo.name}>{repo.name}</h3>
                  <button
                    className="ghost"
                    style={s.deleteBtn}
                    onClick={e => handleDelete(repo.repo_id, e)}
                    title="Delete codebase"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <p style={s.repoDate}>
                  Ingested {new Date(repo.created_at).toLocaleDateString("en-US", {
                    year: "numeric", month: "short", day: "numeric"
                  })}
                </p>

                <div style={s.cardStats}>
                  <div style={s.cardStatChip}>
                    <span style={s.cardStatVal}>{repo.file_count.toLocaleString()}</span>
                    <span style={s.cardStatLbl}>Files</span>
                  </div>
                  <div style={s.cardStatChip}>
                    <span style={s.cardStatVal}>{repo.chunk_count.toLocaleString()}</span>
                    <span style={s.cardStatLbl}>Chunks</span>
                  </div>
                </div>

                {/* Languages */}
                {repo.languages.length > 0 && (
                  <div style={s.langRow}>
                    {repo.languages.slice(0, 4).map(l => (
                      <span key={l} style={s.langBadge}>{l}</span>
                    ))}
                    {repo.languages.length > 4 && (
                      <span style={s.langMore}>+{repo.languages.length - 4}</span>
                    )}
                  </div>
                )}

                {/* Footer status & launch */}
                <div style={s.cardFooter}>
                  <span style={{
                    ...s.statusBadge,
                    backgroundColor: repo.status === "ready"
                      ? "rgba(16,185,129,0.1)"
                      : repo.status === "error"
                      ? "rgba(239,68,68,0.1)"
                      : "rgba(245,158,11,0.1)",
                    color: repo.status === "ready"
                      ? "var(--success)"
                      : repo.status === "error"
                      ? "var(--error)"
                      : "var(--warning)",
                    borderColor: repo.status === "ready"
                      ? "rgba(16,185,129,0.25)"
                      : repo.status === "error"
                      ? "rgba(239,68,68,0.25)"
                      : "rgba(245,158,11,0.25)",
                  }}>
                    {repo.status === "indexing" && (
                      <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
                    )}
                    {repo.status === "ready" && <CheckCircle size={10} />}
                    {repo.status === "error" && <AlertCircle size={10} />}
                    {repo.status.toUpperCase()}
                  </span>

                  {repo.status === "ready" && (
                    <button style={s.openBtn} onClick={e => { e.stopPropagation(); startWorkspace(repo.repo_id); }}>
                      <Play size={11} /> Open Chat
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Dash dashed link card for ingestion */}
            <div
              className="glass"
              style={s.dashDashedCard}
              onClick={() => router.push("/ingest")}
            >
              <div style={s.dashedIconWrap}>
                <Plus size={20} color="var(--primary)" />
              </div>
              <h4 style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
                Ingest Codebase
              </h4>
              <p style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 180 }}>
                Analyze another local path or git clone repo.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === "success" && <CheckCircle size={14} color="var(--success)" />}
            {t.type === "error" && <AlertCircle size={14} color="var(--error)" />}
            {t.type === "info" && <Sparkles size={14} color="var(--primary)" />}
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
        <Loader2 size={36} style={{ animation: "spin 1s linear infinite", color: "var(--primary)" }} />
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading Dashboard Console…</p>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    padding: "0 24px 60px",
    maxWidth: 1200,
    margin: "0 auto",
    position: "relative",
  },
  orb1: {
    position: "fixed", top: "5%", left: "-10%",
    width: 600, height: 600,
    borderRadius: "50%",
    background: "radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)",
    pointerEvents: "none", zIndex: -1,
    filter: "blur(60px)",
  },
  orb2: {
    position: "fixed", bottom: "10%", right: "-8%",
    width: 500, height: 500,
    borderRadius: "50%",
    background: "radial-gradient(circle, var(--secondary-glow) 0%, transparent 70%)",
    pointerEvents: "none", zIndex: -1,
    filter: "blur(60px)",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "24px 0",
    borderBottom: "1px solid var(--border-glass)",
    marginBottom: 36,
  },
  logoWrap: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: {
    width: 36, height: 36, borderRadius: 8,
    background: "var(--grad-btn)",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 12px var(--primary-glow)",
  },
  logoText: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)" },
  nav: { display: "flex", alignItems: "center", gap: 12 },
  headerBtn: { fontSize: 12, padding: "8px 14px" },
  headerIngestBtn: { fontSize: 12, padding: "8px 14px" },
  titleBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 28,
  },
  badge: {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
    background: "var(--primary-glow)",
    border: "1px solid var(--border-active)",
    color: "var(--primary-light)",
    padding: "4px 10px", borderRadius: 20,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: "var(--text-primary)",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    maxWidth: 620,
    lineHeight: 1.5,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "20px 24px",
  },
  statHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statTitle: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    background: "var(--grad-hero)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
  },
  statDesc: {
    fontSize: 11,
    color: "var(--text-muted)",
  },
  mainGrid: {
    width: "100%",
  },
  reposGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
    gap: 20,
  },
  loadingWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 0",
    gap: 12,
  },
  emptyState: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "80px 40px", textAlign: "center", color: "var(--text-secondary)",
    borderRadius: 16,
  },
  repoCard: {
    display: "flex", flexDirection: "column", gap: 14,
  },
  cardTop: {
    display: "flex", alignItems: "center", gap: 10,
  },
  cardIcon: {
    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
    background: "rgba(147,51,234,0.08)", border: "1px solid var(--border-glass)",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  repoName: {
    flex: 1, fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  deleteBtn: {
    padding: "4px", flexShrink: 0,
  },
  repoDate: { fontSize: 11, color: "var(--text-muted)" },
  cardStats: {
    display: "flex",
    gap: 12,
  },
  cardStatChip: {
    flex: 1,
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid var(--border-glass)",
    borderRadius: 8,
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  cardStatVal: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  cardStatLbl: {
    fontSize: 10,
    color: "var(--text-muted)",
    textTransform: "uppercase",
  },
  langRow: { display: "flex", flexWrap: "wrap", gap: 6 },
  langBadge: {
    fontSize: 10, background: "rgba(6,182,212,0.06)",
    border: "1px solid rgba(6,182,212,0.2)",
    color: "#22d3ee", padding: "2px 8px", borderRadius: 12,
  },
  langMore: {
    fontSize: 10, color: "var(--text-muted)",
    padding: "2px 8px", borderRadius: 12,
    background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-glass)",
  },
  cardFooter: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    borderTop: "1px solid var(--border-glass)", paddingTop: 12, marginTop: 4,
  },
  statusBadge: {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
    padding: "4px 8px", borderRadius: 6, border: "1px solid",
    display: "inline-flex", alignItems: "center", gap: 4,
  },
  openBtn: { padding: "6px 12px", fontSize: 11, gap: 5 },
  dashDashedCard: {
    border: "2px dashed var(--border-glass)",
    borderRadius: 16,
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: 8,
    cursor: "pointer",
    transition: "all 0.3s ease",
    background: "transparent",
    minHeight: 180,
  },
  dashedIconWrap: {
    width: 40, height: 40,
    borderRadius: "50%",
    background: "rgba(147, 51, 234, 0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  alertError: {
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.25)",
    borderRadius: 10, padding: "12px 14px",
    color: "#fca5a5", fontSize: 13,
    display: "flex", alignItems: "center", gap: 8,
    marginBottom: 16,
  },
};
