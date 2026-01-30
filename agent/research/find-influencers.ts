/**
 * Find Influencers Script
 * 
 * Finds influential users in a specific domain/topic by analyzing
 * engagement patterns and follower counts from search results.
 * 
 * Usage:
 *   bun run agent/research/find-influencers.ts --topic "AI" --count 20
 */

import { getAgentClient } from "../lib/agent-api";

interface Args {
  topic?: string;
  count?: number;
  minFollowers?: number;
  help?: boolean;
}

interface Influencer {
  username: string;
  name: string;
  followers: number;
  tweetsFound: number;
  avgEngagement: number;
  relevanceScore: number;
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
    } else if (arg === "--min-followers" || arg === "-m") {
      args.minFollowers = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  
  return args;
}

function printHelp() {
  console.log(`
Find Influencers Script
======================

Finds influential users in a specific domain/topic.

Usage:
  bun run agent/research/find-influencers.ts --topic "AI" --count 20

Options:
  --topic, -t          Topic to search for (required)
  --count, -c          Number of tweets to analyze (default: 50)
  --min-followers, -m  Minimum follower count (default: 1000)
  --help, -h           Show this help message

Examples:
  bun run agent/research/find-influencers.ts --topic "AI"
  bun run agent/research/find-influencers.ts -t "Machine Learning" -c 100 -m 5000
  bun run agent/research/find-influencers.ts --topic "Crypto" --min-followers 10000
`);
}

function calculateRelevanceScore(
  followers: number,
  avgEngagement: number,
  tweetsFound: number
): number {
  // Weighted scoring: followers (40%) + engagement (40%) + volume (20%)
  const logFollowers = Math.log10(followers + 1);
  const normalizedFollowers = Math.min(logFollowers / 6, 1); // Cap at 1M
  
  const engagementRate = followers > 0 ? (avgEngagement / followers) * 100 : 0;
  const normalizedEngagement = Math.min(engagementRate * 10, 1);
  
  const volumeScore = Math.min(tweetsFound / 10, 1);
  
  return (normalizedFollowers * 0.4 + normalizedEngagement * 0.4 + volumeScore * 0.2) * 100;
}

async function main() {
  const args = parseArgs();
  
  if (args.help || !args.topic) {
    printHelp();
    return;
  }
  
  try {
    const client = await getAgentClient();
    
    const count = args.count || 50;
    const minFollowers = args.minFollowers || 1000;
    
    console.log(`\n🔍 Finding influencers for "${args.topic}"...`);
    console.log(`   Analyzing ${count} tweets, min ${minFollowers} followers\n`);
    
    // Search for tweets in the topic
    const tweets = await client.searchTweets(args.topic, count, true);
    
    if (tweets.length === 0) {
      console.log("   No tweets found for this topic.");
      console.log("   Try a different topic or increase the count.\n");
      return;
    }
    
    // Aggregate data by user
    const userMap = new Map<string, {
      name: string;
      followers: number;
      tweets: number;
      totalEngagement: number;
    }>();
    
    for (const tweet of tweets) {
      const username = tweet.author.username;
      const engagement = tweet.metrics.like_count + tweet.metrics.retweet_count * 2;
      
      if (!userMap.has(username)) {
        userMap.set(username, {
          name: tweet.author.name,
          followers: tweet.author.followers_count || 0,
          tweets: 0,
          totalEngagement: 0,
        });
      }
      
      const user = userMap.get(username)!;
      user.tweets++;
      user.totalEngagement += engagement;
    }
    
    // Calculate scores and filter
    const influencers: Influencer[] = [];
    
    for (const [username, data] of userMap) {
      if (data.followers < minFollowers) continue;
      
      const avgEngagement = data.tweets > 0 ? data.totalEngagement / data.tweets : 0;
      const relevanceScore = calculateRelevanceScore(
        data.followers,
        avgEngagement,
        data.tweets
      );
      
      influencers.push({
        username,
        name: data.name,
        followers: data.followers,
        tweetsFound: data.tweets,
        avgEngagement: Math.round(avgEngagement),
        relevanceScore: Math.round(relevanceScore),
      });
    }
    
    // Sort by relevance score
    influencers.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    console.log(`📊 Found ${influencers.length} influencers:\n`);
    
    for (let i = 0; i < Math.min(influencers.length, 20); i++) {
      const inf = influencers[i];
      console.log(`${i + 1}. @${inf.username} (${inf.name})`);
      console.log(`   Followers: ${inf.followers.toLocaleString()} | ` +
                  `Tweets: ${inf.tweetsFound} | ` +
                  `Avg Engagement: ${inf.avgEngagement}`);
      console.log(`   Relevance Score: ${inf.relevanceScore}/100\n`);
    }
    
    // Summary
    console.log("=== Summary ===");
    console.log(`Total influencers found: ${influencers.length}`);
    console.log(`Top 5 avg followers: ${Math.round(
      influencers.slice(0, 5).reduce((sum, i) => sum + i.followers, 0) / 5
    ).toLocaleString()}`);
    console.log(`Top 5 avg engagement: ${Math.round(
      influencers.slice(0, 5).reduce((sum, i) => sum + i.avgEngagement, 0) / 5
    )}`);
    
    // Save results for follow-up
    const top5 = influencers.slice(0, 5).map(i => `@${i.username}`).join(", ");
    console.log(`\n💡 Suggested accounts to add to watchlist:`);
    console.log(`   ${top5}`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
