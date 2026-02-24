"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import {
  Radar,
  Activity,
  Key,
  Webhook,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";
import Link from "next/link";

// =============================================================================
// Types
// =============================================================================

type CredentialsStatus = {
  configured: boolean;
};

type WebhookItem = {
  id: number;
  keyPrefix: string;
};

type UsageSummary = {
  summary: {
    totalRequests: number;
    uniqueEndpoints: number;
    lastUsedAt: string | null;
  };
};

// =============================================================================
// Dashboard Page
// =============================================================================

export default function DashboardPage() {
  const { data: session } = useSession();
  const [creds, setCreds] = useState<CredentialsStatus | null>(null);
  const [hooks, setHooks] = useState<WebhookItem[] | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [credsRes, hooksRes, usageRes] = await Promise.all([
        fetch("/api/credentials"),
        fetch("/api/webhooks"),
        fetch("/api/usage?days=7"),
      ]);
      if (credsRes.ok) setCreds(await credsRes.json());
      if (hooksRes.ok) setHooks(await hooksRes.json());
      if (usageRes.ok) setUsage(await usageRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const userName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Welcome header */}
        <div>
          <h1 className="font-display text-2xl font-semibold">
            Hey, {userName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s an overview of your X-Ray setup.
          </p>
        </div>

        {/* Status cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            icon={<Radar className="size-5" />}
            title="System"
            value="Online"
            badge={<Badge variant="default">Active</Badge>}
            loading={loading}
          />
          <StatusCard
            icon={<Key className="size-5" />}
            title="API Credentials"
            value={creds?.configured ? "Configured" : "Not set"}
            badge={
              <Badge variant={creds?.configured ? "default" : "secondary"}>
                {creds?.configured ? "Ready" : "Setup needed"}
              </Badge>
            }
            loading={loading}
          />
          <StatusCard
            icon={<Webhook className="size-5" />}
            title="Webhook Keys"
            value={hooks ? `${hooks.length} key${hooks.length !== 1 ? "s" : ""}` : "—"}
            badge={
              <Badge variant={hooks && hooks.length > 0 ? "default" : "secondary"}>
                {hooks && hooks.length > 0 ? "Active" : "None"}
              </Badge>
            }
            loading={loading}
          />
          <Link href="/usage" className="block">
            <StatusCard
              icon={<Zap className="size-5" />}
              title="API Requests"
              value={
                usage
                  ? `${usage.summary.totalRequests.toLocaleString()} total`
                  : "—"
              }
              badge={
                <Badge
                  variant={
                    usage && usage.summary.totalRequests > 0
                      ? "default"
                      : "secondary"
                  }
                >
                  {usage && usage.summary.totalRequests > 0
                    ? `${usage.summary.uniqueEndpoints} endpoints`
                    : "No activity"}
                </Badge>
              }
              loading={loading}
            />
          </Link>
        </div>

        {/* Setup checklist */}
        <div className="rounded-card bg-secondary p-5">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">Setup Checklist</h2>
          </div>
          <div className="space-y-3">
            <ChecklistItem
              done={!!session?.user}
              label="Sign in with Google"
              loading={loading}
            />
            <ChecklistItem
              done={creds?.configured ?? false}
              label="Configure API credentials"
              href="/settings"
              loading={loading}
            />
            <ChecklistItem
              done={(hooks?.length ?? 0) > 0}
              label="Create a webhook key"
              href="/settings"
              loading={loading}
            />
            <ChecklistItem
              done={(usage?.summary.totalRequests ?? 0) > 0}
              label="Make your first API request"
              href="/usage"
              loading={loading}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// =============================================================================
// Components
// =============================================================================

function StatusCard({
  icon,
  title,
  value,
  badge,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  badge: React.ReactNode;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-card bg-secondary p-4 animate-pulse">
        <div className="h-4 w-20 rounded bg-muted mb-3" />
        <div className="h-6 w-24 rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-card bg-secondary p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-sm">{title}</span>
        </div>
        {badge}
      </div>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function ChecklistItem({
  done,
  label,
  href,
  loading,
}: {
  done: boolean;
  label: string;
  href?: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 animate-pulse">
        <div className="size-5 rounded-full bg-muted" />
        <div className="h-4 w-48 rounded bg-muted" />
      </div>
    );
  }

  const content = (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-3">
        {done ? (
          <CheckCircle2 className="size-5 text-green-500" />
        ) : (
          <XCircle className="size-5 text-muted-foreground" />
        )}
        <span
          className={
            done ? "text-sm text-muted-foreground line-through" : "text-sm"
          }
        >
          {label}
        </span>
      </div>
      {href && !done && (
        <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );

  if (href && !done) {
    return (
      <Link href={href} className="block rounded-md px-2 py-1 -mx-2 hover:bg-accent transition-colors">
        {content}
      </Link>
    );
  }

  return <div className="px-2 py-1 -mx-2">{content}</div>;
}
