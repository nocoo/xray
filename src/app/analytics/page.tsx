"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Eye,
  Heart,
  MessageCircle,
  Repeat2,
  UserPlus,
  Bookmark,
  Share2,
  UserMinus,
  Users,
  UserCheck,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  AXIS_CONFIG,
  formatCompact,
  RESPONSIVE_CONTAINER_PROPS,
} from "@/lib/chart-config";
import { chart, withAlpha, chartMuted } from "@/lib/palette";

// =============================================================================
// Types
// =============================================================================

type DailyMetrics = {
  date: string;
  impressions: number;
  engagements: number;
  profile_visits: number;
  follows: number;
  likes: number;
  replies: number;
  retweets: number;
  bookmarks: number;
};

type AnalyticsData = {
  impressions: number;
  engagements: number;
  engagement_rate: number;
  likes: number;
  retweets: number;
  replies: number;
  profile_visits: number;
  followers: number;
  following: number;
  verified_followers?: number;
  bookmarks?: number;
  shares?: number;
  unfollows?: number;
  time_series: DailyMetrics[];
};

// Metric configuration for the overview cards
type MetricCard = {
  key: string;
  label: string;
  icon: typeof Eye;
  color: string;
  format?: (v: number) => string;
};

const METRIC_CARDS: MetricCard[] = [
  { key: "impressions", label: "Impressions", icon: Eye, color: chart.indigo },
  {
    key: "engagements",
    label: "Engagements",
    icon: TrendingUp,
    color: chart.sky,
  },
  {
    key: "engagement_rate",
    label: "Engagement Rate",
    icon: TrendingUp,
    color: chart.teal,
    format: (v: number) => `${v.toFixed(2)}%`,
  },
  { key: "likes", label: "Likes", icon: Heart, color: chart.red },
  { key: "retweets", label: "Retweets", icon: Repeat2, color: chart.green },
  {
    key: "replies",
    label: "Replies",
    icon: MessageCircle,
    color: chart.amber,
  },
  {
    key: "profile_visits",
    label: "Profile Visits",
    icon: Users,
    color: chart.orange,
  },
  { key: "followers", label: "Followers", icon: UserPlus, color: chart.jade },
  { key: "following", label: "Following", icon: UserCheck, color: chart.blue },
];

// Time series line configuration
const SERIES_LINES = [
  { key: "impressions", label: "Impressions", color: chart.indigo },
  { key: "engagements", label: "Engagements", color: chart.sky },
  { key: "likes", label: "Likes", color: chart.red },
  { key: "retweets", label: "Retweets", color: chart.green },
  { key: "replies", label: "Replies", color: chart.amber },
  { key: "profile_visits", label: "Profile Visits", color: chart.orange },
  { key: "follows", label: "New Follows", color: chart.jade },
  { key: "bookmarks", label: "Bookmarks", color: chart.blue },
] as const;

// =============================================================================
// Analytics Page
// =============================================================================

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(
    new Set(["impressions", "engagements", "likes"]),
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/explore/analytics");
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        setError(json?.error ?? "Failed to load analytics");
      } else {
        setData(json.data);
      }
    } catch {
      setError("Network error — could not reach API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSeries = (key: string) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Don't allow deselecting all
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <AppShell breadcrumbs={[{ label: "Analytics" }]}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            My Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your Twitter/X account performance and engagement metrics.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-card bg-destructive/10 p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Content */}
        {data && !loading && (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {METRIC_CARDS.map(({ key, label, icon: Icon, color, format }, idx) => {
                const value =
                  data[key as keyof AnalyticsData] as number;
                return (
                  <div
                    key={key}
                    className="rounded-card bg-secondary p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-md"
                        style={{ backgroundColor: withAlpha(`chart-${idx + 1}`, 0.12) }}
                      >
                        <Icon
                          className="h-3.5 w-3.5"
                          style={{ color }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {label}
                      </span>
                    </div>
                    <div className="text-xl font-bold font-display">
                      {format
                        ? format(value)
                        : formatCompact(value)}
                    </div>
                  </div>
                );
              })}

              {/* Optional extra metrics */}
              {data.verified_followers != null && (
                <div className="rounded-card bg-secondary p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Verified Followers
                    </span>
                  </div>
                  <div className="text-xl font-bold font-display">
                    {formatCompact(data.verified_followers)}
                  </div>
                </div>
              )}
              {data.bookmarks != null && (
                <div className="rounded-card bg-secondary p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Bookmarks
                    </span>
                  </div>
                  <div className="text-xl font-bold font-display">
                    {formatCompact(data.bookmarks)}
                  </div>
                </div>
              )}
              {data.shares != null && (
                <div className="rounded-card bg-secondary p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Shares
                    </span>
                  </div>
                  <div className="text-xl font-bold font-display">
                    {formatCompact(data.shares)}
                  </div>
                </div>
              )}
              {data.unfollows != null && (
                <div className="rounded-card bg-secondary p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Unfollows
                    </span>
                  </div>
                  <div className="text-xl font-bold font-display">
                    {formatCompact(data.unfollows)}
                  </div>
                </div>
              )}
            </div>

            {/* Time series chart */}
            {data.time_series.length > 0 && (
              <div className="rounded-card bg-secondary p-5">
                <div className="mb-4">
                  <h2 className="text-base font-semibold">Daily Trends</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click a metric to toggle its visibility on the chart.
                  </p>
                </div>

                {/* Series toggles */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {SERIES_LINES.map(({ key, label, color }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSeries(key)}
                      className="transition-colors"
                    >
                      <Badge
                        variant={
                          visibleSeries.has(key) ? "default" : "secondary"
                        }
                        className="cursor-pointer text-[11px] h-6"
                        style={
                          visibleSeries.has(key)
                            ? { backgroundColor: color, color: "white" }
                            : undefined
                        }
                      >
                        {label}
                      </Badge>
                    </button>
                  ))}
                </div>

                {/* Chart */}
                <div className="h-[320px]">
                  <ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
                    <AreaChart
                      data={data.time_series}
                      margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={chartMuted}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        {...AXIS_CONFIG}
                        tickFormatter={(d: string) =>
                          new Date(d).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        }
                      />
                      <YAxis
                        {...AXIS_CONFIG}
                        tickFormatter={formatCompact}
                        width={50}
                      />
                      <Tooltip
                        content={<ChartTooltip />}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      />
                      {SERIES_LINES.map(({ key, label, color }) =>
                        visibleSeries.has(key) ? (
                          <Area
                            key={key}
                            type="monotone"
                            dataKey={key}
                            name={label}
                            stroke={color}
                            fill={color}
                            fillOpacity={0.08}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        ) : null,
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {data.time_series.length === 0 && (
              <div className="rounded-card bg-secondary p-8 text-center text-muted-foreground">
                No time-series data available yet.
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

// =============================================================================
// Chart Tooltip
// =============================================================================

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium mb-1">
        {label
          ? new Date(label).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })
          : ""}
      </p>
      <div className="space-y-0.5">
        {payload.map((entry) => (
          <div
            key={entry.name}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </span>
            <span className="font-medium font-display tabular-nums">
              {formatCompact(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
