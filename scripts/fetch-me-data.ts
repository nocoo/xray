import { TwitterAPIClient } from "./lib/api";
import { loadConfig } from "./lib/utils";
import { saveAnalytics, getLatestAnalytics, getAnalyticsHistory, calculateTrend, type AnalyticsRecord, type AnalyticsTrend } from "./lib/analytics-db";
import type { Tweet, TwitterList, AnalyticsWithTimeSeries } from "./lib/types";

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
    let analyticsData: {
      current: AnalyticsRecord;
      previous: AnalyticsRecord | null;
      trend: AnalyticsTrend;
      time_series: AnalyticsWithTimeSeries["time_series"];
    };
    let analyticsFetched = false;

    try {
      console.log("\n🔄 Fetching analytics...");
      const analyticsWithTS = await client.getUserAnalyticsWithTimeSeries();
      const previous = getLatestAnalytics(username);
      const saved = saveAnalytics(username, analyticsWithTS);
      const trend = calculateTrend(saved, previous);
      analyticsData = {
        current: saved,
        previous,
        trend,
        time_series: analyticsWithTS.time_series,
      };
      analyticsFetched = true;
    } catch (analyticsError) {
      console.warn("⚠️  Analytics API unavailable (may require paid subscription)");
      console.warn("   Continuing with other data sources...");
      const previous = getLatestAnalytics(username);
      const emptyRecord: AnalyticsRecord = {
        id: 0,
        username,
        fetched_at: new Date().toISOString(),
        followers: 0,
        impressions: 0,
        engagements: 0,
        engagement_rate: 0,
        profile_visits: 0,
        likes: 0,
        replies: 0,
        retweets: 0,
        bookmarks: 0,
        following: 0,
      };
      analyticsData = {
        current: previous || emptyRecord,
        previous: previous ? getAnalyticsHistory(username, 2)[1] || null : null,
        trend: {
          followers: { value: previous?.followers || 0, change: 0, percent: 0 },
          impressions: { value: previous?.impressions || 0, change: 0, percent: 0 },
          engagements: { value: previous?.engagements || 0, change: 0, percent: 0 },
          engagement_rate: { value: previous?.engagement_rate || 0, change: 0, percent: 0 },
          likes: { value: previous?.likes || 0, change: 0, percent: 0 },
          retweets: { value: previous?.retweets || 0, change: 0, percent: 0 },
          replies: { value: previous?.replies || 0, change: 0, percent: 0 },
          profile_visits: { value: previous?.profile_visits || 0, change: 0, percent: 0 },
          following: { value: previous?.following || 0, change: 0, percent: 0 },
        },
        time_series: [],
      };
    }

    let bookmarks: Tweet[] = [];
    try {
      console.log("🔄 Fetching bookmarks...");
      bookmarks = await client.getUserBookmarks();
    } catch (bookmarksError) {
      console.warn("⚠️  Bookmarks API unavailable (may require paid subscription)");
      console.warn("   Continuing with other data sources...");
      bookmarks = [];
    }

    let likes: Tweet[] = [];
    try {
      console.log("🔄 Fetching likes...");
      likes = await client.getUserLikes();
    } catch (likesError) {
      console.warn("⚠️  Likes API unavailable (may require paid subscription)");
      console.warn("   Continuing with other data sources...");
      likes = [];
    }

    let lists: TwitterList[] = [];
    try {
      console.log("🔄 Fetching lists...");
      lists = await client.getUserLists();
    } catch (listsError) {
      console.warn("⚠️  Lists API unavailable (may require paid subscription)");
      console.warn("   Continuing with other data sources...");
      lists = [];
    }

    const meData: MeData = {
      username,
      fetched_at: new Date().toISOString(),
      analytics: analyticsData,
      bookmarks,
      likes,
      lists,
    };

    await Bun.write("data/me-data.json", JSON.stringify(meData, null, 2));

    console.log("\n" + "=".repeat(60));
    console.log("📊 Data Summary");
    console.log("=".repeat(60));
    console.log(`Followers:       ${analyticsData.current.followers.toLocaleString()}`);
    console.log(`Impressions:     ${analyticsData.current.impressions.toLocaleString()}`);
    console.log(`Engagements:     ${analyticsData.current.engagements.toLocaleString()}`);
    console.log(`Engagement Rate: ${analyticsData.current.engagement_rate.toFixed(2)}%`);
    console.log(`Profile Visits:  ${analyticsData.current.profile_visits.toLocaleString()}`);
    console.log(`Bookmarks:       ${bookmarks.length} tweets`);
    console.log(`Likes:           ${likes.length} tweets`);
    console.log(`Lists:           ${lists.length} subscribed`);
    console.log(`Time Series:     ${analyticsData.time_series.length} days`);
    console.log("=".repeat(60));

    if (analyticsData.previous && analyticsFetched) {
      const prevDate = new Date(analyticsData.previous.fetched_at);
      const hours = Math.round((Date.now() - prevDate.getTime()) / (1000 * 60 * 60));
      console.log(`\n📈 Compared to ${hours} hours ago`);
      printTrendSummary(analyticsData.trend);
    } else {
      console.log("\n📝 No comparison available");
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
