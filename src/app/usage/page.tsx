"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Activity,
  Zap,
  Clock,
  TrendingUp,
  Coins,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { getChartColor, AXIS_CONFIG, BAR_RADIUS, formatCompact, RESPONSIVE_CONTAINER_PROPS } from "@/lib/chart-config";

// =============================================================================
// Types
// =============================================================================

type UsageData = {
  summary: {
    totalRequests: number;
    uniqueEndpoints: number;
    lastUsedAt: string | null;
  };
  endpoints: { endpoint: string; total: number }[];
  daily: { date: string; total: number }[];
  range: { startDate: string; endDate: string; days: number };
};

type CreditsUsageRecord = {
  date: string;
  endpoint: string;
  credits_used: number;
  request_count: number;
};

// =============================================================================
// Usage Page
// =============================================================================

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [creditsUsage, setCreditsUsage] = useState<CreditsUsageRecord[] | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usage?days=${days}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/credits/usage");
        if (res.ok) {
          const json = await res.json();
          setCreditsUsage(json.data);
        }
      } catch {
        // silently ignore — credits usage is supplementary
      } finally {
        setCreditsLoading(false);
      }
    })();
  }, []);

  const todayTotal =
    data?.daily.find((d) => d.date === new Date().toISOString().slice(0, 10))
      ?.total ?? 0;

  const avgDaily =
    data && data.daily.length > 0
      ? Math.round(
          data.daily.reduce((sum, d) => sum + d.total, 0) / data.daily.length,
        )
      : 0;

  return (
    <AppShell breadcrumbs={[{ label: "Usage" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              API Usage
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track your Twitter API consumption and trends.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-widget px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Zap className="h-4 w-4" strokeWidth={1.5} />}
            label="Total Requests"
            value={data ? formatCompact(data.summary.totalRequests) : "—"}
            loading={loading}
          />
          <StatCard
            icon={<Activity className="h-4 w-4" strokeWidth={1.5} />}
            label="Today"
            value={data ? todayTotal.toLocaleString() : "—"}
            loading={loading}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />}
            label="Avg / Day"
            value={data ? avgDaily.toLocaleString() : "—"}
            loading={loading}
          />
          <StatCard
            icon={<Clock className="h-4 w-4" strokeWidth={1.5} />}
            label="Last Used"
            value={
              data?.summary.lastUsedAt
                ? formatRelative(data.summary.lastUsedAt)
                : "Never"
            }
            loading={loading}
          />
        </div>

        {/* Charts row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Daily trend chart */}
          <ChartCard
            icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />}
            title="Daily Requests"
            height="h-[280px]"
            loading={loading}
          >
            {data && data.daily.length > 0 ? (
              <ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
                <BarChart
                  data={data.daily}
                  margin={{ top: 4, right: 4, bottom: 0, left: -16 }}
                >
                  <XAxis
                    dataKey="date"
                    {...AXIS_CONFIG}
                    tickFormatter={(v: string) => formatDateShort(v)}
                    interval={Math.max(
                      0,
                      Math.floor(data.daily.length / 8) - 1,
                    )}
                  />
                  <YAxis
                    {...AXIS_CONFIG}
                    tickFormatter={(v: number) => formatCompact(v)}
                    width={40}
                  />
                  <Tooltip content={<DailyTooltip />} />
                  <Bar
                    dataKey="total"
                    fill={getChartColor(0)}
                    radius={BAR_RADIUS.vertical}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </ChartCard>

          {/* Endpoint breakdown chart */}
          <ChartCard
            icon={<BarChart3 className="h-4 w-4" strokeWidth={1.5} />}
            title="Endpoint Breakdown"
            height="h-[280px]"
            loading={loading}
          >
            {data && data.endpoints.length > 0 ? (
              <ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
                <BarChart
                  data={data.endpoints.map((e) => ({
                    ...e,
                    short: shortenEndpoint(e.endpoint),
                  }))}
                  layout="vertical"
                  margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
                >
                  <XAxis
                    type="number"
                    {...AXIS_CONFIG}
                    tickFormatter={(v: number) => formatCompact(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="short"
                    {...AXIS_CONFIG}
                    width={140}
                    tick={{ fontSize: 11, fill: AXIS_CONFIG.tick.fill }}
                  />
                  <Tooltip content={<EndpointTooltip />} />
                  <Bar
                    dataKey="total"
                    radius={BAR_RADIUS.horizontal}
                    maxBarSize={24}
                  >
                    {data.endpoints.map((_, i) => (
                      <Cell key={i} fill={getChartColor(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </ChartCard>
        </div>

        {/* Endpoint table */}
        {data && data.endpoints.length > 0 && (
          <div className="rounded-card bg-secondary">
            <div className="flex items-center gap-2 p-4 pb-2">
              <BarChart3
                className="h-4 w-4 text-primary"
                strokeWidth={1.5}
              />
              <h3 className="text-base font-semibold">
                Endpoints ({data.summary.uniqueEndpoints})
              </h3>
            </div>
            <div className="divide-y divide-border">
              {data.endpoints.map((e, i) => (
                <div
                  key={e.endpoint}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getChartColor(i) }}
                    />
                    <code className="truncate text-sm">{e.endpoint}</code>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="secondary" className="font-display">
                      {e.total.toLocaleString()}
                    </Badge>
                    {data.summary.totalRequests > 0 && (
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {Math.round(
                          (e.total / data.summary.totalRequests) * 100,
                        )}
                        %
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TweAPI Credits Usage */}
        <CreditsUsagePanel data={creditsUsage} loading={creditsLoading} />
      </div>
    </AppShell>
  );
}

// =============================================================================
// Credits Usage Panel
// =============================================================================

function CreditsUsagePanel({
  data,
  loading,
}: {
  data: CreditsUsageRecord[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-card bg-secondary p-4">
        <div className="flex items-center gap-2 mb-4">
          <Coins className="h-4 w-4 text-primary" strokeWidth={1.5} />
          <h3 className="text-base font-semibold">TweAPI Credits Usage</h3>
        </div>
        <div className="h-32 w-full animate-pulse rounded bg-muted/50" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-card bg-secondary p-4">
        <div className="flex items-center gap-2 mb-4">
          <Coins className="h-4 w-4 text-primary" strokeWidth={1.5} />
          <h3 className="text-base font-semibold">TweAPI Credits Usage</h3>
        </div>
        <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
          No credits usage data available.
        </div>
      </div>
    );
  }

  const totalCredits = data.reduce((sum, r) => sum + r.credits_used, 0);
  const totalRequests = data.reduce((sum, r) => sum + r.request_count, 0);

  // Group by endpoint for summary
  const byEndpoint = new Map<string, { credits: number; requests: number }>();
  for (const record of data) {
    const existing = byEndpoint.get(record.endpoint) ?? { credits: 0, requests: 0 };
    existing.credits += record.credits_used;
    existing.requests += record.request_count;
    byEndpoint.set(record.endpoint, existing);
  }

  const endpointList = Array.from(byEndpoint.entries())
    .map(([endpoint, stats]) => ({ endpoint, ...stats }))
    .sort((a, b) => b.credits - a.credits);

  return (
    <div className="rounded-card bg-secondary">
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" strokeWidth={1.5} />
          <h3 className="text-base font-semibold">TweAPI Credits Usage</h3>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            <strong className="text-foreground font-display">
              {totalCredits.toLocaleString()}
            </strong>{" "}
            credits
          </span>
          <span>
            <strong className="text-foreground font-display">
              {totalRequests.toLocaleString()}
            </strong>{" "}
            requests
          </span>
        </div>
      </div>
      <div className="divide-y divide-border">
        {endpointList.map((e, i) => (
          <div
            key={e.endpoint}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: getChartColor(i) }}
              />
              <code className="truncate text-sm">{shortenEndpoint(e.endpoint)}</code>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span className="text-xs text-muted-foreground">
                {e.requests.toLocaleString()} req
              </span>
              <Badge variant="secondary" className="font-display">
                {e.credits.toLocaleString()} cr
              </Badge>
              {totalCredits > 0 && (
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {Math.round((e.credits / totalCredits) * 100)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function StatCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-card bg-secondary p-6 animate-pulse">
        <div className="h-4 w-20 rounded bg-muted mb-3" />
        <div className="h-7 w-24 rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="rounded-card bg-secondary p-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-primary">{icon}</span>
      </div>
      <div className="mt-2">
        <span className="text-2xl font-bold font-display">{value}</span>
      </div>
    </div>
  );
}

function ChartCard({
  icon,
  title,
  height,
  loading,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  height: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card bg-secondary p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-primary">{icon}</span>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <div className={`${height} w-full min-w-0`}>
        {loading ? (
          <div className="h-full w-full animate-pulse rounded bg-muted/50" />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
      No data yet. Make some API requests to see usage stats.
    </div>
  );
}

// =============================================================================
// Tooltips
// =============================================================================

function DailyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        {payload[0]!.value.toLocaleString()} requests
      </p>
    </div>
  );
}

function EndpointTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { endpoint: string; total: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0]!.payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium font-mono text-xs">{data.endpoint}</p>
      <p className="text-muted-foreground">
        {data.total.toLocaleString()} requests
      </p>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

/** Format YYYY-MM-DD to short display (e.g. "Jan 15") */
function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Shorten endpoint path for chart labels */
function shortenEndpoint(endpoint: string): string {
  return endpoint
    .replace("/api/twitter/", "")
    .replace("/v1/twitter/", "")
    .replace(":username", "{user}")
    .replace(":id", "{id}");
}

/** Format ISO date to relative time string */
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
