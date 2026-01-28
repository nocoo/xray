import { TwitterAPIClient } from "./lib/api";
import { loadConfig } from "./lib/utils";
import { saveAnalytics, getLatestAnalytics, calculateTrend } from "./lib/analytics-db";
import type { Tweet, TwitterList, AnalyticsWithTimeSeries } from "./lib/types";
import type { AnalyticsTrend, AnalyticsRecord } from "./lib/analytics-db";

export interface MeData {
  username: string;
  fetched_at: string;
  analytics: {
    current: AnalyticsRecord;
    previous: AnalyticsRecord | null;
    trend: AnalyticsTrend;
    time_series: AnalyticsWithTimeSeries["time_series"];
  };
  bookmarks: Tweet[];
  likes: Tweet[];
  lists: TwitterList[];
}

async function main() {
  const config = await loadConfig();

  if (!config.api.cookie) {
    console.error("Error: Cookie is required. Please set api.cookie in config.");
    process.exit(1);
  }

  if (!config.me?.username) {
    console.error("Error: me.username is required in config.");
    process.exit(1);
  }

  const username = config.me.username;
  console.log(`📊 Fetching all data for @${username}...`);

  const client = new TwitterAPIClient(config);

  try {
    console.log("\n🔄 Fetching analytics...");
    const analyticsWithTS = await client.getUserAnalyticsWithTimeSeries();
    const previous = getLatestAnalytics(username);
    const saved = saveAnalytics(username, analyticsWithTS);
    const trend = calculateTrend(saved, previous);

    console.log("🔄 Fetching bookmarks...");
    const bookmarks = await client.getUserBookmarks();

    console.log("🔄 Fetching likes...");
    const likes = await client.getUserLikes();

    console.log("🔄 Fetching lists...");
    const lists = await client.getUserLists();

    const meData: MeData = {
      username,
      fetched_at: new Date().toISOString(),
      analytics: {
        current: saved,
        previous,
        trend,
        time_series: analyticsWithTS.time_series,
      },
      bookmarks,
      likes,
      lists,
    };

    await Bun.write("data/me-data.json", JSON.stringify(meData, null, 2));

    console.log("\n" + "=".repeat(60));
    console.log("📊 Data Summary");
    console.log("=".repeat(60));
    console.log(`Followers:       ${saved.followers.toLocaleString()}`);
    console.log(`Impressions:     ${saved.impressions.toLocaleString()}`);
    console.log(`Engagements:     ${saved.engagements.toLocaleString()}`);
    console.log(`Engagement Rate: ${saved.engagement_rate.toFixed(2)}%`);
    console.log(`Profile Visits:  ${saved.profile_visits.toLocaleString()}`);
    console.log(`Bookmarks:       ${bookmarks.length} tweets`);
    console.log(`Likes:           ${likes.length} tweets`);
    console.log(`Lists:           ${lists.length} subscribed`);
    console.log(`Time Series:     ${analyticsWithTS.time_series.length} days`);
    console.log("=".repeat(60));

    if (previous) {
      const prevDate = new Date(previous.fetched_at);
      const hours = Math.round((Date.now() - prevDate.getTime()) / (1000 * 60 * 60));
      console.log(`\n📈 Compared to ${hours} hours ago`);
      printTrendSummary(trend);
    } else {
      console.log("\n📝 First record - no comparison available");
    }

    console.log("\n✅ All data saved to data/me-data.json");
  } catch (err) {
    console.error("Failed to fetch data:", err);
    process.exit(1);
  }
}

function printTrendSummary(trend: AnalyticsTrend) {
  const arrow = (change: number) => (change > 0 ? "↑" : change < 0 ? "↓" : "→");
  const format = (t: { change: number; percent: number }) =>
    `${arrow(t.change)} ${t.change >= 0 ? "+" : ""}${t.change} (${t.percent >= 0 ? "+" : ""}${t.percent.toFixed(1)}%)`;

  console.log(`  Followers:    ${format(trend.followers)}`);
  console.log(`  Impressions:  ${format(trend.impressions)}`);
  console.log(`  Engagements:  ${format(trend.engagements)}`);
}

main();
