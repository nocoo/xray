/**
 * Track Topic Trends Script
 * 
 * Tracks the volume and sentiment trends of a topic over time
 * by comparing current search results with historical data.
 * 
 * Usage:
 *   bun run agent/research/track-topic-trends.ts --topic "AI" --compare
 */

import { loadConfig } from "../../scripts/lib/utils";
import { createAPIClient } from "../../scripts/lib/api";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

interface Args {
  topic?: string;
  compare?: boolean;
  count?: number;
  save?: boolean;
  help?: boolean;
}

interface TrendData {
  timestamp: string;
  topic: string;
  volume: number;
  totalEngagement: number;
  avgEngagement: number;
  topTweets: Array<{
    id: string;
    author: string;
    engagement: number;
    text: string;
  }>;
}

function parseArgs(): Args {
  const args: Args = {};
  const rawArgs = process.argv.slice(2);
  
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    const nextArg = rawArgs[i + 1];
    
    if (arg === "--topic" || arg === "-t") {
      args.topic = nextArg;
      i++;
    } else if (arg === "--compare" || arg === "-c") {
      args.compare = true;
    } else if (arg === "--count" || arg === "-n") {
      args.count = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--save" || arg === "-s") {
      args.save = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  
  return args;
}

function printHelp() {
  console.log(`
Track Topic Trends Script
=========================

Tracks the volume and sentiment trends of a topic over time.

Usage:
  bun run agent/research/track-topic-trends.ts --topic "AI" --compare

Options:
  --topic, -t      Topic to track (required)
  --compare, -c    Compare with previous data (default: true if historical exists)
  --count, -n      Number of tweets to analyze (default: 50)
  --save, -s       Save current data for future comparison (default: true)
  --help, -h       Show this help message

Examples:
  bun run agent/research/track-topic-trends.ts --topic "AI"
  bun run agent/research/track-topic-trends.ts -t "Crypto" -n 100
  bun run agent/research/track-topic-trends.ts --topic "GPT-5" --save false
`);
}

function getDataPath(topic: string): string {
  const { HONE } = process.env;
  const dataDir = join(import.meta.dirname, "..", "data", "trends");
  return join(dataDir, `${topic.replace(/[^a-zA-Z0-9]/g, "_")}.json`);
}

async function saveTrendData(topic: string, data: TrendData): Promise<void> {
  const { join, dirname } = await import("path");
  const { existsSync, mkdirSync } = await import("fs");
  
  const dataDir = join(import.meta.dirname, "..", "data", "trends");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  
  const filePath = getDataPath(topic);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`💾 Saved trend data to: ${filePath}`);
}

async function loadTrendData(topic: string): Promise<TrendData | null> {
  const filePath = getDataPath(topic);
  
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs();
  
  if (args.help || !args.topic) {
    printHelp();
    return;
  }
  
  try {
    const config = await loadConfig();
    const client = createAPIClient(config);
    
    const count = args.count || 50;
    const shouldSave = args.save !== false;
    
    console.log(`\n📈 Tracking trends for "${args.topic}"...`);
    console.log(`   Analyzing ${count} tweets\n`);
    
    // Fetch current data
    const tweets = await client.searchTweets(args.topic, count, true);
    
    if (tweets.length === 0) {
      console.log("   No tweets found for this topic.\n");
      return;
    }
    
    // Calculate metrics
    let totalEngagement = 0;
    const topTweets: TrendData["topTweets"] = [];
    
    for (const tweet of tweets) {
      const engagement = tweet.metrics.like_count + 
                         tweet.metrics.retweet_count * 2 + 
                         tweet.metrics.reply_count;
      totalEngagement += engagement;
      
      topTweets.push({
        id: tweet.id,
        author: tweet.author.username,
        engagement,
        text: tweet.text.substring(0, 100),
      });
    }
    
    // Sort top tweets
    topTweets.sort((a, b) => b.engagement - a.engagement);
    const top5Tweets = topTweets.slice(0, 5);
    
    const currentData: TrendData = {
      timestamp: new Date().toISOString(),
      topic: args.topic,
      volume: tweets.length,
      totalEngagement,
      avgEngagement: Math.round(totalEngagement / tweets.length),
      topTweets: top5Tweets,
    };
    
    // Display current data
    console.log("=== Current Trends ===\n");
    console.log(`Volume: ${tweets.length} tweets`);
    console.log(`Total Engagement: ${totalEngagement.toLocaleString()}`);
    console.log(`Avg Engagement: ${Math.round(totalEngagement / tweets.length)}`);
    console.log(`\nTop 5 Tweets:\n`);
    
    for (let i = 0; i < top5Tweets.length; i++) {
      const tweet = top5Tweets[i];
      console.log(`${i + 1}. @${tweet.author}: ${tweet.engagement} engagements`);
      console.log(`   "${tweet.text}..."\n`);
    }
    
    // Compare with historical data
    const historicalData = await loadTrendData(args.topic);
    
    if (historicalData && args.compare !== false) {
      console.log("\n=== Comparison with Previous ===\n");
      
      const volumeChange = currentData.volume - historicalData.volume;
      const volumePercent = ((volumeChange / historicalData.volume) * 100).toFixed(1);
      
      const engagementChange = currentData.avgEngagement - historicalData.avgEngagement;
      const engagementPercent = ((engagementChange / historicalData.avgEngagement) * 100).toFixed(1);
      
      const date1 = new Date(historicalData.timestamp);
      const date2 = new Date(currentData.timestamp);
      const hoursDiff = Math.abs(Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60)));
      
      console.log(`Last checked: ${date1.toLocaleString()} (${hoursDiff} hours ago)`);
      console.log(`Volume: ${historicalData.volume} → ${currentData.volume} (${volumeChange >= 0 ? '+' : ''}${volumePercent}%)`);
      console.log(`Avg Engagement: ${historicalData.avgEngagement} → ${currentData.avgEngagement} (${engagementChange >= 0 ? '+' : ''}${engagementPercent}%)`);
      
      // Trend indicator
      const trendScore = parseFloat(volumePercent) + parseFloat(engagementPercent);
      let trend = "➡️ Stable";
      if (trendScore > 20) trend = "📈 Rising";
      else if (trendScore > 10) trend = "📉 Slightly Up";
      else if (trendScore < -20) trend = "📉 Falling";
      else if (trendScore < -10) trend = "📉 Slightly Down";
      
      console.log(`\nTrend: ${trend}`);
    }
    
    // Save current data
    if (shouldSave) {
      await saveTrendData(args.topic, currentData);
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
