import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// =============================================================================
// LoadingSpinner — centered spinner for loading states
// =============================================================================

export function LoadingSpinner({
  className = "py-12",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-6 w-6";
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Loader2 className={`${sizeClass} animate-spin text-muted-foreground`} />
    </div>
  );
}

// =============================================================================
// ErrorBanner — destructive error message bar
// =============================================================================

export function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="rounded-card bg-destructive/10 p-4 text-sm text-destructive">
      {error}
    </div>
  );
}

// =============================================================================
// StatusMessage — success or error inline message (from settings page)
// =============================================================================

export function StatusMessage({
  type,
  text,
}: {
  type: "success" | "error";
  text: string;
}) {
  return (
    <div
      className={`rounded-card px-3 py-2 text-sm ${
        type === "success"
          ? "border border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
          : "border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      }`}
    >
      {text}
    </div>
  );
}

// =============================================================================
// EmptyState — placeholder for when there are no results
// =============================================================================

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-card bg-secondary p-12 text-center">
      <Icon className="mx-auto h-10 w-10 text-muted-foreground/40 mb-4" />
      <p className="text-muted-foreground">{title}</p>
      {subtitle && (
        <p className="mt-1 text-xs text-muted-foreground/70">{subtitle}</p>
      )}
    </div>
  );
}

// =============================================================================
// SectionSkeleton — loading placeholder for settings sections
// =============================================================================

export function SectionSkeleton({ title }: { title: string }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-24 rounded-card bg-muted" />
      </div>
    </section>
  );
}
