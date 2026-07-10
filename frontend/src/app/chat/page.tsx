"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import {
  ArrowLeft,
  Send,
  FileText,
  Code,
  Terminal,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  GitPullRequest,
  Loader2,
  Copy,
  Check,
  Download,
  Trash2,
  Plus,
  Search,
  ChevronRight,
  RefreshCw,
  Zap,
  Shield,
  HelpCircle,
  Bug,
  Eye,
  Book,
} from "lucide-react";
import { api, Message, Thread, RepoInfo } from "../../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────
const THEMES = [
  { id: "nebula",  color: "#9333ea" },
  { id: "aurora",  color: "#10b981" },
  { id: "sunset",  color: "#f97316" },
  { id: "ocean",   color: "#3b82f6" },
];

const MODES = [
  { value: "auto",          label: "Auto Router",          icon: <Zap size={13} />,        desc: "Smart mode selection" },
  { value: "question",      label: "Q&A",                  icon: <HelpCircle size={13} />, desc: "Ask anything" },
  { value: "debug",         label: "Debug",                icon: <Bug size={13} />,         desc: "Find & fix bugs" },
  { value: "patch",         label: "Patch Generator",      icon: <Shield size={13} />,      desc: "Generate code patches" },
  { value: "review",        label: "Code Review",          icon: <Eye size={13} />,         desc: "Review code quality" },
  { value: "architecture",  label: "Architecture",         icon: <Book size={13} />,        desc: "Explain architecture" },
];

interface Toast { id: string; msg: string; type: "success" | "error" | "info"; }
let _tid = 0;
function toast(set: React.Dispatch<React.SetStateAction<Toast[]>>, msg: string, type: Toast["type"] = "info") {
  const id = `t${_tid++}`;
  set(p => [...p, { id, msg, type }]);
  setTimeout(() => set(p => p.filter(t => t.id !== id)), 3500);
}

