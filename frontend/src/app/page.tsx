"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Code,
  Sparkles,
  Zap,
  Shield,
  LayoutDashboard,
  Plus,
  ArrowRight,
  GitPullRequest,
  CheckCircle2,
  Star,
  ChevronDown,
  BarChart3,
  MessageSquare,
  Eye,
  Rocket,
  FolderOpen,
  GitBranch,
  UploadCloud,
  Search,
  Bug,
  Terminal,
  BookOpen,
  Database,
  FileCode,
  Lock,
  Menu,
  X,
  Check,
  Minus,
} from "lucide-react";

const THEMES = [
  { id: "nebula",  label: "Nebula",  color: "#7c3aed" },
  { id: "aurora",  label: "Aurora",  color: "#059669" },
  { id: "sunset",  label: "Sunset",  color: "#ea580c" },
  { id: "ocean",   label: "Ocean",   color: "#2563eb" },
];

type TabId = "ingest" | "ask" | "review" | "patch";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "ingest", label: "Ingest",  icon: <BarChart3 className="w-4 h-4" /> },
  { id: "ask",    label: "Ask",     icon: <BookOpen className="w-4 h-4" /> },
  { id: "review", label: "Review",  icon: <Eye className="w-4 h-4" /> },
  { id: "patch",  label: "Patch",   icon: <Rocket className="w-4 h-4" /> },
];

const STACK = [
  "LangGraph", "FastAPI", "ChromaDB", "MongoDB", "Next.js", "Docker", "Gemini",
];

const FEATURES = [
  {
    icon: <FolderOpen className="w-5 h-5" />,
    title: "Local Folder Packaging",
    desc: "Point CodePilot at any absolute folder path. It packs the tree, applies ignore lists, and vector-indexes every source file.",
    tag: "Ingestion",
  },
  {
    icon: <GitPullRequest className="w-5 h-5" />,
    title: "Autonomous Patch Generator",
    desc: "Describe a bug or a feature. The agent plans, resolves dependencies, and emits a standard unified git diff you apply in one click.",
    tag: "Automation",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Mode-Specific Diagnostics",
    desc: "Dedicated engines for Q&A, debugging, code review with severity scoring, and architectural walkthroughs.",
    tag: "Analysis",
  },
  {
    icon: <Search className="w-5 h-5" />,
    title: "Cited Semantic Retrieval",
    desc: "Every answer ships with the exact files and snippets it was grounded in, so you can verify the reasoning instantly.",
    tag: "Retrieval",
  },
  {
    icon: <GitBranch className="w-5 h-5" />,
    title: "Git & ZIP Ingestion",
    desc: "Clone a public repository, upload a ZIP archive, or read straight from disk — all three land in the same index.",
    tag: "Sources",
  },
  {
    icon: <Database className="w-5 h-5" />,
    title: "Persistent Vector Memory",
    desc: "Chunks live in Chroma and threads live in MongoDB, so context survives restarts and conversations pick up where you left off.",
    tag: "Memory",
  },
];

const MODES = [
  { icon: <Zap className="w-4 h-4" />,         label: "Auto Router",  desc: "Picks the right engine for the question." },
  { icon: <MessageSquare className="w-4 h-4" />, label: "Q&A",        desc: "Ask anything about the indexed codebase." },
  { icon: <Bug className="w-4 h-4" />,          label: "Debug",       desc: "Trace failures back to their root cause." },
  { icon: <Shield className="w-4 h-4" />,       label: "Patch",       desc: "Generate an applyable unified diff." },
  { icon: <Eye className="w-4 h-4" />,          label: "Code Review", desc: "Quality and severity report per file." },
  { icon: <Terminal className="w-4 h-4" />,     label: "Architecture", desc: "Explain flows, layers and boundaries." },
];

const STEPS = [
  {
    n: "01",
    title: "Ingest your codebase",
    desc: "Give CodePilot a local path, a public Git URL, or a ZIP archive. Files are parsed, chunked and embedded.",
    icon: <UploadCloud className="w-5 h-5" />,
  },
  {
    n: "02",
    title: "Ask in natural language",
    desc: "Pick a mode or let the auto router decide. Retrieval pulls the most relevant chunks and cites every source.",
    icon: <MessageSquare className="w-5 h-5" />,
  },
  {
    n: "03",
    title: "Apply the patch",
    desc: "Review the generated unified diff line by line, then apply it and let the index re-sync automatically.",
    icon: <CheckCircle2 className="w-5 h-5" />,
  },
];

