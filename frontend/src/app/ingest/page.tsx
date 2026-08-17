"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  GitBranch,
  FolderOpen,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Code,
  Sparkles,
  Zap,
  Layers,
  Database,
  ShieldCheck,
  FileCode,
} from "lucide-react";
import { api } from "../../lib/api";

const THEMES = [
  { id: "nebula",  label: "Nebula",  color: "#7c3aed" },
  { id: "aurora",  label: "Aurora",  color: "#059669" },
  { id: "sunset",  label: "Sunset",  color: "#ea580c" },
  { id: "ocean",   label: "Ocean",   color: "#2563eb" },
];

const PIPELINE = [
  { icon: <FileCode className="w-4 h-4" />,   title: "Parse & filter",   desc: "Ignore lists strip build output, lockfiles and binaries." },
  { icon: <Layers className="w-4 h-4" />,     title: "Chunk",            desc: "Recursive splitting with overlap preserves context." },
  { icon: <Database className="w-4 h-4" />,   title: "Embed & persist",  desc: "Vectors land in Chroma, metadata in MongoDB." },
  { icon: <ShieldCheck className="w-4 h-4" />,title: "Ready to query",   desc: "Ask, debug, review or patch from the workspace." },
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

  const busy = loading || !!activeJobId;

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

          <div className="flex items-center gap-3">
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
            <button className="secondary !px-5 !py-2.5 !text-sm" onClick={() => router.push("/")}>
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
            </button>
          </div>
        </nav>
      </header>

      <main className="px-6 pt-16 pb-24 max-w-7xl mx-auto">
        {/* ══ TITLE ═════════════════════════════════════════════════════ */}
        <div
          className="text-center max-w-2xl mx-auto mb-14 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.1s" }}
        >
          <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-full px-3 py-1 mb-5">
            <Sparkles className="w-3 h-3" /> Ingestion Console
          </span>
          <h1 className="text-4xl md:text-5xl font-normal leading-[1.15] tracking-tight mb-4">
            Ingest a new{" "}
            <span className="bg-gradient-to-r from-black via-gray-500 to-gray-400 bg-clip-text text-transparent">
              codebase
            </span>
          </h1>
          <p className="text-lg text-gray-600">
            Configure and analyze your workspace for semantic search and automated
            patch generation.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-8 items-start">
          {/* ══ FORM CARD ═══════════════════════════════════════════════ */}
          <section
            className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 animate-fade-in-up"
            style={{ opacity: 0, animationDelay: "0.2s" }}
          >
            {/* Source Tabs */}
            <div className="bg-gray-100 rounded-lg p-1 grid grid-cols-3 gap-1 mb-8">
              {[
                { id: "local",  label: "Local Directory",   short: "Local",  icon: <FolderOpen className="w-3.5 h-3.5" /> },
                { id: "github", label: "GitHub Repository", short: "GitHub", icon: <GitBranch className="w-3.5 h-3.5" /> },
                { id: "zip",    label: "ZIP Archive",       short: "ZIP",    icon: <UploadCloud className="w-3.5 h-3.5" /> },
              ].map(tab => (
                <button
                  key={tab.id}
                  disabled={busy}
                  className={`!rounded-md !px-3 !py-2 !text-xs sm:!text-sm !font-medium !shadow-none ${
                    activeTab === tab.id
                      ? "!bg-white !text-black shadow-sm"
                      : "!bg-transparent !text-gray-600 hover:!text-black"
                  }`}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setErrorMessage("");
                    setUploadStatus(null);
                  }}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.short}</span>
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Tab: Local Path */}
              {activeTab === "local" && (
                <div className="flex flex-col gap-2.5 fade-in">
                  <label className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    <FolderOpen className="w-3.5 h-3.5 text-gray-500" /> Absolute Local Path
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. C:\Users\Admin\Desktop\my-project"
                    value={localPath}
                    onChange={e => setLocalPath(e.target.value)}
                    disabled={busy}
                    className="!font-mono !text-sm"
                  />
                  <span className="text-xs text-gray-500 leading-relaxed">
                    The FastAPI backend will read, package, and index this directory directly from disk.
                  </span>
                </div>
              )}

              {/* Tab: GitHub URL */}
              {activeTab === "github" && (
                <div className="flex flex-col gap-2.5 fade-in">
                  <label className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-gray-500" /> GitHub Repository URL
                  </label>
                  <input
                    type="url"
                    placeholder="e.g. https://github.com/facebook/react"
                    value={githubUrl}
                    onChange={e => setGithubUrl(e.target.value)}
                    disabled={busy}
                    className="!font-mono !text-sm"
                  />
                  <span className="text-xs text-gray-500 leading-relaxed">
                    The backend will clone this repository using Git, extract language contents, and index.
                  </span>
                </div>
              )}

              {/* Tab: ZIP Archive */}
              {activeTab === "zip" && (
                <div
                  ref={dropZoneRef}
                  className={`drop-zone fade-in rounded-2xl border-2 border-dashed px-6 py-12 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-colors ${
                    dragging
                      ? "border-black bg-gray-50"
                      : file
                      ? "border-emerald-400 bg-emerald-50/40"
                      : "border-gray-200 bg-white"
                  }`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => !busy && fileInputRef.current?.click()}
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
                    disabled={busy}
                    className="hidden"
                  />
                  {file ? (
                    <>
                      <span className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      </span>
                      <p className="text-sm font-semibold text-black">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB · Click to choose another
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                        <UploadCloud className={`w-6 h-6 transition-opacity ${dragging ? "text-black" : "text-gray-500"}`} />
                      </span>
                      <p className="text-sm font-semibold text-black">
                        {dragging ? "Drop ZIP here" : "Drag and drop a ZIP archive, or click to upload"}
                      </p>
                      <p className="text-xs text-gray-500">.zip file extensions only</p>
                    </>
                  )}
                </div>
              )}

              {/* Progress */}
              {activeJobId && (
                <div className="fade-in rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Loader2 className="w-4 h-4 spin text-gray-900 flex-shrink-0" />
                    <span className="text-sm text-gray-700 flex-1 truncate">{jobMessage}</span>
                    <span className="text-xs font-semibold text-gray-900 tabular-nums">
                      {Math.round(jobProgress)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-black rounded-full"
                      style={{ width: `${jobProgress}%`, transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)" }}
                    />
                  </div>
                </div>
              )}

              {/* Alerts */}
              {errorMessage && (
                <div className="fade-in flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}
              {uploadStatus && (
                <div className="fade-in flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{uploadStatus}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={
                  loading ||
                  !!activeJobId ||
                  (activeTab === "local" && !localPath.trim()) ||
                  (activeTab === "github" && !githubUrl.trim()) ||
                  (activeTab === "zip" && !file)
                }
                className="!w-full !bg-black !text-white !py-3.5 !rounded-full !text-base !font-medium hover:!bg-gray-800"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 spin" /> Packing Workspace…</>
                ) : (
                  <><Zap className="w-4 h-4" /> Run Analysis &amp; Ingest</>
                )}
              </button>
            </form>
          </section>

          {/* ══ SIDE PANEL ══════════════════════════════════════════════ */}
          <aside
            className="rounded-2xl border border-gray-200 bg-gray-50 p-6 md:p-8 relative overflow-hidden animate-fade-in-up"
            style={{ opacity: 0, animationDelay: "0.3s" }}
          >
            <div className="absolute inset-0 dot-bg opacity-60 pointer-events-none" />
            <div className="relative">
              <h2 className="text-lg font-semibold tracking-tight mb-1.5">What happens next</h2>
              <p className="text-sm text-gray-600 mb-7">
                Ingestion runs as a background job — you can watch progress live above.
              </p>

              <ol className="space-y-5">
                {PIPELINE.map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-900">
                        {step.icon}
                      </span>
                      {i < PIPELINE.length - 1 && <span className="w-px flex-1 bg-gray-200 mt-2" />}
                    </div>
                    <div className="pb-1">
                      <h3 className="text-sm font-semibold mb-1">{step.title}</h3>
                      <p className="text-xs text-gray-600 leading-relaxed">{step.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </main>

      {/* ══ TOASTS ══════════════════════════════════════════════════════ */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {t.type === "error" && <AlertCircle className="w-4 h-4 text-red-600" />}
            {t.type === "info" && <Sparkles className="w-4 h-4 text-gray-700" />}
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
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="w-8 h-8 spin text-gray-900" />
        <p className="text-sm text-gray-500">Loading Ingestion Console…</p>
      </div>
    }>
      <IngestWorkspace />
    </Suspense>
  );
}
