"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Copy, Check, Code2, Maximize2, X } from "lucide-react";

/**
 * Renders a Mermaid diagram from model-generated source.
 *
 * Why this exists: asking the agent to "draw the project structure" produces a
 * Mermaid graph, which the markdown renderer previously showed as a code block.
 * The model can describe real structure in text — grounded in actual file and
 * function names — so rendering it turns an accurate description into an
 * accurate picture. An image model cannot do this; it would invent boxes.
 *
 * Mermaid is imported dynamically so its ~500KB never lands in the initial
 * bundle for users who only ever read prose answers.
 */
export default function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const idRef = useRef(`mmd-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          // `securityLevel: strict` sandboxes labels and strips scripts — the
          // source here is model-generated, so it is untrusted input.
          securityLevel: "strict",
          theme: "base",
          fontFamily: "Inter, sans-serif",
          themeVariables: {
            primaryColor: "#f9fafb",
            primaryTextColor: "#09090b",
            primaryBorderColor: "#d1d5db",
            lineColor: "#9ca3af",
            secondaryColor: "#f5f3ff",
            tertiaryColor: "#ffffff",
            fontSize: "13px",
          },
        });

        const { svg: rendered } = await mermaid.render(idRef.current, chart.trim());
        if (!cancelled) { setSvg(rendered); setError(""); }
      } catch (err: any) {
        if (!cancelled) {
          // A malformed diagram must not blank the answer it was part of, so
          // the failure degrades to the source plus a short reason.
          setError(String(err?.message || err).split("\n")[0].slice(0, 160));
          setShowSource(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [chart]);

  const copy = async () => {
    await navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="my-4 rounded-xl border border-gray-200 bg-white overflow-hidden animate-scale-in">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
          <Code2 className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-500 flex-1">
            Diagram
          </span>
          <button
            onClick={() => setShowSource(v => !v)}
            className="ghost !px-2 !py-1 !text-[11px]"
            title="Toggle Mermaid source"
          >
            {showSource ? "Diagram" : "Source"}
          </button>
          {svg && !showSource && (
            <button
              onClick={() => setZoomed(true)}
              className="ghost !px-2 !py-1"
              title="Expand"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={copy} className="ghost !px-2 !py-1" title="Copy source">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Could not render this diagram: {error}</span>
          </div>
        )}

        {showSource ? (
          <pre className="p-4 text-xs font-mono leading-relaxed overflow-x-auto bg-[#0b0b0f] text-gray-200">
            {chart.trim()}
          </pre>
        ) : svg ? (
          <div
            className="p-4 overflow-x-auto flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="p-4">
            <div className="skeleton h-32 w-full" />
          </div>
        )}
      </div>

      {/* Full-screen view — diagrams of a real repository get wide fast. */}
      {zoomed && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 animate-fade-in-overlay flex items-center justify-center p-6"
          onClick={() => setZoomed(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-[95vw] max-h-[92vh] overflow-auto p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setZoomed(false)}
              className="ghost absolute top-3 right-3 z-10"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <div
              className="[&_svg]:max-w-none"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </>
  );
}
