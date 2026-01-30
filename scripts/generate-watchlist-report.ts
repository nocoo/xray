import { loadRawTweets, loadAnalyzeOutput, nowISO, saveWatchlistReport } from "./lib/utils";
import type { Tweet } from "./lib/types";

function buildEngagementLabel(tweet: Tweet): string {
  const metrics = tweet.metrics;
  const likes = metrics.like_count || 0;
  const reposts = metrics.retweet_count || 0;
  const replies = metrics.reply_count || 0;
  const quotes = metrics.quote_count || 0;
  const views = metrics.view_count || 0;
  return `likes ${likes} | reposts ${reposts} | replies ${replies} | quotes ${quotes} | views ${views}`;
}


function buildReportMarkdown(
  tweets: Tweet[],
  generatedAt: string,
  analysis: Record<string, { translation: string; score: number; evaluation: string }>
): string {
  const normalizeLine = (value: string): string => value.replace(/\s+/g, " ").trim();

  const itemTemplate = (
    item: {
      url: string;
      text: string;
      translation?: string;
      author: string;
      engagement: string;
      score: number;
      evaluation: string;
    },
    index: number
  ): string => {
    const lines = [
      `## ${index}. ${item.author}`,
      item.translation ? normalizeLine(item.translation) : null,
      normalizeLine(item.text),
      item.url,
      `- Engagement: ${item.engagement}`,
      `- Score: ${item.score}`,
      `- Evaluation: ${item.evaluation}`,
    ].filter(Boolean);

    return lines.join("\n");
  };

  const reportTemplate = (body: string, total: number): string => {
    return `# X-Ray Watchlist Report\nGenerated: ${generatedAt}\nTotal tweets: ${total}\n\n${body}\n`;
  };

  const items = tweets.map((tweet) => {
    const authorLink = `[@${tweet.author.username}](https://x.com/${tweet.author.username})`;
    const result = analysis[tweet.id];
    return {
      url: tweet.url,
      text: tweet.text,
      translation: result?.translation || "",
      author: authorLink,
      engagement: buildEngagementLabel(tweet),
      score: result?.score ?? 0,
      evaluation: result?.evaluation || "",
    };
  });

  items.sort((a, b) => b.score - a.score);
  const lines = items.map((item, index) => itemTemplate(item, index + 1));
  return reportTemplate(lines.join("\n\n---\n\n"), items.length);
}

export default async function main() {
  const raw = await loadRawTweets();
  const analyzeOutput = await loadAnalyzeOutput();
  if (!analyzeOutput) {
    throw new Error("analyze_output.json not found");
  }
  const analyzeMap = Object.fromEntries(
    analyzeOutput.items.map((item) => [item.id, item])
  );
  const generatedAt = nowISO();

  const reportMarkdown = buildReportMarkdown(
    raw.tweets,
    generatedAt,
    analyzeMap
  );

  const reportPath = await saveWatchlistReport(reportMarkdown, generatedAt);
  console.log(`✅ Report generated: ${reportPath}`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
