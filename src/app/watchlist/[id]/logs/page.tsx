"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout";
import { LoadingSpinner, ErrorBanner, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import {
  ScrollText,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Logs Page — /watchlist/[id]/logs
// =============================================================================

export default function WatchlistLogsPage() {
  const params = useParams<{ id: string }>();
  const watchlistId = Number(params.id);

  const [logs, setLogs] = useState<FetchLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/watchlists/${watchlistId}/logs?limit=100`);
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setLogs(json.data ?? []);
      } else {
        setError(json?.error ?? "Failed to load logs");
      }
    } catch {
      setError("Network error — could not reach API");
    } finally {
      setLoading(false);
    }
  }, [watchlistId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Watchlists", href: "/watchlist" },
        { label: `#${watchlistId}`, href: `/watchlist/${watchlistId}` },
        { label: "Logs" },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Fetch & Translate Logs
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              History of all fetch and translate runs with error details.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/watchlist/${watchlistId}`}>
                <ArrowLeft className="h-4 w-4" />
                Watchlist
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={loadLogs}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {loading && <LoadingSpinner />}
        {error && <ErrorBanner error={error} />}

        {!loading && !error && logs.length === 0 && (
          <EmptyState
            icon={ScrollText}
            title="No logs yet."
            subtitle="Logs will appear here after you run Fetch or Translate."
          />
        )}

        {!loading && !error && logs.length > 0 && (
          <div className="space-y-2">
            {logs.map((log) => (
              <LogEntry key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// =============================================================================
// LogEntry — single log row with expandable error details
// =============================================================================

function LogEntry({ log }: { log: FetchLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasErrors = log.errorCount > 0;

  const time = new Date(log.createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="rounded-card bg-card border">
      <button
        onClick={() => hasErrors && setExpanded(!expanded)}
        className={`w-full p-4 text-left ${hasErrors ? "cursor-pointer hover:bg-secondary/50 transition-colors" : "cursor-default"}`}
      >
        <div className="flex items-center gap-3">
          {/* Status icon */}
          {hasErrors ? (
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          )}

          {/* Type badge */}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              log.type === "fetch"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
            }`}
          >
            {log.type === "fetch" ? "Fetch" : "Translate"}
          </span>

          {/* Stats */}
          <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {log.type === "fetch" ? (
              <>
                <span>
                  <strong className="text-foreground">{log.succeeded}</strong>{" "}
                  new from {log.attempted} users
                </span>
                {log.skipped > 0 && <span>{log.skipped} skipped</span>}
                {log.purged > 0 && <span>{log.purged} purged</span>}
              </>
            ) : (
              <span>
                <strong className="text-foreground">{log.succeeded}</strong>{" "}
                translated of {log.attempted}
              </span>
            )}
            {hasErrors && (
              <span className="text-destructive font-medium">
                {log.errorCount} error{log.errorCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Time */}
          <span className="text-xs text-muted-foreground shrink-0">
            {time}
          </span>

          {/* Expand indicator */}
          {hasErrors && (
            <span className="shrink-0 text-muted-foreground">
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          )}
        </div>
      </button>

      {/* Error details panel */}
      {expanded && hasErrors && (
        <div className="border-t px-4 py-3 bg-destructive/5">
          <p className="text-xs font-medium text-destructive mb-2">
            Error Details
          </p>
          <ul className="space-y-1">
            {log.errors.map((err, i) => (
              <li
                key={i}
                className="text-xs text-muted-foreground font-mono break-all"
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
