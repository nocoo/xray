import { XRayClient } from "./lib/xray-client";
import { loadConfig } from "./lib/utils";
import { saveAnalytics, getLatestAnalytics, calculateTrend } from "./lib/analytics-db";
import type { AnalyticsTrend } from "./lib/analytics-db";

async function main() {
  const config = await loadConfig();

  if (!config.api.cookie) {
    console.error("Error: Cookie is required for analytics API. Please set api.cookie in config.");
    process.exit(1);
  }

  if (!config.me?.username) {
    console.error("Error: me.username is required in config.");
    process.exit(1);
  }

  const username = config.me.username;
  console.log(`Fetching analytics for @${username}...`);

  const client = new XRayClient(config);

  try {
    const analytics = await client.getUserAnalytics();

    const previous = getLatestAnalytics(username);
    const saved = saveAnalytics(username, analytics);
    const trend = calculateTrend(saved, previous);

    console.log("\n📊 Analytics Summary");
    console.log("=".repeat(50));

    printMetric("Impressions", trend.impressions);
    printMetric("Engagements", trend.engagements);
    printMetric("Engagement Rate", trend.engagement_rate, true);
    printMetric("Likes", trend.likes);
    printMetric("Retweets", trend.retweets);
    printMetric("Replies", trend.replies);
    printMetric("Profile Visits", trend.profile_visits);
    printMetric("Followers", trend.followers);
    printMetric("Following", trend.following);

    console.log("=".repeat(50));
    console.log(`\n✅ Saved to database at ${saved.fetched_at}`);

    if (previous) {
      const prevDate = new Date(previous.fetched_at);
      const hours = Math.round((Date.now() - prevDate.getTime()) / (1000 * 60 * 60));
      console.log(`📈 Compared to ${hours} hours ago`);
    } else {
      console.log("📝 First analytics record - no comparison available");
    }

    const output = {
      username,
      analytics: saved,
      trend,
      previous_fetched_at: previous?.fetched_at || null,
    };

    await Bun.write("data/analytics.json", JSON.stringify(output, null, 2));
    console.log("\n📁 Output saved to data/analytics.json");
  } catch (err) {
    console.error("Failed to fetch analytics:", err);
    process.exit(1);
  }
}

function printMetric(
  label: string,
  metric: { value: number; change: number; percent: number },
  isRate = false
) {
  const value = isRate ? `${metric.value.toFixed(2)}%` : metric.value.toLocaleString();
  const change = metric.change >= 0 ? `+${metric.change}` : metric.change.toString();
  const percent = metric.percent >= 0 ? `+${metric.percent.toFixed(1)}%` : `${metric.percent.toFixed(1)}%`;
  const arrow = metric.change > 0 ? "↑" : metric.change < 0 ? "↓" : "→";

  console.log(`${label.padEnd(18)} ${value.padStart(12)} ${arrow} ${change} (${percent})`);
}

main();
