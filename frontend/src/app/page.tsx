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
  CheckCircle,
  AlertCircle,
  HelpCircle,
  FileCode,
} from "lucide-react";

const THEMES = [
  { id: "nebula",  label: "Nebula",  color: "#9333ea" },
  { id: "aurora",  label: "Aurora",  color: "#10b981" },
  { id: "sunset",  label: "Sunset",  color: "#f97316" },
  { id: "ocean",   label: "Ocean",   color: "#3b82f6" },
];

export default function LandingPage() {
  const router = useRouter();
  const [theme, setTheme] = useState("nebula");

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

  return (
    <div style={s.page}>
      {/* Dynamic background lighting */}
      <div style={s.orb1} />
      <div style={s.orb2} />
      <div style={s.orb3} />

      {/* Header */}
      <header style={s.header}>
        <div style={s.logoWrap}>
          <div style={s.logoIcon}>
            <Code size={22} color="#fff" />
          </div>
          <span style={s.logoText}>CodePilot RAG</span>
          <span style={s.logoBadge}>BETA</span>
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
        </nav>
      </header>

      {/* Hero section */}
      <section style={s.hero} className="fade-in-up">
        <div style={s.heroBadge}>
          <Sparkles size={12} />
          Autonomous Code Intelligence Platform
        </div>
        <h1 style={s.heroTitle}>
          Supercharge Your
          <span style={s.heroGradient}> Codebase Intelligence</span>
        </h1>
        <p style={s.heroSub}>
          Analyze, debug, and patch your software workspace in seconds. CodePilot indices your directories semantically to generate unified git diffs, architectural breakdowns, and security diagnostics.
        </p>

        {/* Call to Actions (CTAs) */}
        <div style={s.ctaContainer}>
          <button
            onClick={() => router.push("/dashboard")}
            style={s.primaryCta}
            className="pulse-border"
          >
            <LayoutDashboard size={16} /> Enter Dashboard <ArrowRight size={16} />
          </button>
          <button
            onClick={() => router.push("/ingest")}
            style={s.secondaryCta}
            className="secondary"
          >
            <Plus size={16} /> Ingest Codebase
          </button>
        </div>
      </section>

      {/* Features Grid & Interactive Previews */}
      <section style={s.gridSection} className="fade-in-up">
        <div style={s.featuresTitleBox}>
          <h2 style={s.sectionHeader}>Advanced Ingestion & Analysis Features</h2>
          <p style={s.sectionSubtitle}>Designed to understand your local source modules and generate context-aware solutions.</p>
        </div>

        <div style={s.featureGrid}>
          {/* Feature 1 */}
          <div className="glass-card" style={s.showcaseCard}>
            <div style={s.iconWrap}>
              <Zap size={20} color="var(--primary)" />
            </div>
            <h3 style={s.cardTitle}>Local Folder Packaging</h3>
            <p style={s.cardDesc}>
              Point CodePilot to any absolute folder path on your local drive. The system packs, filters out ignore lists, and vector-indexes files instantly.
            </p>
            <div style={s.previewContainer}>
              <div style={s.mockPathBox}>
                <span style={s.mockPathLabel}>Directory:</span>
                <code style={s.mockPathText}>C:\Users\Admin\Desktop\payment-gateway</code>
              </div>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="glass-card" style={s.showcaseCard}>
            <div style={s.iconWrap}>
              <GitPullRequest size={20} color="var(--secondary)" />
            </div>
            <h3 style={s.cardTitle}>Autonomous Patch Generator</h3>
            <p style={s.cardDesc}>
              Ask CodePilot to add features or fix bugs. The agent plans, checks dependencies, and outputs standard unified git diffs you can apply with one click.
            </p>
            <div style={s.previewContainer}>
              <pre style={s.mockDiffPre}>
                <code>{`--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -12,4 +12,6 @@\n-  return session !== null;\n+  if (!session) return false;\n+  return session.expiresAt > Date.now();`}</code>
              </pre>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="glass-card" style={s.showcaseCard}>
            <div style={s.iconWrap}>
              <Shield size={20} color="var(--accent)" />
            </div>
            <h3 style={s.cardTitle}>Mode-Specific Diagnostics</h3>
            <p style={s.cardDesc}>
              Includes specialized processing engines for Questions, Debugging, Code Quality Reviews (with severity indicators), and Architectural Flows.
            </p>
            <div style={s.previewContainer}>
              <table style={s.mockTable}>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Semantic Alignment</td>
                    <td><span style={{ color: "var(--success)" }}>🟢 Verified</span></td>
                  </tr>
                  <tr>
                    <td>Security Risks</td>
                    <td><span style={{ color: "var(--warning)" }}>🟡 1 Alert</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom section CTA */}
      <section style={s.banner} className="glass fade-in-up">
        <div style={s.bannerLeft}>
          <h3 style={s.bannerTitle}>Ready to index your workspace?</h3>
          <p style={s.bannerSub}>Start indexing files locally or from remote Git branches for instant answers.</p>
        </div>
        <button onClick={() => router.push("/ingest")} style={s.bannerBtn}>
          <Plus size={16} /> Get Started Now
        </button>
      </section>

      {/* Footer */}
      <footer style={s.footer}>
        <p style={{ color: "var(--text-muted)", fontSize: 12 }}>
          CodePilot RAG · Fully Autonomous AI Code-Analysis Platform · Built with ❤️
        </p>
      </footer>
    </div>
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
    overflowX: "hidden",
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
  orb3: {
    position: "fixed", top: "50%", left: "50%",
    width: 300, height: 300,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)",
    pointerEvents: "none", zIndex: -1,
    transform: "translate(-50%, -50%)",
    filter: "blur(40px)",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "24px 0",
    borderBottom: "1px solid var(--border-glass)",
    marginBottom: 0,
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
  logoBadge: {
    fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
    background: "var(--primary-glow)", border: "1px solid var(--border-active)",
    color: "var(--primary-light)", padding: "2px 7px", borderRadius: 20,
  },
  nav: { display: "flex", alignItems: "center", gap: 12 },
  hero: {
    textAlign: "center", padding: "80px 20px 60px",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
  },
  heroBadge: {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
    background: "var(--primary-glow)",
    border: "1px solid var(--border-active)",
    color: "var(--primary-light)",
    padding: "6px 14px", borderRadius: 20,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: "clamp(32px, 5vw, 54px)", fontWeight: 800,
    lineHeight: 1.1, letterSpacing: "-0.03em",
    color: "var(--text-primary)",
  },
  heroGradient: {
    background: "var(--grad-hero)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
  },
  heroSub: {
    fontSize: 16, color: "var(--text-secondary)", maxWidth: 680, lineHeight: 1.6,
  },
  ctaContainer: {
    display: "flex",
    gap: 16,
    marginTop: 12,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  primaryCta: {
    padding: "14px 28px",
    fontSize: 15,
    fontWeight: 600,
    gap: 8,
  },
  secondaryCta: {
    padding: "14px 28px",
    fontSize: 15,
    fontWeight: 600,
    gap: 8,
  },
  gridSection: {
    width: "100%",
    marginBottom: 50,
    display: "flex",
    flexDirection: "column",
    gap: 32,
  },
  featuresTitleBox: {
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  sectionHeader: {
    fontSize: 24,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "var(--text-muted)",
  },
  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 24,
  },
  showcaseCard: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "var(--bg-glass)",
    padding: "28px",
  },
  iconWrap: {
    width: 42, height: 42,
    borderRadius: 10,
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid var(--border-glass)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  cardDesc: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  },
  previewContainer: {
    marginTop: 8,
    background: "rgba(0, 0, 0, 0.25)",
    border: "1px solid var(--border-glass)",
    borderRadius: 8,
    padding: "12px",
    overflow: "hidden",
    minHeight: 80,
    display: "flex",
    alignItems: "center",
  },
  mockPathBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    width: "100%",
    overflow: "hidden",
  },
  mockPathLabel: {
    color: "var(--text-muted)",
    fontWeight: 600,
  },
  mockPathText: {
    color: "var(--secondary)",
    fontFamily: "var(--font-mono)",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    overflow: "hidden",
    flex: 1,
  },
  mockDiffPre: {
    margin: 0,
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    lineHeight: 1.4,
    color: "var(--text-code)",
    width: "100%",
  },
  mockTable: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  },
  banner: {
    borderRadius: 16,
    padding: "32px 40px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 24,
    flexWrap: "wrap",
    marginBottom: 50,
  },
  bannerLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "var(--text-primary)",
  },
  bannerSub: {
    fontSize: 13,
    color: "var(--text-secondary)",
  },
  bannerBtn: {
    padding: "12px 24px",
    fontWeight: 600,
  },
  footer: {
    textAlign: "center",
    paddingTop: 24,
    borderTop: "1px solid var(--border-glass)",
  },
};

