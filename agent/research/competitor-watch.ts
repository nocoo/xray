/**
 * Competitor Watch Script
 * 
 * Monitors specific accounts for competitive intelligence.
 * Tracks posting frequency, engagement, and key topics.
 * 
 * Usage:
 *   bun run agent/research/competitor-watch.ts --accounts "@competitor1,@competitor2" --hours 24
 */

import { loadConfig } from "../../scripts/lib/utils";
import { createAPIClient } from "../../scripts/lib/api";

interface Args {
  accounts?: string;
  hours?: number;
  help?: boolean;
}

interface CompetitorStats {
  username: string;
  tweetsCount: number;
  totalEngagement: number;
  avgEngagement: number;
  topTweet: {
    text: string;
    engagement: number;
  };
  topics: string[];
}

function parseArgs(): Args {
  const args: Args = {};
  const rawArgs = process.argv.slice(2);
  
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    const nextArg = rawArgs[i + 1];
    
    if (arg === "--accounts" || arg === "-a") {
      args.accounts = nextArg;
      i++;
    } else if (arg === "--hours" || arg === "-h") {
      args.hours = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  
  return args;
}

function printHelp() {
  console.log(`
Competitor Watch Script
=======================

Monitors specific accounts for competitive intelligence.

Usage:
  bun run agent/research/competitor-watch.ts --accounts "@comp1,@comp2" --hours 24

Options:
  --accounts, -a    Comma-separated list of accounts to monitor (required)
  --hours, -h       Look back period in hours (default: 24)
  --help, -h        Show this help message

Examples:
  bun run agent/research/competitor-watch.ts --accounts "@OpenAI,@AnthropicAI"
  bun run agent/research/competitor-watch.ts -a "@ competitor1,@competitor2" -h 48
`);
}

function extractTopics(text: string): string[] {
  const hashtags = text.match(/#\w+/g);
  return hashtags ? hashtags.map(h => h.toLowerCase()) : [];
}

async function main() {
  const args = parseArgs();
  
  if (args.help || !args.accounts) {
    printHelp();
    return;
  }
  
  try {
    const config = await loadConfig();
    const client = createAPIClient(config);
    
    const hours = args.hours || 24;
    const accounts = args.accounts.split(",").map(a => a.trim().replace(/^@/, ""));
    
    console.log(`\n👀 Monitoring competitors...`);
    console.log(`   Accounts: ${accounts.join(", ")}`);
    console.log(`   Time window: ${hours} hours\n`);
    
    const allStats: CompetitorStats[] = [];
    
    for (const account of accounts) {
      console.log(`📊 Analyzing @${account}...`);
      
      try {
        const tweets = await client.fetchUserTweets(account);
        
        // Filter by time range
        const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        const recentTweets = tweets.filter(t => 
          new Date(t.created_at) >= cutoffTime
        );
        
        if (recentTweets.length === 0) {
          console.log(`   No tweets in the last ${hours} hours\n`);
          continue;
        }
        
        // Calculate stats
        let totalEngagement = 0;
        let topTweet = { text: "", engagement: 0 };
        const allTopics: string[] = [];
        
        for (const tweet of recentTweets) {
          const engagement = tweet.metrics.like_count + 
                            tweet.metrics.retweet_count * 2 + 
                            tweet.metrics.reply_count;
          
          totalEngagement += engagement;
          
          if (engagement > topTweet.engagement) {
            topTweet = {
              text: tweet.text,
              engagement,
            };
          }
          
          allTopics.push(...extractTopics(tweet.text));
        }
        
        const stats: CompetitorStats = {
          username: account,
          tweetsCount: recentTweets.length,
          totalEngagement,
          avgEngagement: Math.round(totalEngagement / recentTweets.length),
          topTweet,
          topics: [...new Set(allTopics)].slice(0, 10),
        };
        
        allStats.push(stats);
        
        console.log(`   Tweets: ${stats.tweetsCount}`);
        console.log(`   Avg Engagement: ${stats.avgEngagement}`);
        console.log(`   Top Topic: ${stats.topics[0] || "N/A"}\n`);
        
      } catch (err) {
        console.log(`   Error: ${err instanceof Error ? err.message : err}\n`);
      }
    }
    
    // Summary
    if (allStats.length > 0) {
      console.log("=== Competitor Comparison ===\n");
      
      // Sort by avg engagement
      allStats.sort((a, b) => b.avgEngagement - a.avgEngagement);
      
      console.log("📈 Engagement Ranking:");
      for (let i = 0; i < allStats.length; i++) {
        const stats = allStats[i];
        console.log(`   ${i + 1}. @${stats.username}: ${stats.avgEngagement} avg (${stats.tweetsCount} tweets)`);
      }
      
      console.log("\n📝 Activity Summary:");
      const totalTweets = allStats.reduce((sum, s) => sum + s.tweetsCount, 0);
      console.log(`   Total tweets: ${totalTweets}`);
      console.log(`   Most active: @${allStats[0].username} (${allStats[0].tweetsCount} tweets)`);
      
      console.log("\n🔥 Top Performing Tweet:");
      const bestTweet = allStats.reduce((best, s) => 
        s.topTweet.engagement > best.topTweet.engagement ? s : best
      , allStats[0]);
      console.log(`   @${bestTweet.username}: ${bestTweet.topTweet.text.substring(0, 100)}...`);
      console.log(`   Engagement: ${bestTweet.topTweet.engagement}`);
      
      console.log("\n📌 Common Topics:");
      const topicCounts = new Map<string, number>();
      for (const stats of allStats) {
        for (const topic of stats.topics) {
          topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
        }
      }
      const sortedTopics = [...topicCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      for (const [topic, count] of sortedTopics) {
        console.log(`   ${topic}: ${count} competitors`);
      }
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
