"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  GitBranch,
  FolderOpen,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Code,
  Sparkles,
  Zap,
} from "lucide-react";
import { api } from "../../lib/api";

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

function IngestWorkspace() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"local" | "github" | "zip">("local");
  
  // Form states
  const [localPath, setLocalPath] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [theme, setTheme] = useState("nebula");

  // Ingestion tracking states
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobMessage, setJobMessage] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cprag-theme", theme);
  }, [theme]);

  // Load theme
  useEffect(() => {
    const saved = localStorage.getItem("cprag-theme");
    if (saved && THEMES.some(t => t.id === saved)) setTheme(saved);
  }, []);

  // Poll Ingestion Job Progress
  useEffect(() => {
    if (!activeJobId) return;
    const interval = setInterval(async () => {
      try {
        const job = await api.getJobStatus(activeJobId);
        setJobProgress(job.progress * 100);
        setJobMessage(job.message || "Processing...");
        if (job.status === "completed") {
          setActiveJobId(null);
          setUploadStatus("Ingestion complete!");
          makeToast(setToasts, "✓ Codebase indexed successfully!", "success");
          setTimeout(() => {
            router.push("/");
          }, 1500);
        } else if (job.status === "failed") {
          setActiveJobId(null);
          setErrorMessage(job.error || "Ingestion and indexing failed.");
          makeToast(setToasts, "Ingestion failed.", "error");
        }
      } catch {
        setActiveJobId(null);
        setErrorMessage("Lost connection to background indexing service.");
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [activeJobId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setUploadStatus(null);
    setLoading(true);

    try {
      let result;
      if (activeTab === "local") {
        if (!localPath.trim()) throw new Error("Please specify a directory path.");
        result = await api.localIngest(localPath);
      } else if (activeTab === "github") {
        if (!githubUrl.trim()) throw new Error("Please specify a public Git URL.");
        result = await api.uploadRepo(undefined, githubUrl);
      } else {
        if (!file) throw new Error("Please select a ZIP file.");
        result = await api.uploadRepo(file, undefined);
      }

      setActiveJobId(result.job_id);
      setJobProgress(0);
      setJobMessage("Queueing codebase for analysis…");
      makeToast(setToasts, "Ingestion initiated! Analyzing files…", "info");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to start codebase ingestion.");
      makeToast(setToasts, err.message || "Ingestion request failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Drag-and-drop
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.endsWith(".zip")) {
      setFile(dropped);
      makeToast(setToasts, `📦 ${dropped.name} ready to ingest.`, "info");
    } else {
      makeToast(setToasts, "Only ZIP files are supported.", "error");
    }
  };

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
          <button className="secondary" style={s.backBtn} onClick={() => router.push("/")}>
            <ArrowLeft size={14} /> Back to Dashboard
          </button>
        </nav>
      </header>

      {/* Main Form container */}
      <main style={s.container} className="fade-in-up">
        <section className="glass-card" style={s.formBox}>
          <div style={s.formHeader}>
            <h1 style={s.title}>
              <Sparkles size={20} style={{ color: "var(--primary)" }} /> Ingest New Codebase
            </h1>
            <p style={s.subtitle}>
              Configure and analyze your workspace for semantic search & automated patch generation.
            </p>
          </div>

          {/* Source Tabs */}
          <div style={s.tabsWrap}>
            {[
              { id: "local", label: "Local Directory", icon: <FolderOpen size={14} /> },
              { id: "github", label: "GitHub Repository", icon: <GitBranch size={14} /> },
              { id: "zip", label: "ZIP Archive", icon: <UploadCloud size={14} /> },
            ].map(tab => (
              <button
                key={tab.id}
                disabled={loading || !!activeJobId}
                style={{
                  ...s.tabBtn,
                  background: activeTab === tab.id ? "rgba(255,255,255,0.06)" : "transparent",
                  borderColor: activeTab === tab.id ? "var(--primary)" : "transparent",
                  color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-muted)",
                }}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setErrorMessage("");
                  setUploadStatus(null);
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={s.form}>
            
            {/* Tab: Local Path */}
            {activeTab === "local" && (
              <div style={s.inputGroup} className="fade-in">
                <label style={s.label}>
                  <FolderOpen size={14} style={{ color: "var(--secondary)" }} /> Absolute Local Path
                </label>
                <input
                  type="text"
                  placeholder="e.g. C:\Users\Admin\Desktop\my-project"
                  value={localPath}
                  onChange={e => setLocalPath(e.target.value)}
                  disabled={loading || !!activeJobId}
                  style={s.textInput}
                />
                <span style={s.hint}>
                  FastAPI backend will read, package, and index this directory directly from disk.
                </span>
              </div>
            )}

            {/* Tab: GitHub URL */}
            {activeTab === "github" && (
              <div style={s.inputGroup} className="fade-in">
                <label style={s.label}>
                  <GitBranch size={14} style={{ color: "var(--primary-light)" }} /> GitHub Repository URL
                </label>
                <input
                  type="url"
                  placeholder="e.g. https://github.com/facebook/react"
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                  disabled={loading || !!activeJobId}
                  style={s.textInput}
                />
                <span style={s.hint}>
                  The backend will clone this repository using Git, extract language contents, and index.
                </span>
              </div>
            )}

            {/* Tab: ZIP Archive */}
            {activeTab === "zip" && (
              <div
                ref={dropZoneRef}
                className="drop-zone"
                style={{
                  ...s.dropZone,
                  borderColor: dragging ? "var(--primary)" : file ? "var(--success)" : "var(--border-glass)",
                  background: dragging ? "rgba(147, 51, 234, 0.04)" : "rgba(255,255,255,0.02)",
                }}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => !loading && !activeJobId && fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  accept=".zip"
                  ref={fileInputRef}
                  onChange={e => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                    if (f) makeToast(setToasts, `Selected ${f.name}`, "info");
                  }}
                  disabled={loading || !!activeJobId}
                  style={{ display: "none" }}
                />
                {file ? (
                  <>
                    <CheckCircle size={32} color="var(--success)" />
                    <p style={s.dropLabel}>{file.name}</p>
                    <p style={s.dropSub}>{(file.size / 1024 / 1024).toFixed(2)} MB · Click to choose another</p>
                  </>
                ) : (
                  <>
                    <UploadCloud size={32} style={{ color: "var(--primary)", opacity: dragging ? 1 : 0.6 }} />
                    <p style={s.dropLabel}>{dragging ? "Drop ZIP here" : "Drag and drop ZIP archive, or click to upload"}</p>
                    <p style={s.dropSub}>.zip file extensions only</p>
                  </>
                )}
              </div>
            )}

            {/* Progress Display */}
            {activeJobId && (
              <div style={s.progressBox} className="fade-in">
                <div style={s.progressRow}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite", color: "var(--primary)" }} />
                  <span style={s.progressMsg}>{jobMessage}</span>
                  <span style={s.progressPct}>{Math.round(jobProgress)}%</span>
                </div>
                <div style={s.progressBarBg}>
                  <div
                    style={{
                      ...s.progressBarFill,
                      width: `${jobProgress}%`,
                      background: `linear-gradient(90deg, var(--primary), var(--secondary))`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Alerts */}
            {errorMessage && (
              <div style={s.alertError} className="fade-in">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}
            {uploadStatus && (
              <div style={s.alertSuccess} className="fade-in">
                <CheckCircle size={16} style={{ flexShrink: 0 }} />
                <span>{uploadStatus}</span>
              </div>
            )}

            {/* Action buttons */}
            <div style={s.actionsRow}>
              <button
                type="submit"
                disabled={
                  loading ||
                  !!activeJobId ||
                  (activeTab === "local" && !localPath.trim()) ||
                  (activeTab === "github" && !githubUrl.trim()) ||
                  (activeTab === "zip" && !file)
                }
                style={{ flex: 1, padding: "14px 20px" }}
              >
                {loading ? (
                  <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Packing Workspace...</>
                ) : (
                  <><Zap size={16} /> Run Analysis & Ingest</>
                )}
              </button>
            </div>
          </form>
        </section>
      </main>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === "success" && <CheckCircle size={15} color="var(--success)" />}
            {t.type === "error" && <AlertCircle size={15} color="var(--error)" />}
            {t.type === "info" && <Sparkles size={15} color="var(--primary)" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function IngestPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
        <Loader2 size={36} style={{ animation: "spin 1s linear infinite", color: "var(--primary)" }} />
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading Ingestion Console…</p>
      </div>
    }>
      <IngestWorkspace />
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
    position: "fixed", top: "10%", left: "-15%",
    width: 600, height: 600,
    borderRadius: "50%",
    background: "radial-gradient(circle, var(--primary-glow) 0%, transparent 70%)",
    pointerEvents: "none", zIndex: -1,
    filter: "blur(60px)",
  },
  orb2: {
    position: "fixed", bottom: "10%", right: "-10%",
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
    marginBottom: 40,
    background: "transparent",
  },
  logoWrap: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: {
    width: 36, height: 36, borderRadius: 8,
    background: "var(--grad-btn)",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 12px var(--primary-glow)",
  },
  logoText: { fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)" },
  nav: { display: "flex", alignItems: "center", gap: 16 },
  backBtn: { fontSize: 13, padding: "8px 16px" },
  container: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  formBox: {
    width: "100%",
    maxWidth: 580,
    display: "flex",
    flexDirection: "column",
    gap: 24,
    borderRadius: 16,
    border: "1px solid var(--border-glass)",
    padding: "24px",
  },
  formHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    borderBottom: "1px solid var(--border-glass)",
    paddingBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  },
  tabsWrap: {
    display: "flex",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid var(--border-glass)",
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: "none",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  textInput: {
    fontSize: 14,
  },
  hint: {
    fontSize: 11,
    color: "var(--text-muted)",
    lineHeight: 1.4,
  },
  dropZone: {
    border: "2px dashed var(--border-glass)",
    borderRadius: 12,
    padding: "36px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    cursor: "pointer",
    transition: "all 0.25s ease",
    textAlign: "center",
  },
  dropLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-secondary)",
  },
  dropSub: {
    fontSize: 12,
    color: "var(--text-muted)",
  },
  progressBox: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--border-glass)",
    borderRadius: 10,
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  progressRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  progressMsg: {
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  progressPct: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 600,
  },
  progressBarBg: {
    width: "100%",
    height: 6,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 10,
    transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  },
  alertError: {
    background: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    borderRadius: 10,
    padding: "12px 14px",
    color: "#fca5a5",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 10,
    lineHeight: 1.4,
  },
  alertSuccess: {
    background: "rgba(16, 185, 129, 0.08)",
    border: "1px solid rgba(16, 185, 129, 0.25)",
    borderRadius: 10,
    padding: "12px 14px",
    color: "#a7f3d0",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  actionsRow: {
    display: "flex",
    gap: 12,
    marginTop: 6,
  },
};