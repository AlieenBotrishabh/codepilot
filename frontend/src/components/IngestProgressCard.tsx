"use client";

import { useEffect, useState } from "react";
import {
  Check, Loader2, AlertCircle, Download, Filter, Scissors,
  Sparkles, Database, PartyPopper,
} from "lucide-react";

/**
 * Animated progress card for an ingestion job.
 *
 * The backend reports a single 0..1 float, not a stage name, so the stage is
 * derived from that number. The thresholds are presentation only — they make a
 * bare percentage legible as "what is happening right now" without requiring
 * the API to change.
 */

export interface IngestStage {
  key: string;
  label: string;
  detail: string;
  icon: React.ReactNode;
  /** Progress at which this stage is considered started. */
  at: number;
}

export const INGEST_STAGES: IngestStage[] = [
  { key: "fetch",   at: 0.00, label: "Fetching source",    detail: "Cloning, extracting or reading the archive", icon: <Download className="w-4 h-4" /> },
  { key: "filter",  at: 0.25, label: "Filtering files",    detail: "Dropping build output, lockfiles and binaries", icon: <Filter className="w-4 h-4" /> },
  { key: "chunk",   at: 0.45, label: "Chunking",           detail: "Splitting with overlap so context survives", icon: <Scissors className="w-4 h-4" /> },
  { key: "embed",   at: 0.60, label: "Embedding",          detail: "Batching through the embedding model", icon: <Sparkles className="w-4 h-4" /> },
  { key: "persist", at: 0.90, label: "Persisting vectors", detail: "Writing the collection to the vector store", icon: <Database className="w-4 h-4" /> },
];

type Status = "running" | "done" | "failed";

interface Props {
  progress: number;          // 0..100
  message: string;
  status?: Status;
  error?: string;
  repoName?: string;
}

export default function IngestProgressCard({
  progress, message, status = "running", error, repoName,
}: Props) {
  const pct = Math.max(0, Math.min(100, progress));
  const frac = pct / 100;

  // Elapsed timer — a long ingest with a stalled percentage still feels alive
  // if the user can see time accruing.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (status !== "running") return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const activeIndex = status === "done"
    ? INGEST_STAGES.length
    : INGEST_STAGES.reduce((acc, s, i) => (frac >= s.at ? i : acc), 0);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div
      className={`rounded-2xl border bg-white p-6 animate-scale-in ${
        status === "failed"
          ? "border-red-200"
          : status === "done"
          ? "border-emerald-200"
          : "border-gray-200 card-sweep"
      }`}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-4 mb-6">
        <span
          className={`relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
            status === "failed"
              ? "bg-red-100 text-red-600"
              : status === "done"
              ? "bg-emerald-100 text-emerald-600"
              : "bg-gray-900 text-white"
          }`}
        >
          {status === "failed" ? (
            <AlertCircle className="w-5 h-5" />
          ) : status === "done" ? (
            <PartyPopper className="w-5 h-5 animate-check-pop" />
          ) : (
            <Loader2 className="w-5 h-5 spin" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold tracking-tight">
            {status === "failed"
              ? "Ingestion failed"
              : status === "done"
              ? "Indexed and ready"
              : "Indexing your codebase"}
          </h3>
          <p className="text-sm text-gray-600 truncate">
            {status === "failed" ? (error || "Something went wrong.") : message}
          </p>
          {repoName && (
            <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{repoName}</p>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {Math.round(pct)}<span className="text-base text-gray-400">%</span>
          </div>
          {status === "running" && (
            <div className="text-[11px] text-gray-400 tabular-nums">{mm}:{ss}</div>
          )}
        </div>
      </div>

      {/* ── Progress bar ───────────────────────────────────────── */}
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-7">
        <div
          className={`h-full rounded-full ${
            status === "failed"
              ? "bg-red-500"
              : status === "done"
              ? "bg-emerald-500"
              : "bg-gray-900 progress-striped"
          }`}
          style={{ width: `${pct}%`, transition: "width 0.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </div>

      {/* ── Stage list ─────────────────────────────────────────── */}
      <ol className="space-y-1">
        {INGEST_STAGES.map((stage, i) => {
          const done = status === "done" || i < activeIndex;
          const active = status === "running" && i === activeIndex;
          const failedHere = status === "failed" && i === activeIndex;

          return (
            <li
              key={stage.key}
              className={`flex items-start gap-3.5 rounded-xl px-3 py-2.5 transition-colors ${
                active ? "bg-gray-50" : failedHere ? "bg-red-50" : ""
              }`}
            >
              {/* marker + connector */}
              <div className="flex flex-col items-center flex-shrink-0">
                <span
                  className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 ${
                    failedHere
                      ? "bg-red-500 text-white"
                      : done
                      ? "bg-emerald-500 text-white"
                      : active
                      ? "bg-gray-900 text-white stage-ring"
                      : "bg-white border border-gray-200 text-gray-300"
                  }`}
                >
                  {failedHere ? (
                    <AlertCircle className="w-3.5 h-3.5" />
                  ) : done ? (
                    <Check className="w-3.5 h-3.5 animate-check-pop" />
                  ) : active ? (
                    <Loader2 className="w-3.5 h-3.5 spin" />
                  ) : (
                    stage.icon
                  )}
                </span>
                {i < INGEST_STAGES.length - 1 && (
                  <span
                    className={`w-px flex-1 min-h-[14px] mt-1 transition-colors duration-500 ${
                      done ? "bg-emerald-300" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <span
                  className={`block text-sm font-medium transition-colors ${
                    done ? "text-gray-500" : active || failedHere ? "text-black" : "text-gray-400"
                  }`}
                >
                  {stage.label}
                </span>
                <span
                  className={`block text-xs leading-relaxed ${
                    active ? "text-gray-600" : "text-gray-400"
                  }`}
                >
                  {stage.detail}
                </span>
              </div>

              {active && (
                <span className="text-[10px] uppercase tracking-wider text-gray-400 animate-pulse-soft flex-shrink-0 mt-1">
                  working
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
