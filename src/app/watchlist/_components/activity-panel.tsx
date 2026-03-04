"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Languages,
  ScrollText,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MemberProgress, TranslateProgress, PipelinePhase } from "../_lib";

// =============================================================================
// ActivityPanel — content for the Activity slide panel
// Shows live pipeline progress (top) + historical logs (bottom)
// =============================================================================

interface ActivityPanelProps {
  watchlistId: number;
  // Live progress
  pipelinePhase: PipelinePhase;
  memberProgress: MemberProgress[];
  cleanupInfo: { purgedExpired: number; purgedOrphans: number } | null;
  fetchSummary: string | null;
  translateProgress: TranslateProgress | null;
  translateSummary: string | null;
}

// ─── Log types (mirrored from logs page) ────────────────────────────────────

interface FetchLogEntry {
  id: number;
  type: "fetch" | "translate";
  attempted: number;
  succeeded: number;
  skipped: number;
  purged: number;
  errorCount: number;
  errors: string[];
  createdAt: string;
}

export function ActivityPanel({
  watchlistId,
  pipelinePhase,
  memberProgress,
  cleanupInfo,
  fetchSummary,
  translateProgress,
  translateSummary,
}: ActivityPanelProps) {
  // ─── Logs state ──────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<FetchLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await fetch(`/api/watchlists/${watchlistId}/logs?limit=50`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setLogs(json.data ?? []);
      } else {
        setLogsError(json?.error ?? "Failed to load logs");
      }
    } catch {
      setLogsError("Network error");
    } finally {
      setLogsLoading(false);
    }
  }, [watchlistId]);

  // Load logs on mount and whenever pipeline completes
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Refresh logs when pipeline transitions to done
  useEffect(() => {
    if (pipelinePhase === "done") {
      // Small delay to let the server write the log entry
      const t = setTimeout(loadLogs, 1000);
      return () => clearTimeout(t);
    }
  }, [pipelinePhase, loadLogs]);

  const showLiveProgress = pipelinePhase !== "idle";

  return (
    <div className="flex flex-col h-full">
      {/* ─── Live progress section ─── */}
      {showLiveProgress && (
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {pipelinePhase === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            )}
            <span>
              {pipelinePhase === "fetching" && "Fetching tweets..."}
              {pipelinePhase === "translating" && "Translating..."}
              {pipelinePhase === "done" && "Pipeline complete"}
            </span>
          </div>

          {/* Fetch summary */}
          {fetchSummary && pipelinePhase !== "fetching" && (
            <p className="text-xs text-muted-foreground">{fetchSummary}</p>
          )}

          {/* Cleanup info */}
          {cleanupInfo &&
            (cleanupInfo.purgedExpired > 0 || cleanupInfo.purgedOrphans > 0) && (
              <p className="text-xs text-muted-foreground">
                Cleanup:{" "}
                {cleanupInfo.purgedExpired > 0 &&
                  `${cleanupInfo.purgedExpired} expired`}
                {cleanupInfo.purgedExpired > 0 &&
                  cleanupInfo.purgedOrphans > 0 &&
                  ", "}
                {cleanupInfo.purgedOrphans > 0 &&
                  `${cleanupInfo.purgedOrphans} orphaned`}
              </p>
            )}

          {/* Per-member progress */}
          {memberProgress.length > 0 && (
            <div className="space-y-1">
              {memberProgress.map((mp, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right text-muted-foreground">
                    {idx + 1}.
                  </span>
                  {mp.status === "pending" && (
                    <span className="text-muted-foreground/50">
                      @{mp.username}
                    </span>
                  )}
                  {mp.status === "fetching" && (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                      <span className="text-blue-600 dark:text-blue-400">
                        @{mp.username}
                      </span>
                      <span className="text-muted-foreground">
                        requesting...
                      </span>
                    </>
                  )}
                  {mp.status === "done" && (
                    <>
                      <span className="text-green-600 dark:text-green-400">
                        @{mp.username}
                      </span>
                      <span className="text-muted-foreground">
                        {mp.tweetsReceived} received
                        {(mp.filtered ?? 0) > 0 && `, ${mp.filtered} filtered`}
                        , {mp.newPosts} new
                      </span>
                    </>
                  )}
                  {mp.status === "error" && (
                    <>
                      <span className="text-red-600 dark:text-red-400">
                        @{mp.username}
                      </span>
                      <span className="text-red-500 truncate">{mp.error}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Translation progress */}
          {(pipelinePhase === "translating" ||
            (pipelinePhase === "done" && translateSummary)) && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Languages className="h-3 w-3" />
                <span className="font-medium">Translation</span>
                {pipelinePhase === "translating" && translateProgress && (
                  <>
                    <span>
                      {translateProgress.current}/{translateProgress.total}
                    </span>
                    {translateProgress.errors > 0 && (
                      <span className="text-red-500">
                        {translateProgress.errors} errors
                      </span>
                    )}
                  </>
                )}
                {pipelinePhase === "done" && translateSummary && (
                  <span>{translateSummary}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── History section ─── */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            History
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={loadLogs}
            disabled={logsLoading}
            title="Refresh logs"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${logsLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {logsError && (
          <div className="px-4 py-2 text-xs text-red-500">{logsError}</div>
        )}

        {!logsLoading && !logsError && logs.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No logs yet. Logs appear after you run Fetch or Translate.
          </div>
        )}

        {logs.length > 0 && (
          <div className="divide-y">
            {logs.map((log) => (
              <LogEntry key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// LogEntry — compact log row with expandable error details
// =============================================================================

function LogEntry({ log }: { log: FetchLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasErrors = log.errorCount > 0;

  const time = new Date(log.createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div>
      <button
        onClick={() => hasErrors && setExpanded(!expanded)}
        className={`w-full px-4 py-2.5 text-left ${
          hasErrors
            ? "cursor-pointer hover:bg-accent/50 transition-colors"
            : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Status icon */}
          {hasErrors ? (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          )}

          {/* Type badge */}
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              log.type === "fetch"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
            }`}
          >
            {log.type === "fetch" ? "Fetch" : "Trans"}
          </span>

          {/* Stats */}
          <div className="flex-1 text-xs text-muted-foreground truncate">
            {log.type === "fetch" ? (
              <>
                <strong className="text-foreground">{log.succeeded}</strong> new
                from {log.attempted}
                {log.skipped > 0 && ` · ${log.skipped} skip`}
                {log.purged > 0 && ` · ${log.purged} purge`}
              </>
            ) : (
              <>
                <strong className="text-foreground">{log.succeeded}</strong>/
                {log.attempted} translated
              </>
            )}
            {hasErrors && (
              <span className="text-destructive ml-1">
                · {log.errorCount}err
              </span>
            )}
          </div>

          {/* Time */}
          <span className="text-[10px] text-muted-foreground shrink-0">
            {time}
          </span>

          {/* Expand indicator */}
          {hasErrors && (
            <span className="shrink-0 text-muted-foreground">
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </button>

      {/* Error details */}
      {expanded && hasErrors && (
        <div className="px-4 py-2 bg-destructive/5 border-t">
          <ul className="space-y-0.5">
            {log.errors.map((err, i) => (
              <li
                key={i}
                className="text-[10px] text-muted-foreground font-mono break-all"
              >
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
