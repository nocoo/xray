"use client";

import { Loader2 } from "lucide-react";
import type { PipelinePhase, TranslateProgress } from "../_lib";

// =============================================================================
// PipelineStatus — compact inline status indicator for the toolbar
//
// During translation, shows a progress bar with a cycling preview of the
// posts currently being translated (active slots from the sliding-window
// concurrency model). This gives clear visual feedback that work is happening.
// =============================================================================

interface PipelineStatusProps {
  phase: PipelinePhase;
  /** e.g. "15 new, 8 translated" */
  fetchSummary: string | null;
  translateSummary: string | null;
  translateProgress: TranslateProgress | null;
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

  if (fetching) {
    const label = totalCount > 0 ? `Fetching ${doneCount}/${totalCount}` : "Fetching...";
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
        title="Click for details"
      >
        <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
        <span className="max-w-[260px] truncate">{label}</span>
      </button>
    );
  }

  if (translating) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent min-w-0"
        title="Click for details"
      >
        <Loader2 className="h-3 w-3 animate-spin text-purple-500 shrink-0" />
        <TranslatingLabel progress={translateProgress} />
      </button>
    );
  }

  // Done
  if (done) {
    const dotColor = errorCount > 0 ? "bg-red-500" : "bg-emerald-500";
    const parts: string[] = [];
    if (fetchSummary) parts.push(fetchSummary);
    if (translateSummary) parts.push(translateSummary);
    const label = parts.join(" · ") || "Done";

    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
        title="Click for details"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${dotColor}`} />
        <span className="max-w-[260px] truncate">{label}</span>
      </button>
    );
  }

  return null;
}

// =============================================================================
// TranslatingLabel — rich progress display during translation
//
// Layout: [3/15] ████░░░░ "Post preview text being translated..."
// Shows the first active slot's preview text, cycling automatically as
// posts complete and new ones start.
// =============================================================================

function TranslatingLabel({ progress }: { progress: TranslateProgress | null }) {
  if (!progress) {
    return <span className="truncate">Translating...</span>;
  }

  const { current, total, errors, activeSlots } = progress;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  // Pick the first active slot preview to show
  const preview = activeSlots.length > 0 ? activeSlots[0]?.preview ?? null : null;

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      {/* Counter */}
      <span className="shrink-0 tabular-nums text-foreground/80">
        {current}/{total}
      </span>
      {/* Progress bar */}
      <div className="w-16 shrink-0 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-500 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Active post preview */}
      {preview && (
        <span className="truncate text-muted-foreground/70 italic min-w-0">
          {preview}
        </span>
      )}
      {/* Error count */}
      {errors > 0 && (
        <span className="shrink-0 text-red-500">{errors} err</span>
      )}
    </div>
  );
}