// ── Rich markdown renderer ────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  // 1. Protect fenced code blocks — replace them with placeholders
  const codeBlocks: string[] = [];
  let html = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    const label = lang ? `<span class="code-lang">${lang}</span>` : "";
    codeBlocks.push(
      `<div class="code-block-wrap">${label}<pre><code class="lang-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre></div>`
    );
    return `%%CODE_BLOCK_${idx}%%`;
  });

  // 2. Inline elements
  html = html
    // Inline code
    .replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`)
    // Bold + italic combined
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    // Bold
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  // 3. Block elements (line by line)
  const lines = html.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableRows: string[] = [];

  const flushUl = () => { if (inUl) { out.push("</ul>"); inUl = false; } };
  const flushOl = () => { if (inOl) { out.push("</ol>"); inOl = false; } };
  const flushTable = () => {
    if (!inTable) return;
    // first row → header, rest → body
    const [header, _sep, ...body] = tableRows;
    if (header) {
      const cells = header.split("|").filter((c) => c.trim());
      out.push(
        `<table class="md-table"><thead><tr>${cells.map((c) => `<th>${c.trim()}</th>`).join("")}</tr></thead>` +
        (body.length
          ? `<tbody>${body.map((r) => `<tr>${r.split("|").filter((c) => c.trim()).map((c) => `<td>${c.trim()}</td>`).join("")}</tr>`).join("")}</tbody>`
          : "") +
        "</table>"
      );
    }
    tableRows = [];
    inTable = false;
  };

  for (const line of lines) {
    // Code block placeholders
    if (/^%%CODE_BLOCK_\d+%%$/.test(line.trim())) {
      flushUl(); flushOl(); flushTable();
      out.push(line);
      continue;
    }
    // Headers
    const h4 = line.match(/^#### (.+)/);
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h4) { flushUl(); flushOl(); flushTable(); out.push(`<h4>${h4[1]}</h4>`); continue; }
    if (h3) { flushUl(); flushOl(); flushTable(); out.push(`<h3>${h3[1]}</h3>`); continue; }
    if (h2) { flushUl(); flushOl(); flushTable(); out.push(`<h2>${h2[1]}</h2>`); continue; }
    if (h1) { flushUl(); flushOl(); flushTable(); out.push(`<h1>${h1[1]}</h1>`); continue; }
    // HR
    if (/^---+$/.test(line.trim())) { flushUl(); flushOl(); flushTable(); out.push("<hr>"); continue; }
    // Table rows
    if (line.trim().startsWith("|")) {
      flushUl(); flushOl();
      if (!line.trim().match(/^\|[-:| ]+\|$/)) { // skip separator rows
        tableRows.push(line);
        inTable = true;
      }
      continue;
    }
    if (inTable && !line.trim().startsWith("|")) flushTable();
    // Blockquotes — detect callout types
    const bq = line.match(/^> (.+)/);
    if (bq) {
      flushUl(); flushOl();
      const inner = bq[1];
      let cls = "bq-default";
      if (/⚠️|WARNING|CAUTION/i.test(inner)) cls = "bq-warn";
      else if (/💡|TIP|PRO TIP/i.test(inner)) cls = "bq-tip";
      else if (/ℹ️|NOTE|INFO/i.test(inner)) cls = "bq-info";
      else if (/🔴|CRITICAL/i.test(inner)) cls = "bq-critical";
      out.push(`<blockquote class="${cls}">${inner}</blockquote>`);
      continue;
    }
    // Unordered list
    const ul = line.match(/^[\-\*\•] (.+)/);
    if (ul) {
      flushOl();
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${ul[1]}</li>`);
      continue;
    }
    // Ordered list
    const ol = line.match(/^(\d+)\. (.+)/);
    if (ol) {
      flushUl();
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${ol[2]}</li>`);
      continue;
    }
    // Blank line → paragraph break
    if (line.trim() === "") {
      flushUl(); flushOl(); flushTable();
      out.push("<p>");
      continue;
    }
    // Plain text
    flushUl(); flushOl(); flushTable();
    out.push(`<span>${line}</span><br>`);
  }
  flushUl(); flushOl(); flushTable();

  // 4. Restore code block placeholders
  let result = out.join("\n");
  codeBlocks.forEach((block, idx) => {
    result = result.replace(`%%CODE_BLOCK_${idx}%%`, block);
  });

  // 5. Wrap bare text in <p> if not already starting with a block element
  if (!result.trimStart().match(/^<(h[1-6]|ul|ol|pre|blockquote|hr|table|div)/)) {
    result = `<p>${result}</p>`;
  }

  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Message content with copy support ─────────────────────────────────────
function MessageContent({ content, mode }: { content: string; mode?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const html = renderMarkdown(content);

  // Mode-specific accent colour for the left border
  const modeColor: Record<string, string> = {
    question:     "var(--primary)",
    debug:        "#ef4444",
    patch:        "#8b5cf6",
    review:       "#f59e0b",
    architecture: "var(--secondary)",
  };
  const accent = mode ? (modeColor[mode] || "var(--border-glass)") : "var(--border-glass)";

  return (
    <div style={{ position: "relative" }}>
      <div
        className="message-content"
        style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 12 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button
        onClick={handleCopy}
        style={cs.copyMsgBtn}
        title="Copy message"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="typing-indicator">
      <span /><span /><span />
    </div>
  );
}

// ── Main workspace ────────────────────────────────────────────────────────
function ChatWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const repoId = searchParams.get("repo_id");

  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<string>("auto");
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"files" | "patch" | "plan">("files");
  const [currentPatch, setCurrentPatch] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);

  const [filesList, setFilesList] = useState<string[]>([]);
  const [fileSearch, setFileSearch] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [fileContentLoading, setFileContentLoading] = useState(false);

  const [applyingPatch, setApplyingPatch] = useState(false);
  const [indexingJobId, setIndexingJobId] = useState<string | null>(null);
  const [indexingProgress, setIndexingProgress] = useState(0);
  const [indexingMessage, setIndexingMessage] = useState("");

  const [copiedPatch, setCopiedPatch] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState("nebula");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Theme
  useEffect(() => {
    const saved = localStorage.getItem("cprag-theme") || "nebula";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const switchTheme = (id: string) => {
    setTheme(id);
    document.documentElement.setAttribute("data-theme", id);
    localStorage.setItem("cprag-theme", id);
  };

  useEffect(() => {
    if (!repoId) { router.push("/"); return; }
    loadRepoData();
    loadRepoFiles();
  }, [repoId]);

  useEffect(() => {
    if (activeThreadId) {
      loadMessages(activeThreadId);
    } else {
      setMessages([]);
      setCurrentPatch(null);
      setCurrentPlan(null);
    }
  }, [activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Keyboard shortcut: Ctrl+Enter to send, Escape to clear
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (query.trim() && !loading) handleSend();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [query, loading]);

  const loadRepoData = async () => {
    try {
      const allRepos = await api.listRepos();
      const matched = allRepos.find(r => r.repo_id === repoId);
      if (matched) setRepoInfo(matched);
      const threadList = await api.listThreads(repoId!);
      setThreads(threadList);
      if (threadList.length > 0) setActiveThreadId(threadList[0].thread_id);
    } catch {
      console.error("Failed to load workspace data.");
    }
  };

  const loadRepoFiles = async () => {
    if (!repoId) return;
    try {
      const files = await api.listRepoFiles(repoId);
      setFilesList(files);
    } catch { }
  };

  const viewFileContent = async (filePath: string) => {
    if (!repoId) return;
    setSelectedFilePath(filePath);
    setFileContentLoading(true);
    try {
      const content = await api.getRepoFileContent(repoId, filePath);
      setSelectedFileContent(content);
    } catch (err: any) {
      toast(setToasts, err.message || "Failed to load file.", "error");
      setSelectedFilePath(null);
    } finally {
      setFileContentLoading(false);
    }
  };

  const handleApplyPatch = async () => {
    if (!repoId || !currentPatch) return;
    setApplyingPatch(true);
    try {
      const response = await api.applyPatch(repoId, currentPatch);
      setIndexingJobId(response.job_id);
      setIndexingProgress(0);
      setIndexingMessage("Patch applied. Starting indexing update…");
    } catch (err: any) {
      toast(setToasts, err.message || "Failed to apply patch.", "error");
      setApplyingPatch(false);
    }
  };

  useEffect(() => {
    if (!indexingJobId) return;
    const interval = setInterval(async () => {
      try {
        const job = await api.getJobStatus(indexingJobId);
        setIndexingProgress(job.progress * 100);
        setIndexingMessage(job.message || "Re-indexing codebase…");
        if (job.status === "completed") {
          setIndexingJobId(null);
          setApplyingPatch(false);
          toast(setToasts, "✓ Patch applied and codebase re-indexed!", "success");
          await loadRepoData();
          await loadRepoFiles();
          if (selectedFilePath) {
            const c = await api.getRepoFileContent(repoId!, selectedFilePath);
            setSelectedFileContent(c);
          }
        } else if (job.status === "failed") {
          setIndexingJobId(null);
          setApplyingPatch(false);
          toast(setToasts, job.error || "Re-indexing after patch failed.", "error");
        }
      } catch {
        setIndexingJobId(null);
        setApplyingPatch(false);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [indexingJobId, selectedFilePath]);

  const loadMessages = async (threadId: string) => {
    try {
      const msgList = await api.listMessages(threadId);
      setMessages(msgList);
      const lastPatch = [...msgList].reverse().find(m => m.patch);
      if (lastPatch?.patch) { setCurrentPatch(lastPatch.patch); setActiveTab("patch"); }
      const lastPlan = [...msgList].reverse().find(m => m.plan);
      if (lastPlan?.plan) setCurrentPlan(lastPlan.plan);
    } catch {
      console.error("Failed to load messages.");
    }
  };

  const handleSend = async (customQuery?: string) => {
    const activeQuery = customQuery || query;
    if (!activeQuery.trim() || loading || !repoId) return;

    setLoading(true);
    setQuery("");
    chatInputRef.current?.focus();

    const slowTimer = setTimeout(() => {
      toast(setToasts, "This is taking longer than expected — the AI service may be rate-limited. Please wait...", "info");
    }, 15000);

    try {
      const response = await api.sendMessage({
        query: activeQuery,
        repo_id: repoId,
        thread_id: activeThreadId || undefined,
        mode,
      });
      if (!activeThreadId) {
        setActiveThreadId(response.thread_id);
        const threadList = await api.listThreads(repoId);
        setThreads(threadList);
      } else {
        await loadMessages(activeThreadId);
      }
    } catch (err: any) {
      toast(setToasts, err.message || "Failed to generate AI response.", "error");
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
    }
  };

  const startNewThread = () => {
    setActiveThreadId(null);
    setMessages([]);
    setCurrentPatch(null);
    setCurrentPlan(null);
    setActiveTab("files");
  };

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation thread?")) return;
    try {
      await api.deleteThread(threadId);
      if (activeThreadId === threadId) setActiveThreadId(null);
      const threadList = await api.listThreads(repoId!);
      setThreads(threadList);
      toast(setToasts, "Thread deleted.", "info");
    } catch {
      toast(setToasts, "Failed to delete thread.", "error");
    }
  };

  const renderPatchDiff = (diff: string) => {
    const lines = diff.split("\n");
    return (
      <div style={cs.diffWrapper}>
        {lines.map((line, idx) => {
          let bg = "transparent";
          let color = "var(--text-secondary)";
          if (line.startsWith("+") && !line.startsWith("+++")) {
            bg = "rgba(16,185,129,0.1)"; color = "#a7f3d0";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            bg = "rgba(239,68,68,0.1)"; color = "#fca5a5";
          } else if (line.startsWith("@@")) {
            bg = "rgba(59,130,246,0.1)"; color = "#93c5fd";
          } else if (line.startsWith("diff") || line.startsWith("index") || line.startsWith("---") || line.startsWith("+++")) {
            color = "var(--text-muted)";
          }
          return (
            <div key={idx} style={{ ...cs.diffLine, background: bg, color }}>
              <span style={cs.diffLineNum}>{idx + 1}</span>
              <span>{line || " "}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const filteredFiles = filesList.filter(f =>
    f.toLowerCase().includes(fileSearch.toLowerCase())
  );

  // Auto-resize textarea
  const handleQueryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={cs.workspace}>

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        style={{
          ...cs.sidebar,
          width: sidebarCollapsed ? 56 : 260,
          transition: "width 0.3s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
        }}
      >
        {/* Sidebar top */}
        <div style={cs.sidebarTop}>
          {!sidebarCollapsed && (
            <div style={cs.sidebarBrand}>
              <Code size={16} style={{ color: "var(--primary)" }} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>CodePilot</span>
            </div>
          )}
          <button
            className="ghost"
            style={{ padding: 8, flexShrink: 0 }}
            onClick={() => setSidebarCollapsed(p => !p)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronRight
              size={16}
              style={{ transform: sidebarCollapsed ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.3s" }}
            />
          </button>
        </div>

        {/* Back and new thread */}
        <div style={cs.sidebarActions}>
          <button
            className="secondary"
            style={cs.backBtn}
            onClick={() => router.push("/")}
            title="Back to dashboard"
          >
            <ArrowLeft size={14} />
            {!sidebarCollapsed && "Back"}
          </button>
          <button
            style={cs.newThreadBtn}
            onClick={startNewThread}
            title="New conversation"
          >
            <Plus size={14} />
            {!sidebarCollapsed && "New Thread"}
          </button>
        </div>

        {/* Thread list */}
        {!sidebarCollapsed && (
          <div style={cs.threadList}>
            <span style={cs.sidebarSectionLabel}>Conversations</span>
            {threads.length === 0 ? (
              <p style={cs.emptyThreads}>No conversations yet.</p>
            ) : (
              threads.map(t => (
                <div
                  key={t.thread_id}
                  style={{
                    ...cs.threadItem,
                    background: activeThreadId === t.thread_id
                      ? "rgba(147,51,234,0.15)"
                      : "transparent",
                    borderColor: activeThreadId === t.thread_id
                      ? "var(--primary)"
                      : "transparent",
                  }}
                  onClick={() => setActiveThreadId(t.thread_id)}
                  className={activeThreadId === t.thread_id ? "" : ""}
                >
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <p style={cs.threadTitle}>{t.title || "Untitled Thread"}</p>
                    <span style={cs.threadMeta}>{t.message_count} msgs</span>
                  </div>
                  <button
                    className="ghost"
                    style={{ padding: 4, flexShrink: 0 }}
                    onClick={e => handleDeleteThread(t.thread_id, e)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Theme switcher at bottom */}
        {!sidebarCollapsed && (
          <div style={cs.sidebarBottom}>
            <span style={cs.sidebarSectionLabel}>Theme</span>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {THEMES.map(t => (
                <div
                  key={t.id}
                  className={`theme-dot${theme === t.id ? " active" : ""}`}
                  style={{ background: t.color }}
                  onClick={() => switchTheme(t.id)}
                />
              ))}
            </div>
            {repoInfo && (
              <div style={{ marginTop: 16, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid var(--border-glass)" }}>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Active Repo</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {repoInfo.name}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {repoInfo.file_count} files · {repoInfo.chunk_count} chunks
                </p>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Main workspace ────────────────────────────────────────────── */}
      <div style={cs.main}>

        {/* ── Left panel: Files / Patch / Plan ───────────────────────── */}
        <section style={cs.leftPanel}>

          {/* Tab bar */}
          <div style={cs.tabBar}>
            {[
              { id: "files",  label: "Codebase",    icon: <FileText size={13} />,      activeColor: "var(--secondary)" },
              { id: "patch",  label: "Code Patch",  icon: <GitPullRequest size={13} />, activeColor: "var(--primary)", disabled: !currentPatch },
              { id: "plan",   label: "Plan",         icon: <Terminal size={13} />,       activeColor: "var(--accent)",   disabled: !currentPlan },
            ].map(tab => (
              <button
                key={tab.id}
                style={{
                  ...cs.tabBtn,
                  borderBottomColor: activeTab === tab.id ? tab.activeColor : "transparent",
                  color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-muted)",
                  opacity: tab.disabled ? 0.35 : 1,
                }}
                disabled={!!tab.disabled}
                onClick={() => setActiveTab(tab.id as any)}
              >
                {tab.icon}
                {tab.label}
                {tab.id === "patch" && currentPatch && (
                  <span style={cs.tabBadge}>New</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content — scrollable */}
          <div style={cs.tabContent}>

            {/* ── FILES TAB ─────────────────────────────────────── */}
            {activeTab === "files" && repoInfo && (
              selectedFilePath ? (
                <div style={cs.codeViewer}>
                  <div style={cs.codeViewerHeader}>
                    <button
                      className="secondary"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      onClick={() => { setSelectedFilePath(null); setSelectedFileContent(null); }}
                    >
                      ← Files
                    </button>
                    <span style={cs.codeViewerPath} title={selectedFilePath}>{selectedFilePath}</span>
                    {selectedFileContent && (
                      <button
                        className="secondary"
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        onClick={() => {
                          navigator.clipboard.writeText(selectedFileContent);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                        }}
                        title="Copy file content"
                      >
                        {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    )}
                  </div>
                  {fileContentLoading ? (
                    <div style={cs.centered}>
                      <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "var(--primary)" }} />
                      <span style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 10 }}>Loading file…</span>
                    </div>
                  ) : (
                    <pre style={cs.codePre}>{selectedFileContent || "// Empty file"}</pre>
                  )}
                </div>
              ) : (
                <div style={cs.fileDetails}>
                  {/* Repo info */}
                  <h3 style={cs.panelTitle}>{repoInfo.name}</h3>
                  <div style={cs.metricsRow}>
                    {[
                      { label: "Files Indexed",  value: repoInfo.file_count.toLocaleString() },
                      { label: "Code Chunks",    value: repoInfo.chunk_count.toLocaleString() },
                    ].map(m => (
                      <div key={m.label} className="stat-chip" style={{ flex: 1 }}>
                        <span className="stat-value">{m.value}</span>
                        <span className="stat-label">{m.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Languages */}
                  <div style={{ marginBottom: 16 }}>
                    <p style={cs.subLabel}>Languages</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {repoInfo.languages.map(l => (
                        <span key={l} style={cs.langBadge}>{l}</span>
                      ))}
                    </div>
                  </div>

                  {/* File explorer */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <p style={cs.subLabel}>File Explorer</p>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{filteredFiles.length} files</span>
                    </div>
                    <div style={cs.fileSearchWrap}>
                      <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                      <input
                        type="text"
                        placeholder="Search files…"
                        value={fileSearch}
                        onChange={e => setFileSearch(e.target.value)}
                        style={{ ...cs.fileSearchInput, paddingLeft: 8, flex: 1 }}
                      />
                    </div>
                    <div style={cs.fileList}>
                      {filteredFiles.length === 0 ? (
                        <p style={cs.emptyFiles}>No files match your search.</p>
                      ) : (
                        filteredFiles.map(f => (
                          <div
                            key={f}
                            style={cs.fileItem}
                            onClick={() => viewFileContent(f)}
                          >
                            <FileText size={12} style={{ color: "var(--secondary)", flexShrink: 0 }} />
                            <span style={cs.fileItemText} title={f}>{f}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )
            )}

            {/* ── PATCH TAB ──────────────────────────────────────── */}
            {activeTab === "patch" && currentPatch && (
              applyingPatch ? (
                <div style={cs.centered}>
                  <Loader2 size={36} style={{ animation: "spin 1s linear infinite", color: "var(--primary)" }} />
                  <p style={{ fontWeight: 600, marginTop: 16 }}>{indexingMessage}</p>
                  <div style={{ width: "80%", maxWidth: 300, height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 10, overflow: "hidden", marginTop: 12 }}>
                    <div style={{ width: `${indexingProgress}%`, height: "100%", background: "var(--grad-hero)", transition: "width 0.3s" }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{Math.round(indexingProgress)}% complete</span>
                </div>
              ) : (
                <div style={cs.patchView}>
                  <div style={cs.patchToolbar}>
                    <span style={cs.patchBadge}>
                      <GitPullRequest size={11} /> Unified Diff
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="secondary"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                        onClick={() => {
                          navigator.clipboard.writeText(currentPatch);
                          setCopiedPatch(true);
                          setTimeout(() => setCopiedPatch(false), 2000);
                          toast(setToasts, "Patch copied to clipboard.", "info");
                        }}
                      >
                        {copiedPatch ? <Check size={12} /> : <Copy size={12} />}
                        Copy Diff
                      </button>
                      <a
                        href={api.getDownloadUrl(repoId!)}
                        target="_blank"
                        rel="noreferrer"
                        style={cs.downloadBtn}
                      >
                        <Download size={12} /> Download ZIP
                      </a>
                    </div>
                  </div>
                  <div style={cs.diffContainer}>
                    {renderPatchDiff(currentPatch)}
                  </div>
                  <button style={cs.applyBtn} onClick={handleApplyPatch}>
                    <CheckCircle size={15} /> Apply Patch to Codebase
                  </button>
                </div>
              )
            )}

            {/* ── PLAN TAB ───────────────────────────────────────── */}
            {activeTab === "plan" && currentPlan && (
              <div style={cs.planView}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={cs.panelTitle}>Solution Plan</h3>
                  <button
                    className="secondary"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => { navigator.clipboard.writeText(currentPlan); toast(setToasts, "Plan copied.", "info"); }}
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
                <div className="message-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(currentPlan) }} />
              </div>
            )}

          </div>
        </section>

        {/* ── Chat panel ─────────────────────────────────────────────── */}
        <section style={cs.chatPanel}>

          {/* Chat header */}
          <div style={cs.chatHeader}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <h3 style={cs.chatTitle}>{repoInfo?.name || "Active Workspace"}</h3>
              <span style={cs.chatSubtitle}>AI Copilot Session</span>
            </div>

            {/* Mode selector — scrollable pill row */}
            <div style={cs.modeWrap}>
              <span style={cs.modeLabel}>Mode:</span>
              <div style={cs.modePills}>
                {MODES.map(m => (
                  <button
                    key={m.value}
                    style={{
                      ...cs.modePill,
                      background: mode === m.value ? "var(--primary-glow)" : "rgba(255,255,255,0.04)",
                      borderColor: mode === m.value ? "var(--primary)" : "var(--border-glass)",
                      color: mode === m.value ? "var(--primary-light)" : "var(--text-muted)",
                    }}
                    onClick={() => setMode(m.value)}
                    title={m.desc}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Message list — SCROLLABLE */}
          <div style={cs.messageList}>
            {messages.length === 0 ? (
              <div style={cs.welcome}>
                <Sparkles size={36} color="var(--primary)" style={{ opacity: 0.8 }} />
                <h4 style={{ fontSize: 18, fontWeight: 700, marginTop: 12 }}>
                  How can I help with {repoInfo?.name || "your codebase"}?
                </h4>
                <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 380, lineHeight: 1.6 }}>
                  Ask questions, find bugs, generate patches, or explore the architecture.
                  <br /><kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line.
                </p>

                <div style={cs.suggestions}>
                  {[
                    { label: "🏗️ Explain project structure", q: "Explain the project structure and main entry point." },
                    { label: "🐛 Find potential bugs", q: "Are there any obvious bugs or safety issues in this codebase?" },
                    { label: "🗄️ Database models", q: "Explain how database models are defined and used." },
                    { label: "📡 API endpoints", q: "List all API endpoints and their purposes." },
                    { label: "🔒 Security review", q: "Check for security vulnerabilities or unsafe patterns." },
                    { label: "⚡ Performance issues", q: "Identify potential performance bottlenecks." },
                  ].map(s => (
                    <button
                      key={s.label}
                      style={cs.suggestionBtn}
                      onClick={() => handleSend(s.q)}
                      disabled={loading}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {messages.map((m, i) => (
                  <div
                    key={m.message_id}
                    style={{
                      ...cs.msgRow,
                      justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                      animation: `${m.role === "user" ? "slideInRight" : "slideInLeft"} 0.3s ease`,
                    }}
                  >
                    {/* Avatar */}
                    {m.role === "assistant" && (
                      <div style={cs.avatarBot}>
                        <Sparkles size={13} color="var(--primary-light)" />
                      </div>
                    )}

                    <div style={{
                      ...cs.bubble,
                      background: m.role === "user"
                        ? "rgba(147,51,234,0.15)"
                        : "rgba(255,255,255,0.03)",
                      borderColor: m.role === "user"
                        ? "rgba(147,51,234,0.35)"
                        : "rgba(255,255,255,0.07)",
                      maxWidth: m.role === "user" ? "72%" : "82%",
                    }}>
                      {/* Bubble header */}
                      <div style={cs.bubbleHeader}>
                        <span style={cs.bubbleSender}>
                          {m.role === "user" ? "You" : "CodePilot Agent"}
                        </span>
                        {m.mode && (
                          <span style={cs.bubbleMode}>{m.mode}</span>
                        )}
                        <span style={cs.bubbleTime}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      {/* Content — SCROLLABLE if very long */}
                      <div style={cs.bubbleBody}>
                        <MessageContent content={m.content} mode={m.mode} />
                      </div>

                      {/* Plan badge */}
                      {m.plan && (
                        <button
                          style={cs.planBadge}
                          onClick={() => { setCurrentPlan(m.plan || null); setActiveTab("plan"); }}
                        >
                          <Terminal size={12} /> View Solution Plan
                        </button>
                      )}

                      {/* Patch badge */}
                      {m.patch && (
                        <button
                          style={cs.patchBadgeBtn}
                          onClick={() => { setCurrentPatch(m.patch || null); setActiveTab("patch"); }}
                        >
                          <GitPullRequest size={12} /> View Code Patch
                        </button>
                      )}

                      {/* Citations */}
                      {m.citations?.length > 0 && (
                        <div style={cs.citations}>
                          <p style={cs.citationsLabel}>Sources:</p>
                          <div style={cs.citationsList}>
                            {m.citations.map((c, idx) => (
                              <span key={idx} style={cs.citationChip} title={c.file_path}>
                                <FileText size={10} />
                                {c.file_path.split("/").pop()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {m.role === "user" && (
                      <div style={cs.avatarUser}>You</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Typing indicator */}
            {loading && (
              <div style={{ ...cs.msgRow, justifyContent: "flex-start" }}>
                <div style={cs.avatarBot}>
                  <Sparkles size={13} color="var(--primary-light)" />
                </div>
                <div style={{ ...cs.bubble, background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)", padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <TypingIndicator />
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>CodePilot is thinking…</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div style={cs.inputArea}>
            <div style={cs.inputWrap}>
              <textarea
                ref={chatInputRef}
                rows={1}
                placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
                value={query}
                onChange={handleQueryChange}
                onKeyDown={handleKeyDown}
                disabled={loading}
                style={cs.chatTextarea}
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !query.trim()}
                style={cs.sendBtn}
                title="Send (Enter)"
              >
                {loading
                  ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  : <Send size={16} />
                }
              </button>
            </div>
            <div style={cs.inputMeta}>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                Mode: <strong style={{ color: "var(--primary-light)" }}>{MODES.find(m => m.value === mode)?.label}</strong>
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {query.length > 0 ? `${query.length} chars` : <><kbd>Enter</kbd> send · <kbd>↑</kbd> history</>}
              </span>
            </div>
          </div>

        </section>
      </div>

      {/* ── Toast notifications ─────────────────────────────────────── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === "success" && <CheckCircle size={14} color="var(--success)" />}
            {t.type === "error" && <AlertTriangle size={14} color="var(--error)" />}
            {t.type === "info" && <Sparkles size={14} color="var(--primary)" />}
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page export ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
        <Loader2 size={36} style={{ animation: "spin 1s linear infinite", color: "var(--primary)" }} />
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading workspace…</p>
      </div>
    }>
      <ChatWorkspace />
    </Suspense>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const cs: Record<string, React.CSSProperties> = {

  workspace: {
    display: "flex",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    background: "var(--bg-base)",
  },

  // ── Sidebar ──────────────────────────────────────────────────────────────
  sidebar: {
    background: "rgba(6,5,14,0.95)",
    borderRight: "1px solid var(--border-glass)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    height: "100vh",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  },
  sidebarTop: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 12px 12px",
    borderBottom: "1px solid var(--border-glass)",
    flexShrink: 0,
  },
  sidebarBrand: { display: "flex", alignItems: "center", gap: 8 },
  sidebarActions: {
    padding: "12px 10px",
    display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
  },
  backBtn: {
    width: "100%", justifyContent: "center", padding: "8px 12px", fontSize: 12, gap: 6,
  },
  newThreadBtn: {
    width: "100%", justifyContent: "center", padding: "8px 12px", fontSize: 12, gap: 6,
  },
  threadList: {
    flex: 1, overflowY: "auto", padding: "4px 10px",
    display: "flex", flexDirection: "column", gap: 4,
    minHeight: 0,
  },
  sidebarSectionLabel: {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.1em", color: "var(--text-muted)",
    padding: "8px 4px 4px",
    display: "block", flexShrink: 0,
  },
  emptyThreads: { fontSize: 12, color: "var(--text-muted)", padding: "8px 4px" },
  threadItem: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "9px 10px", borderRadius: 8,
    border: "1px solid transparent", cursor: "pointer",
    transition: "all 0.2s",
    flexShrink: 0,
  },
  threadTitle: {
    fontSize: 12, fontWeight: 500, color: "var(--text-primary)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  threadMeta: { fontSize: 10, color: "var(--text-muted)" },
  sidebarBottom: {
    padding: "12px 14px 16px",
    borderTop: "1px solid var(--border-glass)",
    flexShrink: 0,
  },

  // ── Main ─────────────────────────────────────────────────────────────────
  main: {
    flex: 1, display: "flex", overflow: "hidden", minWidth: 0,
  },

  // ── Left panel ───────────────────────────────────────────────────────────
  leftPanel: {
    width: 380,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--border-glass)",
    background: "rgba(8,7,16,0.9)",
    overflow: "hidden",
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid var(--border-glass)",
    background: "rgba(0,0,0,0.2)",
    flexShrink: 0,
    overflowX: "auto",
  },
  tabBtn: {
    flex: "0 0 auto",
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    borderRadius: 0,
    boxShadow: "none",
    padding: "14px 14px 12px",
    fontSize: 12,
    fontWeight: 600,
    display: "flex", alignItems: "center", gap: 6,
    cursor: "pointer",
    transition: "color 0.2s, border-color 0.2s",
    whiteSpace: "nowrap",
  },
  tabBadge: {
    fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
    background: "var(--primary)",
    color: "#fff", padding: "1px 5px", borderRadius: 10,
    marginLeft: 2,
  },
  tabContent: {
    flex: 1, overflowY: "auto", minHeight: 0,
    padding: "20px",
  },

  // Files tab
  fileDetails: { display: "flex", flexDirection: "column", gap: 16, height: "100%" },
  panelTitle: { fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 },
  metricsRow: { display: "flex", gap: 10, marginBottom: 4 },
  subLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" },
  langBadge: {
    fontSize: 11, background: "rgba(6,182,212,0.08)",
    border: "1px solid rgba(6,182,212,0.25)",
    color: "#22d3ee", padding: "3px 10px", borderRadius: 12,
  },
  fileSearchWrap: {
    display: "flex", alignItems: "center", gap: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border-glass)",
    borderRadius: 8, padding: "8px 12px",
    marginBottom: 8,
  },
  fileSearchInput: {
    background: "none", border: "none",
    color: "var(--text-primary)", fontSize: 13, outline: "none",
    width: "auto",
  },
  fileList: {
    flex: 1, overflowY: "auto",
    border: "1px solid var(--border-glass)",
    borderRadius: 8, background: "rgba(0,0,0,0.2)",
    minHeight: 120,
  },
  emptyFiles: { padding: "16px", fontSize: 12, color: "var(--text-muted)", textAlign: "center" },
  fileItem: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "9px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    fontSize: 12, color: "var(--text-secondary)",
    cursor: "pointer", transition: "background 0.15s",
  },
  fileItemText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },

  // Code viewer
  codeViewer: { display: "flex", flexDirection: "column", gap: 12, height: "100%" },
  codeViewerHeader: {
    display: "flex", alignItems: "center", gap: 10,
    paddingBottom: 12, borderBottom: "1px solid var(--border-glass)",
  },
  codeViewerPath: {
    flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text-secondary)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    fontFamily: "var(--font-mono)",
  },
  codePre: {
    flex: 1,
    background: "#0a0818",
    border: "1px solid var(--border-glass)",
    borderRadius: 8, padding: "14px",
    fontFamily: "var(--font-mono)",
    fontSize: 12, lineHeight: 1.65,
    overflowX: "auto", overflowY: "auto",
    whiteSpace: "pre",
    color: "var(--text-code)",
    maxHeight: "calc(100vh - 200px)",
  },
  centered: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", height: "100%", minHeight: 200,
    gap: 8,
  },

  // Patch view
  patchView: { display: "flex", flexDirection: "column", height: "100%", gap: 12 },
  patchToolbar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexShrink: 0,
  },
  patchBadge: {
    fontSize: 11, fontWeight: 700,
    background: "rgba(147,51,234,0.12)", border: "1px solid var(--border-active)",
    color: "var(--primary-light)", padding: "4px 10px", borderRadius: 6,
    display: "inline-flex", alignItems: "center", gap: 5,
  },
  downloadBtn: {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "6px 12px", fontSize: 12, borderRadius: 8, fontWeight: 600,
    background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-glass)",
    color: "var(--text-secondary)", textDecoration: "none", transition: "all 0.2s",
    whiteSpace: "nowrap",
  },
  diffContainer: {
    flex: 1, overflowY: "auto", overflowX: "auto",
    border: "1px solid var(--border-glass)",
    borderRadius: 8, background: "#0a0818",
    minHeight: 0,
  },
  diffWrapper: {
    fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6,
  },
  diffLine: {
    display: "flex", gap: 12,
    padding: "1px 10px",
    whiteSpace: "pre",
  },
  diffLineNum: {
    color: "rgba(255,255,255,0.2)", userSelect: "none", flexShrink: 0,
    width: 36, textAlign: "right",
  },
  applyBtn: {
    width: "100%", justifyContent: "center",
    background: "linear-gradient(135deg, var(--success), #059669)",
    boxShadow: "0 4px 16px rgba(16,185,129,0.3)",
    flexShrink: 0,
  },

  // Plan view
  planView: {
    display: "flex", flexDirection: "column",
    background: "rgba(255,255,255,0.01)",
  },

  // ── Chat panel ───────────────────────────────────────────────────────────
  chatPanel: {
    flex: 1, display: "flex", flexDirection: "column",
    overflow: "hidden", minWidth: 0,
    background: "rgba(10,8,20,0.85)",
  },

  // Chat header
  chatHeader: {
    padding: "14px 20px",
    borderBottom: "1px solid var(--border-glass)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexShrink: 0, gap: 16,
    background: "rgba(0,0,0,0.15)",
    flexWrap: "wrap",
  },
  chatTitle: { fontSize: 15, fontWeight: 700, color: "var(--text-primary)" },
  chatSubtitle: { fontSize: 11, color: "var(--text-muted)" },
  modeWrap: {
    display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, overflow: "hidden",
  },
  modeLabel: { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0 },
  modePills: {
    display: "flex", gap: 6, overflowX: "auto",
    paddingBottom: 2,
    scrollbarWidth: "none",
    // WebkitOverflowScrolling removed; custom scrollbar hidden via scrollbarWidth
  },
  modePill: {
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 11px", fontSize: 11, fontWeight: 600,
    borderRadius: 20, border: "1px solid",
    background: "none", boxShadow: "none",
    cursor: "pointer", transition: "all 0.2s",
    whiteSpace: "nowrap", flexShrink: 0,
  },

  // Message list — THE KEY SCROLLABLE AREA
  messageList: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 0,
    // Custom scrollbar
    scrollbarWidth: "thin",
    scrollbarColor: "var(--scrollbar-thumb) transparent",
  },

  // Welcome screen
  welcome: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", height: "100%", textAlign: "center",
    padding: "40px 24px", gap: 12,
    color: "var(--text-primary)",
  },
  suggestions: {
    display: "flex", flexWrap: "wrap", gap: 8,
    justifyContent: "center", marginTop: 16, maxWidth: 520,
  },
  suggestionBtn: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border-glass)",
    color: "var(--text-secondary)", fontSize: 12, fontWeight: 500,
    padding: "8px 14px", borderRadius: 20, boxShadow: "none",
    transition: "all 0.2s",
  },

  // Messages
  msgRow: { display: "flex", gap: 10, alignItems: "flex-start" },
  avatarBot: {
    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
    background: "linear-gradient(135deg, var(--primary-glow), var(--secondary-glow))",
    border: "1px solid var(--border-active)",
    display: "flex", alignItems: "center", justifyContent: "center",
    marginTop: 2,
  },
  avatarUser: {
    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
    background: "rgba(147,51,234,0.2)", border: "1px solid rgba(147,51,234,0.3)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 700, color: "var(--primary-light)",
    marginTop: 2,
  },
  bubble: {
    display: "flex", flexDirection: "column", gap: 10,
    padding: "14px 16px",
    borderRadius: 12, border: "1px solid",
    // Key: allow horizontal scroll for long content like code
    overflowX: "hidden",
    wordBreak: "break-word",
  },
  bubbleHeader: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: 11, paddingBottom: 6,
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  bubbleSender: { fontWeight: 700, color: "var(--text-secondary)" },
  bubbleMode: {
    fontSize: 9, fontWeight: 800, textTransform: "uppercase",
    background: "rgba(255,255,255,0.08)", padding: "2px 6px",
    borderRadius: 4, color: "var(--text-muted)",
  },
  bubbleTime: { color: "var(--text-muted)", marginLeft: "auto" },
  bubbleBody: {
    // Allow scroll for very long messages
    maxHeight: 480,
    overflowY: "auto",
    overflowX: "hidden",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--scrollbar-thumb) transparent",
  },
  planBadge: {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontSize: 12, fontWeight: 600, padding: "7px 12px",
    background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
    color: "#fbbf24", borderRadius: 8, boxShadow: "none",
    cursor: "pointer", transition: "all 0.2s",
    alignSelf: "flex-start",
  },
  patchBadgeBtn: {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontSize: 12, fontWeight: 600, padding: "7px 12px",
    background: "rgba(147,51,234,0.1)", border: "1px solid rgba(147,51,234,0.3)",
    color: "var(--primary-light)", borderRadius: 8, boxShadow: "none",
    cursor: "pointer", transition: "all 0.2s",
    alignSelf: "flex-start",
  },
  citations: {
    borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8,
  },
  citationsLabel: { fontSize: 10, color: "var(--text-muted)", marginBottom: 6, fontWeight: 700 },
  citationsList: { display: "flex", flexWrap: "wrap", gap: 5 },
  citationChip: {
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 11, color: "var(--secondary)",
    background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)",
    padding: "3px 8px", borderRadius: 12,
  },

  // Input area
  inputArea: {
    borderTop: "1px solid var(--border-glass)",
    padding: "14px 20px 18px",
    background: "rgba(0,0,0,0.15)",
    flexShrink: 0,
  },
  inputWrap: {
    display: "flex", gap: 10, alignItems: "flex-end",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border-glass)",
    borderRadius: 16, padding: "8px 8px 8px 16px",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  chatTextarea: {
    flex: 1, background: "none", border: "none", outline: "none",
    color: "var(--text-primary)", fontFamily: "var(--font-sans)",
    fontSize: 14, lineHeight: 1.5, resize: "none",
    maxHeight: 160, overflowY: "auto", padding: "4px 0",
    width: "auto",
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 0, flexShrink: 0,
  },
  inputMeta: {
    display: "flex", justifyContent: "space-between",
    marginTop: 6, padding: "0 4px",
  },

  // Copy button for messages
  copyMsgBtn: {
    position: "absolute",
    top: 0, right: 0,
    background: "rgba(255,255,255,0.07) !important",
    border: "1px solid var(--border-glass)",
    borderRadius: 6, padding: "3px 7px",
    fontSize: 11, color: "var(--text-muted)",
    cursor: "pointer", boxShadow: "none",
    opacity: 0,
    transition: "opacity 0.2s",
  },
};
