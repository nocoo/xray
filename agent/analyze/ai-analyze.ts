/**
 * AI-Powered Tweet Analyzer
 *
 * Uses LLM to analyze tweets and select top valuable ones.
 */

import type { Tweet } from "../../scripts/lib/types";
import { getRecentTweets } from "../analyze/recent";
import {
  processedMarkMany,
  classificationUpsert,
} from "../../scripts/lib/tweet-db";
import type { CommandResult } from "../../scripts/lib/types";

export interface AnalyzeOptions {
  hoursBack?: number;
  limit?: number;
  topN?: number;
  translateToChinese?: boolean;
}

export interface AnalyzedTweet {
  tweet: Tweet;
  category: string;
  analysis: string;
  translation?: string;
  relevanceScore: number;
}

export interface AnalysisReport {
  generatedAt: string;
  timeRange: {
    from: string;
    to: string;
  };
  totalAnalyzed: number;
  selectedCount: number;
  categories: Record<string, AnalyzedTweet[]>;
  summary: string;
}

/**
 * Get AI analysis prompt
 */
function getAnalysisPrompt(tweets: Tweet[], options: AnalyzeOptions): string {
  const { topN = 20 } = options;
  
  const tweetsJson = tweets.map((t, i) => {
    return `${i + 1}. @${t.author.username}: ${t.text} (${t.metrics.like_count} likes, ${t.metrics.retweet_count} retweets)`;
  }).join("\n");

  return `你是一个专业的内容分析师。分析以下推文列表，提取最有价值的内容。

## 任务要求：
1. 从 ${tweets.length} 条推文中筛选出 ${topN} 条最有价值的
2. 完整引用原文（用 > 引用格式）
3. 对每条推文进行分类：AI, Coding, Tools, News, Insights, Projects, Other
4. 提供简洁的分析（1-2句话）
5. 如果是英文，提供中文翻译
6. 按价值排序（价值相同时按时间）

## 推文列表：
${tweetsJson}

## 输出格式：
## 💻 AI & LLMs
- **@username**
  > 原文内容...
  > **分析:** 简洁分析...
  > **翻译:** 中文翻译（如果是英文）

## 🔧 Tools & Projects
...

## 📰 News & Announcements
...

请直接输出分析结果，不要有其他说明。`;
}

/**
 * Call AI to analyze tweets (placeholder - will use actual LLM)
 */
async function callAIAnalysis(prompt: string): Promise<string> {
  // TODO: Integrate with LLM (Claude/GPT/MiniMax)
  // For now, return a placeholder
  console.log("[potato-ai] Would send to LLM with prompt length:", prompt.length);
  return "";
}

/**
 * Simple keyword-based analyzer (fallback when AI not available)
 */
function simpleAnalyze(tweets: Tweet[], options: AnalyzeOptions = {}): AnalysisReport {
  const { topN = 20, hoursBack = 1 } = options;
  
  // Score tweets
  const scored = tweets.map((t) => {
    const text = t.text.toLowerCase();
    const keywords = [
      { key: "ai", score: 3 },
      { key: "llm", score: 3 },
      { key: "gpt", score: 2 },
      { key: "claude", score: 2 },
      { key: "model", score: 2 },
      { key: "release", score: 2 },
      { key: "announcement", score: 2 },
      { key: "github", score: 1 },
      { key: "code", score: 1 },
      { key: "tool", score: 1 },
    ];
    
    let score = 0;
    let category = "Other";
    
    for (const { key, s } of keywords) {
      if (text.includes(key)) {
        score += s;
      }
    }
    
    // Boost for high engagement
    const engagement = t.metrics.like_count + t.metrics.retweet_count * 2;
    score += Math.min(engagement / 10, 5);
    
    // Categorize
    if (text.includes("ai") || text.includes("llm") || text.includes("gpt") || text.includes("claude")) {
      category = "AI & LLMs";
    } else if (text.includes("tool") || text.includes("github") || text.includes("release")) {
      category = "Tools & Projects";
    } else if (text.includes("news") || text.includes("announcement") || text.includes("launch")) {
      category = "News & Announcements";
    } else if (text.includes("code") || text.includes("programming") || text.includes("coding")) {
      category = "Coding & Development";
    } else if (text.includes("insight") || text.includes("thought") || text.includes("opinion")) {
      category = "Insights & Thoughts";
    }
    
    return { tweet: t, score, category };
  });
  
  // Sort by score and take top N
  const selected = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
  
  // Group by category
  const categories: Record<string, AnalyzedTweet[]> = {};
  for (const { tweet, score, category } of selected) {
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push({
      tweet,
      category,
      analysis: "Analyzed by simple keyword matcher (placeholder for AI)",
      relevanceScore: score,
    });
  }
  
  return {
    generatedAt: new Date().toISOString(),
    timeRange: {
      from: new Date(Date.now() - hoursBack * 3600000).toISOString(),
      to: new Date().toISOString(),
    },
    totalAnalyzed: tweets.length,
    selectedCount: selected.length,
    categories,
    summary: `Analyzed ${tweets.length} tweets, selected ${selected.length} most valuable.`,
  };
}