const FAQS = [
  {
    q: "Does my source code leave my machine?",
    a: "The backend runs wherever you deploy it — locally via docker-compose by default. Files are read, chunked and embedded by your own FastAPI service, and the vector index lives in your Chroma volume.",
  },
  {
    q: "Which sources can I index?",
    a: "Three: an absolute local directory path, a public GitHub repository URL that gets cloned server-side, or a ZIP archive you upload from the browser.",
  },
  {
    q: "How are patches applied?",
    a: "The agent returns a standard unified diff. You can inspect it line by line, copy it, download the repository as a ZIP, or apply it directly — after which the affected files are re-indexed.",
  },
  {
    q: "What keeps answers grounded?",
    a: "Every response carries citations pointing at the exact file paths and snippets retrieved from the vector store, so nothing is accepted on trust alone.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [theme, setTheme] = useState("nebula");

  // ── New presentational state (no backend behaviour) ────────────────────
  const [activeTab, setActiveTab] = useState<TabId>("ingest");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

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

  // Auto-cycle the preview tabs every 4s
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTab(prev => {
        const idx = TABS.findIndex(t => t.id === prev);
        return TABS[(idx + 1) % TABS.length].id;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Sticky-nav shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="bg-white min-h-screen">
      {/* ══ NAVIGATION ══════════════════════════════════════════════════ */}
      <header
        className={`sticky top-0 z-50 bg-white/85 backdrop-blur-xl transition-all duration-300 ${
          scrolled ? "border-b border-gray-200" : "border-b border-transparent"
        }`}
      >
        <nav
          className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.1s" }}
        >
          {/* Left — brand */}
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => router.push("/")}
          >
            <span className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-black">
              <Code className="w-[18px] h-[18px] text-white" />
            </span>
            <span className="text-lg font-semibold tracking-tight">CodePilot</span>
            <span className="hidden sm:inline-block text-[10px] font-semibold tracking-widest text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">
              RAG
            </span>
          </div>

          {/* Center — links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#capabilities" className="nav-link text-sm text-gray-700 hover:text-black transition-colors flex items-center gap-1">
              Capabilities <ChevronDown className="w-3.5 h-3.5" />
            </a>
            <a href="#modes" className="nav-link text-sm text-gray-700 hover:text-black transition-colors flex items-center gap-1">
              For Teams <ChevronDown className="w-3.5 h-3.5" />
            </a>
            <a href="#how" className="nav-link text-sm text-gray-700 hover:text-black transition-colors">
              How It Works
            </a>
            <a href="#faq" className="nav-link text-sm text-gray-700 hover:text-black transition-colors">
              Learn Hub
            </a>
          </div>

          {/* Right — theme + CTA */}
          <div className="flex items-center gap-3">
            <div className="theme-switcher hidden sm:flex">
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
            <button
              onClick={() => router.push("/dashboard")}
              className="hidden sm:inline-flex !bg-transparent !text-gray-700 hover:!text-black !shadow-none !px-2 text-sm"
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push("/ingest")}
              className="!bg-black !text-white !px-5 !py-2.5 !rounded-full !text-sm !font-medium hover:!bg-gray-800 transition-colors"
            >
              Get started free
            </button>
            <button
              className="ghost md:hidden"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Toggle navigation"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white px-6 py-4 flex flex-col gap-4 fade-in">
            {[
              { href: "#capabilities", label: "Capabilities" },
              { href: "#modes", label: "For Teams" },
              { href: "#how", label: "How It Works" },
              { href: "#faq", label: "Learn Hub" },
            ].map(l => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="text-sm text-gray-700 hover:text-black transition-colors"
              >
                {l.label}
              </a>
            ))}
            <div className="theme-switcher self-start">
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
          </div>
        )}
      </header>

      {/* ══ HERO ════════════════════════════════════════════════════════ */}
      <section className="px-6 pt-24 pb-32 max-w-7xl mx-auto text-center relative">
        {/* soft backdrop */}
        <div
          className="pointer-events-none absolute inset-x-0 -top-24 h-[520px] -z-10"
          style={{ background: "var(--grad-bg)" }}
        />

        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 mb-8 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.2s" }}
        >
          <span className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center">
            <Star className="w-3 h-3 fill-black text-black" />
          </span>
          <span className="text-sm font-medium text-black">
            Grounded answers · every response is cited
          </span>
        </div>

        {/* Heading */}
        <h1
          className="text-5xl sm:text-6xl md:text-7xl lg:text-[80px] font-normal leading-[1.1] tracking-tight mb-5 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.3s" }}
        >
          <span className="block">Understand Any Codebase.</span>
          <span className="block bg-gradient-to-r from-black via-gray-500 to-gray-400 bg-clip-text text-transparent">
            Patch It in Seconds.
          </span>
        </h1>

        {/* Subheading */}
        <p
          className="text-lg md:text-xl text-gray-600 mb-8 max-w-2xl mx-auto animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.4s" }}
        >
          CodePilot indexes your repository semantically, answers questions with
          citations, hunts down bugs, and generates unified git diffs you can
          apply in a single click.
        </p>

        {/* CTAs */}
        <div
          className="flex flex-wrap items-center justify-center gap-3 mb-12 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.5s" }}
        >
          <button
            onClick={() => router.push("/ingest")}
            className="!bg-black !text-white !px-8 !py-3 !rounded-full !text-base !font-medium hover:!bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" /> Ingest a Codebase
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="secondary !px-8 !py-3 !rounded-full !text-base !font-medium"
          >
            <LayoutDashboard className="w-4 h-4" /> Open Dashboard
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div
          className="flex justify-center mb-8 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.6s" }}
        >
          <div className="bg-gray-100 rounded-lg p-1">
            {/* Mobile — 2x2 grid */}
            <div className="grid grid-cols-2 gap-1 md:hidden">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`!rounded-md !px-4 !py-2 !text-sm !font-medium !shadow-none transition-colors ${
                    activeTab === t.id
                      ? "!bg-white !text-black shadow-sm"
                      : "!bg-transparent !text-gray-600"
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Desktop — single row with dividers */}
            <div className="hidden md:flex items-center">
              {TABS.map((t, i) => (
                <div key={t.id} className="flex items-center">
                  <button
                    onClick={() => setActiveTab(t.id)}
                    className={`!rounded-md !px-5 !py-2 !text-sm !font-medium !shadow-none transition-colors ${
                      activeTab === t.id
                        ? "!bg-white !text-black shadow-sm"
                        : "!bg-transparent !text-gray-600 hover:!text-black"
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                  {i < TABS.length - 1 && (
                    <span
                      className={`w-px h-5 bg-gray-300 mx-1 transition-opacity ${
                        activeTab === t.id || activeTab === TABS[i + 1].id
                          ? "opacity-0"
                          : "opacity-100"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Preview — video + overlays */}
        <div
          className="relative rounded-3xl overflow-hidden h-[400px] md:h-[500px] border border-gray-200 bg-gray-900 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.7s" }}
        >
          <video
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260319_165750_358b1e72-c921-48b7-aaac-f200994f32fb.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />

          {/* ── a. Ingest overlay ── */}
          {activeTab === "ingest" && (
            <div key="ingest" className="absolute inset-0 bg-black/35 animate-fade-in-overlay">
              <div className="absolute left-1/2 top-1/2 w-[min(92%,440px)] bg-white rounded-2xl shadow-2xl p-6 text-left animate-slide-up-overlay">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                    <FolderOpen className="w-4 h-4 text-violet-600" />
                  </span>
                  <h3 className="text-base font-semibold text-black">Set Up Your AI Workspace</h3>
                </div>
                <p className="text-xs text-gray-500 mb-4">Step 1 of 4 · Selecting source</p>

                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-5">
                  <div className="h-full bg-violet-600 rounded-full transition-all duration-700" style={{ width: "25%" }} />
                </div>

                <ul className="space-y-3">
                  {[
                    { label: "Choose a source", sub: "Local path, Git URL or ZIP", done: true },
                    { label: "Filter ignore lists", sub: "node_modules, build artifacts", done: false },
                    { label: "Chunk & embed", sub: "Language-aware splitting", done: false },
                    { label: "Persist to Chroma", sub: "Vector index ready to query", done: false },
                  ].map(s => (
                    <li key={s.label} className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                          s.done ? "bg-violet-600" : "border border-gray-300 bg-white"
                        }`}
                      >
                        {s.done
                          ? <Check className="w-3 h-3 text-white" />
                          : <Minus className="w-3 h-3 text-gray-300" />}
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-black">{s.label}</span>
                        <span className="block text-xs text-gray-500">{s.sub}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ── b. Ask overlay ── */}
          {activeTab === "ask" && (
            <div key="ask" className="absolute inset-0 bg-black/35 animate-fade-in-overlay">
              <div className="absolute left-1/2 top-1/2 w-[min(92%,440px)] bg-white rounded-2xl shadow-2xl p-6 text-left animate-slide-up-overlay">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Search className="w-4 h-4 text-orange-600" />
                  </span>
                  <h3 className="text-base font-semibold text-black">Semantic Retrieval</h3>
                </div>
                <p className="text-xs text-gray-500 mb-4">Ranking 1,284 chunks · 67% scanned</p>

                <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-5">
                  <div className="h-full bg-orange-500 rounded-full transition-all duration-700" style={{ width: "67%" }} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { k: "Top-k chunks", v: "8" },
                    { k: "Mean score", v: "0.87" },
                    { k: "Files touched", v: "5" },
                    { k: "Latency", v: "1.2s" },
                  ].map(m => (
                    <div key={m.k} className="rounded-xl border border-gray-200 px-3 py-2.5">
                      <span className="block text-lg font-semibold text-black leading-tight">{m.v}</span>
                      <span className="block text-[11px] text-gray-500">{m.k}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── c. Review overlay ── */}
          {activeTab === "review" && (
            <div key="review" className="absolute inset-0 bg-black/35 animate-fade-in-overlay">
              <div className="absolute left-1/2 top-1/2 w-[min(92%,440px)] bg-white rounded-2xl shadow-2xl p-6 text-left animate-slide-up-overlay">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </span>
                  <h3 className="text-base font-semibold text-black">Review Suite Results</h3>
                </div>

                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 mb-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-emerald-800">All checks passed</span>
                  <span className="text-sm font-semibold text-emerald-700">127 / 127</span>
                </div>

                <ul className="space-y-2.5">
                  {[
                    { k: "Semantic alignment", v: "Verified" },
                    { k: "Unsafe patterns", v: "0 found" },
                    { k: "Dead code paths", v: "3 flagged" },
                    { k: "Severity ceiling", v: "Low" },
                  ].map(r => (
                    <li key={r.k} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{r.k}</span>
                      <span className="font-medium text-black">{r.v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ── d. Patch overlay ── */}
          {activeTab === "patch" && (
            <div key="patch" className="absolute inset-0 bg-black/35 animate-fade-in-overlay">
              <div className="absolute left-1/2 top-1/2 w-[min(92%,440px)] bg-white rounded-2xl shadow-2xl p-6 text-left animate-slide-up-overlay">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                    <GitPullRequest className="w-4 h-4 text-black" />
                  </span>
                  <h3 className="text-base font-semibold text-black">Apply to Codebase</h3>
                </div>

                <ul className="space-y-3 mb-5">
                  {[
                    "Unified diff validated",
                    "3 files resolved against the index",
                    "No conflicting hunks detected",
                    "Re-index queued after apply",
                  ].map(item => (
                    <li key={item} className="flex items-center gap-3 text-sm text-gray-700">
                      <span className="w-5 h-5 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => router.push("/dashboard")}
                  className="!w-full !bg-black !text-white !rounded-full !py-2.5 !text-sm !font-medium hover:!bg-gray-800"
                >
                  Apply Patch Now <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stack strip */}
        <div
          className="mt-24 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.8s" }}
        >
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400 mb-8">
            Built on a production-grade open stack
          </p>
          <div className="marquee-mask overflow-hidden">
            <div className="flex w-max animate-marquee gap-14 items-center">
              {[...STACK, ...STACK].map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  className="text-xl font-semibold tracking-tight text-gray-400 hover:text-gray-700 transition-colors whitespace-nowrap"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ CAPABILITIES ════════════════════════════════════════════════ */}
      <section id="capabilities" className="px-6 py-24 max-w-7xl mx-auto border-t border-gray-100">
        <div
          className="max-w-2xl mb-14 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.1s" }}
        >
          <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-full px-3 py-1 mb-5">
            <Sparkles className="w-3 h-3" /> Capabilities
          </span>
          <h2 className="text-4xl md:text-5xl font-normal leading-[1.15] tracking-tight mb-4">
            Everything you need to reason about{" "}
            <span className="bg-gradient-to-r from-black via-gray-500 to-gray-400 bg-clip-text text-transparent">
              unfamiliar code
            </span>
          </h2>
          <p className="text-lg text-gray-600">
            Ingestion, retrieval, diagnostics and patching — one pipeline, no context switching.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="feature-card group rounded-2xl border border-gray-200 bg-white p-7 hover-lift animate-fade-in-up"
              style={{ opacity: 0, animationDelay: `${0.2 + i * 0.1}s` }}
            >
              <div className="flex items-center justify-between mb-5">
                <span className="feature-icon w-11 h-11 rounded-xl bg-gray-900 text-white flex items-center justify-center">
                  {f.icon}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
                  {f.tag}
                </span>
              </div>
              <h3 className="text-lg font-semibold tracking-tight mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ HOW IT WORKS ════════════════════════════════════════════════ */}
      <section id="how" className="px-6 py-24 max-w-7xl mx-auto">
        <div
          className="rounded-3xl border border-gray-200 bg-gray-50 p-8 md:p-14 relative overflow-hidden animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.1s" }}
        >
          <div className="absolute inset-0 dot-bg opacity-60 pointer-events-none" />
          <div className="relative">
            <h2 className="text-4xl md:text-5xl font-normal tracking-tight mb-3">
              Three steps to a merged fix
            </h2>
            <p className="text-lg text-gray-600 mb-12 max-w-xl">
              From a cold repository to an applied patch, without leaving the workspace.
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              {STEPS.map((s, i) => (
                <div
                  key={s.n}
                  className="rounded-2xl bg-white border border-gray-200 p-7 hover-lift animate-fade-in-up"
                  style={{ opacity: 0, animationDelay: `${0.2 + i * 0.1}s` }}
                >
                  <div className="flex items-center justify-between mb-5">
                    <span className="w-11 h-11 rounded-xl border border-gray-200 flex items-center justify-center text-gray-900">
                      {s.icon}
                    </span>
                    <span className="text-3xl font-semibold text-gray-200 tracking-tight">{s.n}</span>
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ MODES ═══════════════════════════════════════════════════════ */}
      <section id="modes" className="px-6 py-24 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-14 items-start">
          <div
            className="animate-fade-in-up lg:sticky lg:top-28"
            style={{ opacity: 0, animationDelay: "0.1s" }}
          >
            <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-full px-3 py-1 mb-5">
              <Zap className="w-3 h-3" /> Six engines
            </span>
            <h2 className="text-4xl md:text-5xl font-normal leading-[1.15] tracking-tight mb-4">
              One workspace,{" "}
              <span className="bg-gradient-to-r from-black via-gray-500 to-gray-400 bg-clip-text text-transparent">
                six specialists
              </span>
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              Every question routes to a purpose-built engine. Pick one explicitly,
              or let the auto router read the intent and choose for you.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="!bg-black !text-white !px-7 !py-3 !rounded-full !text-sm !font-medium hover:!bg-gray-800"
            >
              Explore the workspace <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {MODES.map((m, i) => (
              <div
                key={m.label}
                className="rounded-2xl border border-gray-200 bg-white p-6 hover-lift animate-fade-in-up"
                style={{ opacity: 0, animationDelay: `${0.2 + i * 0.1}s` }}
              >
                <span className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-900 mb-4">
                  {m.icon}
                </span>
                <h3 className="text-base font-semibold tracking-tight mb-1.5">{m.label}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ METRICS BAND ════════════════════════════════════════════════ */}
      <section className="px-6 py-16 max-w-7xl mx-auto">
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200 rounded-2xl overflow-hidden border border-gray-200 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.1s" }}
        >
          {[
            { icon: <FileCode className="w-4 h-4" />, v: "3", k: "Ingestion sources" },
            { icon: <Sparkles className="w-4 h-4" />, v: "6", k: "Reasoning modes" },
            { icon: <Lock className="w-4 h-4" />,     v: "100%", k: "Self-hosted" },
            { icon: <Database className="w-4 h-4" />, v: "∞", k: "Indexed repos" },
          ].map(s => (
            <div key={s.k} className="bg-white px-6 py-8 text-center">
              <span className="inline-flex w-9 h-9 rounded-lg bg-gray-100 items-center justify-center text-gray-700 mb-3">
                {s.icon}
              </span>
              <div className="text-3xl font-semibold tracking-tight">{s.v}</div>
              <div className="text-xs text-gray-500 mt-1">{s.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ FAQ ═════════════════════════════════════════════════════════ */}
      <section id="faq" className="px-6 py-24 max-w-3xl mx-auto">
        <h2
          className="text-4xl md:text-5xl font-normal tracking-tight mb-3 text-center animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.1s" }}
        >
          Frequently asked
        </h2>
        <p
          className="text-lg text-gray-600 text-center mb-12 animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.2s" }}
        >
          The short answers to what usually comes up first.
        </p>

        <div className="divide-y divide-gray-200 border-y border-gray-200">
          {FAQS.map((f, i) => (
            <div
              key={f.q}
              className="animate-fade-in-up"
              style={{ opacity: 0, animationDelay: `${0.3 + i * 0.1}s` }}
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="!w-full !bg-transparent !text-black !shadow-none !rounded-none !px-0 !py-5 flex !justify-between items-center text-left hover:!bg-transparent"
              >
                <span className="text-base font-medium pr-6">{f.q}</span>
                <ChevronDown
                  className={`w-4 h-4 flex-shrink-0 text-gray-500 transition-transform duration-300 ${
                    openFaq === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className="grid transition-all duration-300 ease-out"
                style={{ gridTemplateRows: openFaq === i ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <p className="text-sm text-gray-600 leading-relaxed pb-5 pr-10">{f.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ CTA BANNER ══════════════════════════════════════════════════ */}
      <section className="px-6 pb-24 max-w-7xl mx-auto">
        <div
          className="relative overflow-hidden rounded-3xl bg-black text-white px-8 py-16 md:px-16 md:py-20 text-center animate-fade-in-up"
          style={{ opacity: 0, animationDelay: "0.1s" }}
        >
          <div className="absolute inset-0 grid-bg opacity-[0.12] pointer-events-none" />
          <div className="relative">
            <h2 className="text-4xl md:text-5xl font-normal tracking-tight mb-4">
              Ready to index your workspace?
            </h2>
            <p className="text-lg text-gray-300 mb-8 max-w-xl mx-auto">
              Point CodePilot at a folder, a Git URL, or a ZIP — and start asking
              questions in under a minute.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => router.push("/ingest")}
                className="!bg-white !text-black !px-8 !py-3 !rounded-full !text-base !font-medium hover:!bg-gray-200"
              >
                <Plus className="w-4 h-4" /> Get Started Now
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                className="!bg-transparent !text-white !border !border-white/25 !px-8 !py-3 !rounded-full !text-base !font-medium hover:!bg-white/10"
              >
                View Dashboard
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════════ */}
      <footer className="border-t border-gray-200">
        <div className="px-6 py-14 max-w-7xl mx-auto grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-black">
                <Code className="w-[18px] h-[18px] text-white" />
              </span>
              <span className="text-lg font-semibold tracking-tight">CodePilot</span>
            </div>
            <p className="text-sm text-gray-600 max-w-xs leading-relaxed">
              Autonomous code-analysis platform. Repository understanding,
              debugging and patch generation powered by LangGraph.
            </p>
          </div>

          {[
            { title: "Product", links: ["Dashboard", "Ingest", "Workspace"] },
            { title: "Capabilities", links: ["Q&A", "Debug", "Patch", "Review"] },
            { title: "Stack", links: ["FastAPI", "LangGraph", "ChromaDB", "MongoDB"] },
          ].map(col => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold mb-3">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map(l => (
                  <li key={l}>
                    <span className="text-sm text-gray-600 hover:text-black transition-colors cursor-default">
                      {l}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-6 py-6 max-w-7xl mx-auto border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            CodePilot RAG · Fully autonomous AI code-analysis platform
          </p>
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
        </div>
      </footer>
    </div>
  );
}
