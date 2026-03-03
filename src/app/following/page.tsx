"use client";

import { useState, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { UserCardCompact } from "@/components/twitter/user-card";
import {
  LoadingSpinner,
  ErrorBanner,
  EmptyState,
} from "@/components/ui/feedback";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { UserPlus, Search, Upload } from "lucide-react";

import type { UserInfo } from "../../../shared/types";

// =============================================================================
// Following Page — look up who a given Twitter user follows + import lists
// =============================================================================

export default function FollowingPage() {
  // --- Look-up state ---
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState<UserInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // --- Import dialog state ---
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Look up following list for a single user
  // ---------------------------------------------------------------------------
  const handleSearch = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = username.trim().replace(/^@/, "");
      if (!trimmed) return;

      setLoading(true);
      setError(null);
      setSearched(true);

      try {
        const res = await fetch(
          `/api/explore/users/following?username=${encodeURIComponent(trimmed)}`,
        );
        const json = await res.json().catch(() => null);

        if (!res.ok || !json?.success) {
          setError(json?.error ?? "Failed to load following list");
          setUsers(null);
        } else {
          setUsers(json.data ?? []);
        }
      } catch {
        setError("Network error — could not reach API");
        setUsers(null);
      } finally {
        setLoading(false);
      }
    },
    [username],
  );

  // ---------------------------------------------------------------------------
  // Parse textarea → deduplicated usernames
  // ---------------------------------------------------------------------------
  function parseUsernames(text: string): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const raw of text.split(/\n/)) {
      const cleaned = raw.trim().replace(/^@/, "");
      if (cleaned && !seen.has(cleaned.toLowerCase())) {
        seen.add(cleaned.toLowerCase());
        result.push(cleaned);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Import: resolve a list of usernames via batch API
  // ---------------------------------------------------------------------------
  const handleImport = useCallback(async () => {
    const usernames = parseUsernames(importText);

    if (usernames.length === 0) {
      setImportError("No valid usernames found. Enter one username per line.");
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportProgress(`Resolving ${usernames.length} username${usernames.length !== 1 ? "s" : ""}...`);

    try {
      const res = await fetch("/api/explore/users/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setImportError(json?.error ?? "Failed to resolve usernames");
        return;
      }

      const { resolved, failed } = json.data as {
        resolved: UserInfo[];
        failed: string[];
      };

      if (resolved.length === 0) {
        setImportError(
          `None of the ${usernames.length} username${usernames.length !== 1 ? "s" : ""} could be resolved.`,
        );
        return;
      }

      // Merge into existing list, dedup by user id
      setUsers((prev) => {
        const existing = prev ?? [];
        const existingIds = new Set(existing.map((u) => u.id));
        const newUsers = resolved.filter((u) => !existingIds.has(u.id));
        return [...existing, ...newUsers];
      });
      setSearched(true);
      setError(null);

      // Close dialog and reset
      setImportOpen(false);
      setImportText("");

      // Show inline notice if some failed
      if (failed.length > 0) {
        setError(
          `Imported ${resolved.length} user${resolved.length !== 1 ? "s" : ""}. ` +
            `Could not resolve: ${failed.join(", ")}`,
        );
      }
    } catch {
      setImportError("Network error — could not reach API");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }, [importText]);

  const parsedCount = parseUsernames(importText).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <AppShell breadcrumbs={[{ label: "Following" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Following</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a Twitter/X username to see who they follow, or import a list
            of usernames.
          </p>
        </div>

        {/* Search form + Import button */}
        <div className="flex gap-2">
          <form onSubmit={handleSearch} className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username (e.g. elonmusk)"
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Search className="h-4 w-4" />
              Look up
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setImportError(null);
              setImportOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Upload className="h-4 w-4" />
            Import
          </button>
        </div>

        {/* Results */}
        {loading && <LoadingSpinner />}
        {error && <ErrorBanner error={error} />}

        {!loading && !error && users && users.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {users.length} user{users.length !== 1 ? "s" : ""}
            </div>
            {users.map((user) => (
              <UserCardCompact key={user.id} user={user} />
            ))}
          </div>
        )}

        {!loading && !error && searched && users && users.length === 0 && (
          <EmptyState
            icon={UserPlus}
            title="No following found."
            subtitle="This user may not be following anyone, or the username may be incorrect."
          />
        )}
      </div>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import usernames</DialogTitle>
            <DialogDescription>
              Paste a list of Twitter/X usernames, one per line. The @ symbol is
              optional and will be stripped automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportError(null);
              }}
              placeholder={"elonmusk\n@karpathy\nvaboredition\nnatfriedman"}
              rows={10}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              disabled={importing}
            />

            {parsedCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {parsedCount} unique username{parsedCount !== 1 ? "s" : ""}{" "}
                detected
              </p>
            )}

            {importError && <ErrorBanner error={importError} />}
            {importProgress && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoadingSpinner className="" size="sm" />
                {importProgress}
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              disabled={importing}
              className="inline-flex items-center rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing || parsedCount === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Upload className="h-4 w-4" />
              {importing
                ? "Importing..."
                : `Import ${parsedCount} user${parsedCount !== 1 ? "s" : ""}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
