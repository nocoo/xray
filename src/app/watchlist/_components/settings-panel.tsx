"use client";

import { Button } from "@/components/ui/button";
import {
  Clock,
  CalendarClock,
  ChevronDown,
  UserCheck,
  Loader2,
} from "lucide-react";
import { INTERVAL_OPTIONS, RETENTION_OPTIONS } from "../_lib";

// =============================================================================
// SettingsPanel — content for the Settings slide panel
// =============================================================================

interface SettingsPanelProps {
  fetchInterval: number;
  retentionDays: number;
  onIntervalChange: (value: number) => void;
  onRetentionChange: (value: number) => void;
  onRefreshProfiles: () => void;
  refreshingProfiles: boolean;
  memberCount: number;
  /** Settings save error (auto-dismiss in parent) */
  settingsError: string | null;
}

export function SettingsPanel({
  fetchInterval,
  retentionDays,
  onIntervalChange,
  onRetentionChange,
  onRefreshProfiles,
  refreshingProfiles,
  memberCount,
  settingsError,
}: SettingsPanelProps) {
  return (
    <div className="p-4 space-y-6">
      {/* Error banner */}
      {settingsError && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {settingsError}
        </div>
      )}

      {/* Fetch Interval */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Fetch Interval
        </label>
        <p className="text-xs text-muted-foreground">
          Automatically fetch new tweets at this interval.
        </p>
        <div className="relative">
          <select
            value={fetchInterval}
            onChange={(e) => onIntervalChange(Number(e.target.value))}
            className="w-full h-9 rounded-md border bg-background pl-3 pr-8 text-sm appearance-none cursor-pointer"
          >
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      {/* Retention */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Post Retention
        </label>
        <p className="text-xs text-muted-foreground">
          Posts older than this are automatically purged.
        </p>
        <div className="relative">
          <select
            value={retentionDays}
            onChange={(e) => onRetentionChange(Number(e.target.value))}
            className="w-full h-9 rounded-md border bg-background pl-3 pr-8 text-sm appearance-none cursor-pointer"
          >
            {RETENTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>

      <hr className="border-border" />

      {/* Refresh Profiles */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Profiles</label>
        <p className="text-xs text-muted-foreground">
          Re-fetch avatars, bios, and follower counts for all members from Twitter.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onRefreshProfiles}
          disabled={refreshingProfiles || memberCount === 0}
        >
          {refreshingProfiles ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserCheck className="h-4 w-4" />
          )}
          {refreshingProfiles ? "Refreshing..." : "Refresh All Profiles"}
        </Button>
      </div>
    </div>
  );
}
