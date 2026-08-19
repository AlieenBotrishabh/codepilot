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
  CheckCircle2,
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
  X,
} from "lucide-react";
import { api, Message, Thread, RepoInfo } from "../../lib/api";

// ── Types ─────────────────────────────────────────────────────────────────
const THEMES = [
  { id: "nebula",  color: "#7c3aed" },
  { id: "aurora",  color: "#059669" },
  { id: "sunset",  color: "#ea580c" },
  { id: "ocean",   color: "#2563eb" },
];

const MODES = [
  { value: "auto",          label: "Auto Router",          icon: <Zap className="w-3.5 h-3.5" />,        desc: "Smart mode selection" },
  { value: "question",      label: "Q&A",                  icon: <HelpCircle className="w-3.5 h-3.5" />, desc: "Ask anything" },
  { value: "debug",         label: "Debug",                icon: <Bug className="w-3.5 h-3.5" />,         desc: "Find & fix bugs" },
  { value: "patch",         label: "Patch Generator",      icon: <Shield className="w-3.5 h-3.5" />,      desc: "Generate code patches" },
  { value: "review",        label: "Code Review",          icon: <Eye className="w-3.5 h-3.5" />,         desc: "Review code quality" },
  { value: "architecture",  label: "Architecture",         icon: <Book className="w-3.5 h-3.5" />,        desc: "Explain architecture" },
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
    question:     "#7c3aed",
    debug:        "#dc2626",
    patch:        "#4f46e5",
    review:       "#d97706",
    architecture: "#0891b2",
  };
  const accent = mode ? (modeColor[mode] || "#e5e7eb") : "#e5e7eb";

  return (
    <div className="relative group/msg">
      <div
        className="message-content"
        style={{ borderLeft: `2px solid ${accent}`, paddingLeft: 12 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button
        onClick={handleCopy}
        className="ghost absolute top-0 right-0 opacity-0 group-hover/msg:opacity-100 transition-opacity !bg-white !border !border-gray-200"
        title="Copy message"
      >
        {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
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

  // Display-only: filter the thread list
  const [threadSearch, setThreadSearch] = useState("");

  // Below the md breakpoint the Files/Patch/Plan panel cannot sit beside the
  // chat, so it becomes a full-screen overlay. Without this it was simply
  // hidden, which silently removed patch review and "Apply Patch" on narrow
  // viewports even though the buttons that open it stayed clickable.
  const [panelOpen, setPanelOpen] = useState(false);

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
      <div className="font-mono text-xs leading-relaxed">
        {lines.map((line, idx) => {
          let bg = "transparent";
          let color = "#374151";
          if (line.startsWith("+") && !line.startsWith("+++")) {
            bg = "#ecfdf5"; color = "#065f46";
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            bg = "#fef2f2"; color = "#991b1b";
          } else if (line.startsWith("@@")) {
            bg = "#eff6ff"; color = "#1d4ed8";
          } else if (line.startsWith("diff") || line.startsWith("index") || line.startsWith("---") || line.startsWith("+++")) {
            color = "#9ca3af";
          }
          return (
            <div key={idx} className="diff-line flex gap-3 px-3 whitespace-pre" style={{ background: bg, color }}>
              <span className="w-9 text-right flex-shrink-0 select-none text-gray-300">{idx + 1}</span>
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

  const visibleThreads = threads.filter(t =>
    (t.title || "Untitled Thread").toLowerCase().includes(threadSearch.toLowerCase())
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
    <div className="flex h-screen w-screen overflow-hidden bg-white">

      {/* ══ SIDEBAR ═════════════════════════════════════════════════════ */}
      <aside
        className="flex flex-col flex-shrink-0 h-screen overflow-hidden border-r border-gray-200 bg-gray-50"
        style={{
          width: sidebarCollapsed ? 60 : 268,
          transition: "width 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-3 py-3.5 border-b border-gray-200 flex-shrink-0">
          {!sidebarCollapsed && (
            <div
              className="flex items-center gap-2 cursor-pointer select-none min-w-0"
              onClick={() => router.push("/")}
            >
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-black flex-shrink-0">
                <Code className="w-4 h-4 text-white" />
              </span>
              <span className="text-sm font-semibold tracking-tight truncate">CodePilot</span>
            </div>
          )}
          <button
            className="ghost flex-shrink-0"
            onClick={() => setSidebarCollapsed(p => !p)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronRight
              className="w-4 h-4 transition-transform duration-300"
              style={{ transform: sidebarCollapsed ? "rotate(0deg)" : "rotate(180deg)" }}
            />
          </button>
        </div>

        {/* Actions */}
        <div className="px-2.5 py-3 flex flex-col gap-2 flex-shrink-0">
          <button
            className="secondary !w-full !px-3 !py-2 !text-xs"
            onClick={() => router.push("/")}
            title="Back to dashboard"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {!sidebarCollapsed && "Back"}
          </button>
          <button
            className="!w-full !px-3 !py-2 !text-xs"
            onClick={startNewThread}
            title="New conversation"
          >
            <Plus className="w-3.5 h-3.5" />
            {!sidebarCollapsed && "New Thread"}
          </button>
        </div>

        {/* Threads */}
        {!sidebarCollapsed && (
          <div className="flex-1 min-h-0 flex flex-col px-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400 px-1 pt-2 pb-2">
              Conversations
            </span>

            {threads.length > 3 && (
              <div className="relative mb-2">
                <Search className="w-3 h-3 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter threads…"
                  value={threadSearch}
                  onChange={e => setThreadSearch(e.target.value)}
                  className="!pl-8 !py-1.5 !text-xs !rounded-lg"
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto flex flex-col gap-1 pb-2">
              {visibleThreads.length === 0 ? (
                <p className="text-xs text-gray-400 px-1 py-2">
                  {threads.length === 0 ? "No conversations yet." : "No threads match."}
                </p>
              ) : (
                visibleThreads.map(t => (
                  <div
                    key={t.thread_id}
                    onClick={() => setActiveThreadId(t.thread_id)}
                    className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors flex-shrink-0 ${
                      activeThreadId === t.thread_id
                        ? "bg-white border-gray-300 shadow-sm"
                        : "bg-transparent border-transparent hover:bg-white/70"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{t.title || "Untitled Thread"}</p>
                      <span className="text-[10px] text-gray-400">{t.message_count} msgs</span>
                    </div>
                    <button
                      className="ghost opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      onClick={e => handleDeleteThread(t.thread_id, e)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Bottom */}
        {!sidebarCollapsed && (
          <div className="px-3 py-3 border-t border-gray-200 flex-shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
              Theme
            </span>
            <div className="theme-switcher mt-2 justify-center">
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
              <div className="mt-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Active Repo</p>
                <p className="text-xs font-semibold truncate">{repoInfo.name}</p>
                <p className="text-[10px] text-gray-500 mt-1">
                  {repoInfo.file_count} files · {repoInfo.chunk_count} chunks
                </p>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ══ MAIN ════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden min-w-0">

        {/* ── Left panel: Files / Patch / Plan ───────────────────────── */}
        <section
          className={`${panelOpen ? "flex" : "hidden"} md:flex fixed inset-0 z-40 w-full md:static md:z-auto md:w-[320px] lg:w-[380px] flex-shrink-0 flex-col border-r border-gray-200 bg-white overflow-hidden`}
        >

          {/* Tab bar */}
          <div className="flex items-center border-b border-gray-200 flex-shrink-0 overflow-x-auto no-scrollbar px-2">
            <button
              className="ghost md:hidden mr-1 flex-shrink-0"
              onClick={() => setPanelOpen(false)}
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
            {[
              { id: "files",  label: "Codebase",   icon: <FileText className="w-3.5 h-3.5" /> },
              { id: "patch",  label: "Code Patch", icon: <GitPullRequest className="w-3.5 h-3.5" />, disabled: !currentPatch },
              { id: "plan",   label: "Plan",       icon: <Terminal className="w-3.5 h-3.5" />,       disabled: !currentPlan },
            ].map(tab => (
              <button
                key={tab.id}
                disabled={!!tab.disabled}
                onClick={() => setActiveTab(tab.id as any)}
                className={`!bg-transparent !rounded-none !shadow-none !px-3.5 !py-3.5 !text-xs !font-medium border-b-2 hover:!bg-transparent ${
                  activeTab === tab.id
                    ? "!text-black border-black"
                    : "!text-gray-500 hover:!text-black border-transparent"
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.id === "patch" && currentPatch && (
                  <span className="ml-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-black text-white">
                    New
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto min-h-0 p-5">

            {/* ── FILES TAB ─────────────────────────────────────── */}
            {activeTab === "files" && repoInfo && (
              selectedFilePath ? (
                <div className="flex flex-col gap-3 h-full">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-gray-200">
                    <button
                      className="secondary !px-3 !py-1.5 !text-xs"
                      onClick={() => { setSelectedFilePath(null); setSelectedFileContent(null); }}
                    >
                      <ArrowLeft className="w-3 h-3" /> Files
                    </button>
                    <span className="flex-1 text-xs font-medium text-gray-600 font-mono truncate" title={selectedFilePath}>
                      {selectedFilePath}
                    </span>
                    {selectedFileContent && (
                      <button
                        className="secondary !px-2.5 !py-1.5"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedFileContent);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                        }}
                        title="Copy file content"
                      >
                        {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                  {fileContentLoading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2.5">
                      <Loader2 className="w-7 h-7 spin text-gray-900" />
                      <span className="text-xs text-gray-500">Loading file…</span>
                    </div>
                  ) : (
                    <pre className="flex-1 rounded-xl border border-gray-800 bg-[#0b0b0f] text-gray-200 p-4 font-mono text-xs leading-relaxed overflow-auto whitespace-pre max-h-[calc(100vh-200px)]">
                      {selectedFileContent || "// Empty file"}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-5 h-full">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight">{repoInfo.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Indexed workspace</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Files Indexed", value: repoInfo.file_count.toLocaleString() },
                      { label: "Code Chunks",   value: repoInfo.chunk_count.toLocaleString() },
                    ].map(m => (
                      <div key={m.label} className="stat-chip">
                        <span className="stat-value">{m.value}</span>
                        <span className="stat-label">{m.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Languages */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-2">
                      Languages
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {repoInfo.languages.map(l => (
                        <span
                          key={l}
                          className="text-[11px] px-2.5 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600"
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* File explorer */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                        File Explorer
                      </p>
                      <span className="text-[11px] text-gray-400">{filteredFiles.length} files</span>
                    </div>

                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search files…"
                        value={fileSearch}
                        onChange={e => setFileSearch(e.target.value)}
                        className="!pl-9 !py-2 !text-xs !rounded-lg"
                      />
                    </div>

                    <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 min-h-[120px]">
                      {filteredFiles.length === 0 ? (
                        <p className="p-4 text-xs text-gray-400 text-center">No files match your search.</p>
                      ) : (
                        filteredFiles.map(f => (
                          <div
                            key={f}
                            onClick={() => viewFileContent(f)}
                            className="file-item flex items-center gap-2 px-3 py-2 border-b border-gray-100 last:border-b-0 text-xs text-gray-600 cursor-pointer transition-colors"
                          >
                            <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="truncate" title={f}>{f}</span>
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
                <div className="flex flex-col items-center justify-center h-full min-h-[220px] gap-3">
                  <Loader2 className="w-8 h-8 spin text-gray-900" />
                  <p className="text-sm font-semibold text-center">{indexingMessage}</p>
                  <div className="w-4/5 max-w-[300px] h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-black rounded-full"
                      style={{ width: `${indexingProgress}%`, transition: "width 0.3s" }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{Math.round(indexingProgress)}% complete</span>
                </div>
              ) : (
                <div className="flex flex-col h-full gap-3">
                  <div className="flex items-center justify-between flex-shrink-0 gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700">
                      <GitPullRequest className="w-3 h-3" /> Unified Diff
                    </span>
                    <div className="flex gap-2">
                      <button
                        className="secondary !px-3 !py-1.5 !text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(currentPatch);
                          setCopiedPatch(true);
                          setTimeout(() => setCopiedPatch(false), 2000);
                          toast(setToasts, "Patch copied to clipboard.", "info");
                        }}
                      >
                        {copiedPatch ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        Copy
                      </button>
                      <a
                        href={api.getDownloadUrl(repoId!)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-gray-200 bg-white text-gray-600 hover:text-black hover:border-gray-300 transition-colors whitespace-nowrap no-underline"
                      >
                        <Download className="w-3 h-3" /> ZIP
                      </a>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white min-h-0 py-2">
                    {renderPatchDiff(currentPatch)}
                  </div>

                  <button
                    className="apply-btn !w-full !py-3 flex-shrink-0"
                    onClick={handleApplyPatch}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Apply Patch to Codebase
                  </button>
                </div>
              )
            )}

            {/* ── PLAN TAB ───────────────────────────────────────── */}
            {activeTab === "plan" && currentPlan && (
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold tracking-tight">Solution Plan</h3>
                  <button
                    className="secondary !px-3 !py-1.5 !text-xs"
                    onClick={() => { navigator.clipboard.writeText(currentPlan); toast(setToasts, "Plan copied.", "info"); }}
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
                <div className="message-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(currentPlan) }} />
              </div>
            )}

          </div>
        </section>

        {/* ── Chat panel ─────────────────────────────────────────────── */}
        <section className="flex-1 flex flex-col overflow-hidden min-w-0 bg-white">

          {/* Chat header */}
          <div className="flex items-center justify-between gap-4 flex-wrap px-5 py-3 border-b border-gray-200 flex-shrink-0 bg-white/85 backdrop-blur-xl">
            <button
              className="ghost md:hidden flex-shrink-0"
              onClick={() => setPanelOpen(true)}
              title="Open codebase panel"
            >
              <FileText className="w-4 h-4" />
            </button>
            <div className="flex flex-col min-w-0">
              <h3 className="text-sm font-semibold tracking-tight truncate">
                {repoInfo?.name || "Active Workspace"}
              </h3>
              <span className="text-[11px] text-gray-400">AI Copilot Session</span>
            </div>

            {/* Mode selector */}
            <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
              <span className="text-[11px] font-medium text-gray-400 flex-shrink-0 hidden sm:inline">Mode</span>
              <div className="flex gap-1.5 overflow-x-auto mode-pills-scroll py-0.5">
                {MODES.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    title={m.desc}
                    className={`mode-pill !px-3 !py-1.5 !text-[11px] !font-medium !shadow-none flex-shrink-0 border ${
                      mode === m.value
                        ? "!bg-black !text-white border-black"
                        : "!bg-white !text-gray-600 border-gray-200 hover:!text-black"
                    }`}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Message list */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-5 py-6 flex flex-col gap-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10 gap-3">
                <span className="w-14 h-14 rounded-2xl bg-black flex items-center justify-center mb-1 animate-floaty">
                  <Sparkles className="w-6 h-6 text-white" />
                </span>
                <h4 className="text-2xl font-normal tracking-tight">
                  How can I help with{" "}
                  <span className="bg-gradient-to-r from-black via-gray-500 to-gray-400 bg-clip-text text-transparent">
                    {repoInfo?.name || "your codebase"}
                  </span>
                  ?
                </h4>
                <p className="text-sm text-gray-500 max-w-md leading-relaxed">
                  Ask questions, find bugs, generate patches, or explore the architecture.
                  <br />
                  <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for a new line.
                </p>

                <div className="flex flex-wrap gap-2 justify-center mt-5 max-w-xl">
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
                      onClick={() => handleSend(s.q)}
                      disabled={loading}
                      className="suggestion-btn !bg-white !text-gray-600 !border !border-gray-200 !px-3.5 !py-2 !text-xs !font-medium !shadow-none"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5 max-w-3xl w-full mx-auto">
                {messages.map(m => (
                  <div
                    key={m.message_id}
                    className={`flex gap-2.5 items-start ${
                      m.role === "user" ? "justify-end slide-in-right" : "justify-start slide-in-left"
                    }`}
                  >
                    {m.role === "assistant" && (
                      <span className="w-8 h-8 rounded-xl bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                      </span>
                    )}

                    <div
                      className={`flex flex-col gap-2.5 px-4 py-3.5 rounded-2xl border ${
                        m.role === "user"
                          ? "bg-gray-50 border-gray-200 max-w-[80%]"
                          : "bg-white border-gray-200 shadow-sm max-w-[86%]"
                      }`}
                    >
                      {/* Bubble header */}
                      <div className="flex items-center gap-2 text-[11px] pb-2 border-b border-gray-100">
                        <span className="font-semibold text-gray-700">
                          {m.role === "user" ? "You" : "CodePilot Agent"}
                        </span>
                        {m.mode && (
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                            {m.mode}
                          </span>
                        )}
                        <span className="ml-auto text-gray-400">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="max-h-[480px] overflow-y-auto overflow-x-hidden">
                        <MessageContent content={m.content} mode={m.mode} />
                      </div>

                      {/* Plan badge */}
                      {m.plan && (
                        <button
                          onClick={() => { setCurrentPlan(m.plan || null); setActiveTab("plan"); setPanelOpen(true); }}
                          className="plan-badge-btn self-start !bg-amber-50 !text-amber-700 !border !border-amber-200 !px-3 !py-1.5 !text-xs !font-medium !shadow-none"
                        >
                          <Terminal className="w-3 h-3" /> View Solution Plan
                        </button>
                      )}

                      {/* Patch badge */}
                      {m.patch && (
                        <button
                          onClick={() => { setCurrentPatch(m.patch || null); setActiveTab("patch"); setPanelOpen(true); }}
                          className="patch-badge-btn self-start !bg-gray-900 !text-white !px-3 !py-1.5 !text-xs !font-medium"
                        >
                          <GitPullRequest className="w-3 h-3" /> View Code Patch
                        </button>
                      )}

                      {/* Citations */}
                      {m.citations?.length > 0 && (
                        <div className="border-t border-gray-100 pt-2.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                            Sources
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {m.citations.map((c, idx) => (
                              <span
                                key={idx}
                                title={c.file_path}
                                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-600"
                              >
                                <FileText className="w-2.5 h-2.5" />
                                {c.file_path.split("/").pop()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {m.role === "user" && (
                      <span className="w-8 h-8 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold text-gray-600">
                        You
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Typing indicator */}
            {loading && (
              <div className="flex gap-2.5 items-start max-w-3xl w-full mx-auto">
                <span className="w-8 h-8 rounded-xl bg-black flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </span>
                <div className="px-4 py-3.5 rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <TypingIndicator />
                    <span className="text-xs text-gray-500">CodePilot is thinking…</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-gray-200 px-5 pt-3.5 pb-4 flex-shrink-0 bg-white">
            <div className="max-w-3xl mx-auto">
              <div className="input-wrap flex gap-2.5 items-end rounded-2xl border border-gray-200 bg-white pl-4 pr-2 py-2 transition-all">
                <textarea
                  ref={chatInputRef}
                  rows={1}
                  placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
                  value={query}
                  onChange={handleQueryChange}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  className="chat-textarea flex-1 !bg-transparent !border-0 !p-0 !py-1.5 !rounded-none !shadow-none resize-none text-sm leading-relaxed max-h-40 overflow-y-auto focus:!ring-0 focus:!shadow-none"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={loading || !query.trim()}
                  title="Send (Enter)"
                  className="!w-9 !h-9 !p-0 !rounded-xl flex-shrink-0"
                >
                  {loading
                    ? <Loader2 className="w-4 h-4 spin" />
                    : <Send className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex justify-between mt-2 px-1">
                <span className="text-[11px] text-gray-400">
                  Mode: <strong className="text-gray-700 font-medium">
                    {MODES.find(m => m.value === mode)?.label}
                  </strong>
                </span>
                <span className="text-[11px] text-gray-400">
                  {query.length > 0
                    ? `${query.length} chars`
                    : <><kbd>Enter</kbd> send · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> force</>}
                </span>
              </div>
            </div>
          </div>

        </section>
      </div>

      {/* ══ TOASTS ══════════════════════════════════════════════════════ */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            {t.type === "error" && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
            {t.type === "info" && <Sparkles className="w-3.5 h-3.5 text-gray-700" />}
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
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="w-8 h-8 spin text-gray-900" />
        <p className="text-sm text-gray-500">Loading workspace…</p>
      </div>
    }>
      <ChatWorkspace />
    </Suspense>
  );
}
