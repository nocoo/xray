/**
 * Viral Tweet Analyzer Script
 * 
 * Analyzes why certain tweets go viral based on engagement metrics,
 * content patterns, and timing.
 * 
 * Usage:
 *   bun run agent/research/viral-tweet-analyzer.ts --topic "AI" --count 20
 */

import { loadConfig } from "../../scripts/lib/utils";
import { createAPIClient } from "../../scripts/lib/api";

interface Args {
  topic?: string;
  count?: number;
  help?: boolean;
}

interface AnalysisResult {
  tweet: {
    id: string;
    author: string;
    text: string;
    engagement: number;
    metrics: {
      likes: number;
      retweets: number;
      replies: number;
      views: number;
    };
  };
  viralityScore: number;
  viralFactors: string[];
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
    } else if (arg === "--count" || arg === "-c") {
      args.count = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  
  return args;
}

function printHelp() {
  console.log(`
Viral Tweet Analyzer
====================

Analyzes why certain tweets go viral.

Usage:
  bun run agent/research/viral-tweet-analyzer.ts --topic "AI" --count 20

Options:
  --topic, -t      Topic to analyze (required)
  --count, -c      Number of tweets to analyze (default: 20)
  --help, -h       Show this help message

Examples:
  bun run agent/research/viral-tweet-analyzer.ts --topic "AI"
  bun run agent/research/viral-tweet-analyzer.ts -t "Crypto" -c 50
`);
}

function calculateViralityScore(metrics: {
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  followers: number;
  hasMedia: boolean;
  hasLink: boolean;
  hasHashtags: number;
}): number {
  // Engagement rate is key for virality
  const engagement = metrics.likes + metrics.retweets * 2 + metrics.retweets;
  const engagementRate = metrics.views > 0 ? (engagement / metrics.views) * 100 : 0;
  
  // RT ratio (retweets / likes) - high RT ratio indicates viral content
  const rtRatio = metrics.likes > 0 ? metrics.retweets / metrics.likes : 0;
  
  // Reply ratio - high reply ratio indicates controversial/discussable content
  const replyRatio = metrics.likes > 0 ? metrics.replies / metrics.likes : 0;
  
  // Boost factors
  let score = engagementRate * 10; // Base score from engagement rate
  
  if (rtRatio > 0.3) score += 10; // High RT ratio bonus
  if (rtRatio > 0.5) score += 15; // Very high RT ratio bonus
  if (replyRatio > 0.2) score += 5; // Discussion-worthy bonus
  if (metrics.hasMedia) score += 5; // Media bonus
  if (metrics.hasLink) score += 3; // Link bonus
  if (metrics.hasHashtags >= 3) score += 3; // Hashtag bonus
  
  return Math.round(score * 10) / 10;
}