/**
 * Main analysis function
 */
export async function analyzeTweets(
  options: AnalyzeOptions = {}
): Promise<CommandResult<AnalysisReport>> {
  const {
    hoursBack = 1,
    limit = 100,
    topN = 20,
  } = options;

  console.log(`[potato-ai] Starting analysis (last ${hoursBack}h, top ${topN})...`);

  // Get unprocessed tweets
  const { tweets } = await getRecentTweets({
    hoursBack,
    limit,
    skipProcessed: true,
  });

  if (tweets.length === 0) {
    return {
      success: true,
      message: "No new tweets to analyze",
    };
  }

  console.log(`[potato-ai] Found ${tweets.length} unprocessed tweets`);

  // Generate report (use AI if available, fallback to simple)
  let report: AnalysisReport;
  
  try {
    // Try AI analysis first
    const prompt = getAnalysisPrompt(tweets, options);
    const aiResult = await callAIAnalysis(prompt);
    
    if (aiResult) {
      // Parse AI result and create structured report
      report = await parseAIResult(aiResult, tweets, options);
    } else {
      // Fallback to simple analysis
      console.log("[potato-ai] Using simple analyzer (AI not configured)");
      report = simpleAnalyze(tweets, options);
    }
  } catch (err) {
    console.error("[potato-ai] AI analysis failed, using fallback:", err);
    report = simpleAnalyze(tweets, options);
  }

  // Mark as processed
  const tweetIds = tweets.map((t) => t.id);
  processedMarkMany(tweetIds, "skipped");

  // Update classifications for selected tweets
  for (const [category, items] of Object.entries(report.categories)) {
    for (const item of items) {
      classificationUpsert(item.tweet.id, {
        is_tech_related: category !== "Other",
        is_hot_topic: item.tweet.metrics.like_count > 100,
        category: [category],
        relevance_score: item.relevanceScore,
        reason: item.analysis,
      });
    }
  }

  return {
    success: true,
    message: `Analyzed ${report.totalAnalyzed} tweets, selected ${report.selectedCount}`,
    data: report,
  };
}

/**
 * Parse AI result into structured format
 */
async function parseAIResult(
  aiResult: string,
  originalTweets: Tweet[],
  options: AnalyzeOptions
): Promise<AnalysisReport> {
  // TODO: Implement parsing logic
  // For now, fall back to simple
  return simpleAnalyze(originalTweets, options);
}

/**
 * Generate markdown report from analysis
 */
export function generateMarkdownReport(report: AnalysisReport): string {
  let md = `# Potato Hourly Report\n\n`;
  md += `**生成时间:** ${report.generatedAt}\n`;
  md += `**时间范围:** ${report.timeRange.from} ~ ${report.timeRange.to}\n`;
  md += `**分析推文:** ${report.totalAnalyzed} 条\n`;
  md += `**精选推文:** ${report.selectedCount} 条\n\n`;
  
  md += `---\n\n`;
  
  const categoryNames: Record<string, string> = {
    "AI & LLMs": "🤖 AI & LLMs",
    "Tools & Projects": "🛠️ Tools & Projects",
    "News & Announcements": "📰 News & Announcements",
    "Coding & Development": "💻 Coding & Development",
    "Insights & Thoughts": "💡 Insights & Thoughts",
    "Other": "📝 Other",
  };
  
  for (const [category, items] of Object.entries(report.categories)) {
    const displayName = categoryNames[category] || category;
    md += `## ${displayName}\n\n`;
    
    for (const item of items) {
      md += `- **@${item.tweet.author.username}**\n`;
      md += `  > ${item.tweet.text}\n`;
      md += `  > **分析:** ${item.analysis}\n`;
      if (item.translation) {
        md += `  > **翻译:** ${item.translation}\n`;
      }
      md += `  > [链接](${item.tweet.url})\n\n`;
    }
  }
  
  md += `---\n`;
  md += `*Generated by Potato*\n`;
  
  return md;
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  let hoursBack = 1;
  let topN = 20;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--hours" && args[i + 1]) {
      hoursBack = parseInt(args[i + 1], 10);
    } else if (args[i] === "--top" && args[i + 1]) {
      topN = parseInt(args[i + 1], 10);
    }
  }

  const result = await analyzeTweets({ hoursBack, topN });

  console.log("\n=== Analysis Result ===");
  console.log(JSON.stringify(result, null, 2));

  if (result.data) {
    const md = generateMarkdownReport(result.data);
    console.log("\n=== Markdown Report ===\n");
    console.log(md);
  }

  process.exit(result.success ? 0 : 1);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
