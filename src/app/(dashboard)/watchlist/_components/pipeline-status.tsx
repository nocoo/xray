"use client";

import { Loader2 } from "lucide-react";
import type { PipelinePhase } from "../_lib";

// =============================================================================
// PipelineStatus — compact inline status indicator for the toolbar
// =============================================================================

interface PipelineStatusProps {
  phase: PipelinePhase;
  /** e.g. "15 new, 8 translated" */
  fetchSummary: string | null;
  translateSummary: string | null;
  translateProgress: { current: number; total: number; errors: number } | null;
  memberProgress: { status: string }[];
  /** Fetch interval in minutes (0 = disabled) */
  fetchInterval: number;
  /** Clicking opens the activity panel */
  onClick: () => void;
}

export function PipelineStatus({
  phase,
  fetchSummary,
  translateSummary,
  translateProgress,
  memberProgress,
  fetchInterval,
  onClick,
}: PipelineStatusProps) {
  // Idle — show interval hint or nothing
  if (phase === "idle") {
    if (fetchInterval > 0) {
      const label =
        fetchInterval >= 60
          ? `${fetchInterval / 60}h`
          : `${fetchInterval}m`;
      return (
        <button
          onClick={onClick}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
          title="Auto-fetch interval — click for activity log"
        >
          <span className="text-muted-foreground/60">&#x23F0;</span>
          <span>every {label}</span>
        </button>
      );
    }
    return null;
  }

  // Active states
  const fetching = phase === "fetching";
  const translating = phase === "translating";
  const done = phase === "done";

  // Count fetching progress
  const doneCount = memberProgress.filter((m) => m.status === "done").length;
  const totalCount = memberProgress.length;
  const errorCount = memberProgress.filter((m) => m.status === "error").length;

  let dotColor = "bg-blue-500";
  let label = "";

  if (fetching) {
    dotColor = "bg-blue-500";
    label = totalCount > 0 ? `Fetching ${doneCount}/${totalCount}` : "Fetching...";
  } else if (translating) {
    dotColor = "bg-purple-500";
    label = translateProgress
      ? `Translating ${translateProgress.current}/${translateProgress.total}`
      : "Translating...";
  } else if (done) {
    dotColor = errorCount > 0 ? "bg-red-500" : "bg-emerald-500";
    const parts: string[] = [];
    if (fetchSummary) parts.push(fetchSummary);
    if (translateSummary) parts.push(translateSummary);
    label = parts.join(" · ") || "Done";
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
      title="Click for details"
    >
      {done ? (
        <span
          className={`inline-block h-2 w-2 rounded-full ${dotColor}`}
        />
      ) : (
        <Loader2 className={`h-3 w-3 animate-spin ${fetching ? "text-blue-500" : "text-purple-500"}`} />
      )}
      <span className="max-w-[260px] truncate">{label}</span>
    </button>
  );
}