function identifyViralFactors(metrics: {
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  followers: number;
  hasMedia: boolean;
  hasLink: boolean;
  hasHashtags: number;
  text: string;
}): string[] {
  const factors: string[] = [];
  const engagement = metrics.likes + metrics.retweets * 2 + metrics.replies;
  const engagementRate = metrics.views > 0 ? (engagement / metrics.views) * 100 : 0;
  
  // High engagement rate
  if (engagementRate > 5) factors.push("🚀 Exceptional engagement rate");
  else if (engagementRate > 2) factors.push("📈 High engagement rate");
  
  // High RT ratio
  const rtRatio = metrics.likes > 0 ? metrics.retweets / metrics.likes : 0;
  if (rtRatio > 0.5) factors.push("🔄 Viral RT ratio (>50%)");
  else if (rtRatio > 0.3) factors.push("📢 Strong shareability");
  
  // High reply ratio
  const replyRatio = metrics.likes > 0 ? metrics.replies / metrics.likes : 0;
  if (replyRatio > 0.3) factors.push("💬 Sparks discussion");
  else if (replyRatio > 0.2) factors.push("💭 Generates conversation");
  
  // Media
  if (metrics.hasMedia) factors.push("📸 Visual content");
  
  // Links
  if (metrics.hasLink) factors.push("🔗 Contains link");
  
  // Hashtags
  if (metrics.hasHashtags >= 3) factors.push("#️⃣ Multi-hashtag strategy");
  else if (metrics.hasHashtags >= 1) factors.push("#️⃣ Uses hashtags");
  
  // Text patterns
  const text = metrics.text.toLowerCase();
  if (text.includes("!")) factors.push("❗ Exciting tone");
  if (text.includes("?")) factors.push("❓ Questions engage");
  if (text.length < 100) factors.push("📝 Concise message");
  if (text.includes("breaking")) factors.push("🔥 Breaking news");
  if (text.includes("announce") || text.includes("announcing")) factors.push("📣 Announcement");
  
  // Large following
  if (metrics.followers > 100000) factors.push("👥 Large audience");
  else if (metrics.followers > 10000) factors.push("👤 Significant following");
  
  return factors;
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
    
    const count = args.count || 20;
    
    console.log(`\n🔬 Analyzing viral tweets for "${args.topic}"...`);
    console.log(`   Analyzing ${count} tweets\n`);
    
    // Fetch tweets sorted by top engagement
    const tweets = await client.searchTweets(args.topic, count, true);
    
    if (tweets.length === 0) {
      console.log("   No tweets found for this topic.\n");
      return;
    }
    
    // Analyze each tweet
    const results: AnalysisResult[] = [];
    
    for (const tweet of tweets) {
      const engagement = tweet.metrics.like_count + 
                        tweet.metrics.retweet_count * 2 + 
                        tweet.metrics.reply_count;
      
      const metrics = {
        likes: tweet.metrics.like_count,
        retweets: tweet.metrics.retweet_count,
        replies: tweet.metrics.reply_count,
        views: tweet.metrics.view_count,
        followers: tweet.author.followers_count || 0,
        hasMedia: (tweet.media?.length || 0) > 0,
        hasLink: (tweet.entities?.urls?.length || 0) > 0,
        hasHashtags: tweet.entities?.hashtags?.length || 0,
        text: tweet.text,
      };
      
      const viralityScore = calculateViralityScore(metrics);
      const viralFactors = identifyViralFactors(metrics);
      
      results.push({
        tweet: {
          id: tweet.id,
          author: tweet.author.username,
          text: tweet.text.substring(0, 150) + (tweet.text.length > 150 ? "..." : ""),
          engagement,
          metrics: {
            likes: tweet.metrics.like_count,
            retweets: tweet.metrics.retweet_count,
            replies: tweet.metrics.reply_count,
            views: tweet.metrics.view_count,
          },
        },
        viralityScore,
        viralFactors,
      });
    }
    
    // Sort by virality score
    results.sort((a, b) => b.viralityScore - a.viralityScore);
    
    // Display top viral tweets
    console.log("=== Top Viral Tweets ===\n");
    
    for (let i = 0; i < Math.min(results.length, 10); i++) {
      const result = results[i];
      console.log(`${i + 1}. @${result.tweet.author} (Virality: ${result.viralityScore})`);
      console.log(`   "${result.tweet.text}"`);
      console.log(`   ❤️ ${result.tweet.metrics.likes} | 🔁 ${result.tweet.metrics.retweets} | 💬 ${result.tweet.metrics.replies} | 👁 ${result.tweet.metrics.views}`);
      
      if (result.viralFactors.length > 0) {
        console.log(`   Key factors:`);
        for (const factor of result.viralFactors.slice(0, 4)) {
          console.log(`     • ${factor}`);
        }
      }
      console.log("");
    }
    
    // Summary statistics
    const avgVirality = results.reduce((sum, r) => sum + r.viralityScore, 0) / results.length;
    const avgEngagement = results.reduce((sum, r) => sum + r.tweet.engagement, 0) / results.length;
    
    // Factor frequency analysis
    const factorCounts = new Map<string, number>();
    for (const result of results) {
      for (const factor of result.viralFactors) {
        factorCounts.set(factor, (factorCounts.get(factor) || 0) + 1);
      }
    }
    
    const topFactors = [...factorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    console.log("=== Summary Statistics ===\n");
    console.log(`Average virality score: ${avgVirality.toFixed(1)}`);
    console.log(`Average engagement: ${Math.round(avgEngagement)}`);
    
    console.log("\n=== Common Viral Factors ===\n");
    for (const [factor, count] of topFactors) {
      const percentage = ((count / results.length) * 100).toFixed(1);
      console.log(`   ${factor}: ${count} tweets (${percentage}%)`);
    }
    
    console.log("\n=== Recommendations ===\n");
    const recommendations: string[] = [];
    
    // Find top factor
    if (topFactors.length > 0) {
      const topFactor = topFactors[0][0];
      if (topFactor.includes("media")) {
        recommendations.push("📸 Include visual content (images/video)");
      }
      if (topFactor.includes("hashtag")) {
        recommendations.push("#️⃣ Use multiple relevant hashtags");
      }
      if (topFactor.includes("discussion") || topFactor.includes("conversation")) {
        recommendations.push("💬 Create content that sparks discussion");
      }
      if (topFactor.includes("RT ratio") || topFactor.includes("shareability")) {
        recommendations.push("🔄 Make content highly shareable");
      }
    }
    
    // Add general recommendations
    recommendations.push("📊 Post when audience is most active");
    recommendations.push("🎯 Keep message concise and clear");
    recommendations.push("⏰ Use trending topics/context");
    
    for (const rec of recommendations) {
      console.log(`   • ${rec}`);
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
