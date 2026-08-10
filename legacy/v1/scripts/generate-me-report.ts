import { readFileSync } from "fs";
import { join } from "path";

interface MetricData {
  value: number;
  change: number;
  percent: number;
}

interface AnalyticsTrend {
  impressions: MetricData;
  engagements: MetricData;
  engagement_rate: MetricData;
  likes: MetricData;
  retweets: MetricData;
  replies: MetricData;
  profile_visits: MetricData;
  followers: MetricData;
  following: MetricData;
}

interface AnalyticsRecord {
  id: number;
  username: string;
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
  time_series?: Array<{
    date: string;
    impressions: number;
    engagements: number;
    profile_visits: number;
    follows: number;
    likes: number;
    replies: number;
    retweets: number;
    bookmarks: number;
  }>;
  fetched_at: string;
}

interface Tweet {
  id: string;
  text: string;
  author: {
    username: string;
    name: string;
  };
  url: string;
}

interface TwitterList {
  name: string;
  member_count: number;
  subscriber_count: number;
  description?: string;
}

interface MeData {
  username: string;
  fetched_at: string;
  analytics: {
    current: AnalyticsRecord;
    previous: AnalyticsRecord | null;
    trend: AnalyticsTrend;
    time_series: AnalyticsRecord["time_series"];
  };
  bookmarks: Tweet[];
  likes: Tweet[];
  lists: TwitterList[];
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toISOString().split("T")[0];
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

function formatChange(change: number, percent: number, isRate = false): string {
  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";
  let changeDisplay: string;
  if (isRate) {
    changeDisplay = "";
  } else if (change === 0) {
    changeDisplay = "+0";
  } else {
    changeDisplay = Math.abs(change) < 1 ? change.toFixed(4) : (change >= 0 ? "+" : "") + change.toString();
  }
  return `${arrow} ${changeDisplay} (${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%)`;
}

function formatRate(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

function truncateText(text: string, maxLength = 60): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

function generateReport(data: MeData): string {
  const date = formatDate(data.fetched_at);
  const time = new Date(data.fetched_at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const { current, trend, time_series } = data.analytics;

  let report = `# 📊 我的 X 日报 | ${date}\n\n---\n\n## 📈 核心指标\n\n| 指标 | 当前值 | 变化 | 趋势 |\n|------|--------|------|------|\n`;

  type MetricEntry = { label: string; value: string | number; trend: MetricData | null; isRate?: boolean };

  const metrics: MetricEntry[] = [
    { label: "粉丝", value: current.followers, trend: trend.followers },
    { label: "展示量", value: current.impressions, trend: trend.impressions },
    { label: "互动量", value: current.engagements, trend: trend.engagements },
    { label: "互动率", value: formatRate(current.engagement_rate), trend: trend.engagement_rate, isRate: true },
    { label: "主页访问", value: current.profile_visits, trend: trend.profile_visits },
    { label: "关注", value: current.following, trend: trend.following },
  ];

  if (current.verified_followers !== undefined) {
    metrics.push({ label: "认证粉丝", value: current.verified_followers, trend: null });
  }

  metrics.forEach((m) => {
    const value = m.isRate ? m.value : formatNumber(Number(m.value));
    const changeStr = m.trend ? formatChange(m.trend.change, m.trend.percent, m.isRate) : "-";
    const trendSymbol = m.trend ? (m.trend.change > 0 ? "↑" : m.trend.change < 0 ? "↓" : "→") : "-";
    report += `| ${m.label} | ${value} | ${changeStr} | ${trendSymbol} |\n`;
  });

  report += `\n---\n\n## 📅 7天趋势\n\n| 日期 | 展示量 | 互动 | 新粉 | 点赞 |\n|------|--------|------|------|------|\n`;

  const sortedTimeSeries = (time_series || []).slice(-7);
  sortedTimeSeries.forEach((ts) => {
    const dateStr = ts.date.substring(5).replace("-", "-");
    report += `| ${dateStr} | ${formatNumber(ts.impressions)} | ${formatNumber(ts.engagements)} | ${ts.follows} | ${ts.likes} |\n`;
  });

  report += `\n---\n\n## 🔖 最近收藏 (${data.bookmarks.length} 条)\n\n`;

  data.bookmarks.slice(0, 20).forEach((b, i) => {
    const truncatedText = truncateText(b.text.replace(/\n/g, " "));
    report += `${i + 1}. **@${b.author.username}**: ${truncatedText} [链接](${b.url})\n`;
  });

  report += `\n---\n\n## ❤️ 最近点赞 (${data.likes.length} 条)\n\n`;

  data.likes.slice(0, 20).forEach((l, i) => {
    const truncatedText = truncateText(l.text.replace(/\n/g, " "));
    report += `${i + 1}. **@${l.author.username}**: ${truncatedText} [链接](${l.url})\n`;
  });

  report += `\n---\n\n## 📋 订阅列表 (${data.lists.length} 个)\n\n| 列表 | 成员数 | 订阅数 | 描述 |\n|------|--------|--------|------|\n`;

  data.lists.slice(0, 20).forEach((l) => {
    const desc = l.description || "-";
    report += `| ${l.name} | ${l.member_count} | ${l.subscriber_count} | ${desc} |\n`;
  });

  report += `\n---\n\n## 🔍 AI 分析\n\n### 亮点\n`;

  const highlights: string[] = [];
  const sortedTS = [...(time_series || [])].sort((a, b) => b.impressions - a.impressions);
  if (sortedTS.length > 0) {
    const maxImp = sortedTS[0];
    highlights.push(`📌 ${maxImp.date.substring(5).replace("-", "-")} 达到 ${formatNumber(maxImp.impressions)} 展示量峰值`);
  }

  if (current.engagement_rate >= 3) {
    highlights.push(`📌 互动率保持 ${formatRate(current.engagement_rate)} 的健康水平`);
  }

  if (data.lists.length >= 10) {
    highlights.push(`📌 订阅 ${data.lists.length} 个列表，信息源丰富`);
  }

  const techKeywords = ["AI", "开发", "工具", "开源", "代码", "技术"];
  const techBookmarks = data.bookmarks.filter((b) => techKeywords.some((k) => b.text.includes(k)));
  if (techBookmarks.length >= 5) {
    highlights.push(`📌 收藏 ${techBookmarks.length} 条技术相关高质量内容`);
  }

  highlights.forEach((h) => {
    report += `- ${h}\n`;
  });

  report += `\n### 关注\n`;

  const concerns: string[] = [];
  const latestTS = time_series && time_series.length > 0 ? time_series[time_series.length - 1] : null;
  if (latestTS && latestTS.impressions < 100) {
    concerns.push(`⚠️ 今日展示量仅 ${formatNumber(latestTS.impressions)}，活跃度极低`);
  }

  const impressions = time_series?.map((ts) => ts.impressions) || [];
  if (impressions.length >= 3) {
    const avg = impressions.reduce((a, b) => a + b, 0) / impressions.length;
    const variance = impressions.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / impressions.length;
    if (variance > avg * avg * 0.5) {
      concerns.push("⚠️ 近期展示量波动较大，不稳定");
    }
  }

  if (trend.engagements.change < 0) {
    concerns.push("⚠️ 互动量近期呈现下降趋势");
  }

  if (concerns.length === 0) {
    concerns.push("✅ 各项指标表现良好");
  }

  concerns.forEach((c) => {
    report += `- ${c}\n`;
  });

  report += `\n### 建议\n- 💡 尝试在固定时间发布内容，建立粉丝期待\n- 💡 增加原创内容频率，提高账号活跃度\n- 💡 关注热门话题，提升内容曝光度\n`;

  report += `\n---\n\n*数据来源: Twitter Analytics API*\n*生成时间: ${date} ${time} UTC+8*\n`;

  return report;
}

async function main() {
  const meDataPath = join(import.meta.dir, "../data/me-data.json");
  const meDataContent = readFileSync(meDataPath, "utf-8");
  const meData: MeData = JSON.parse(meDataContent);

  const report = generateReport(meData);

  const date = formatDate(meData.fetched_at);
  const time = new Date(meData.fetched_at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const filename = `xray_me_${date.replace(/-/g, "")}_${time.replace(":", "")}.md`;
  const reportPath = join(import.meta.dir, "../reports", filename);

  await Bun.write(reportPath, report);

  console.log(`✅ Report generated: ${reportPath}`);
}

main();
