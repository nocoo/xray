/**
 * Sentiment Analysis Script
 * 
 * Analyzes the sentiment of tweets about a specific topic.
 * Uses engagement metrics to infer positive/negative sentiment.
 * 
 * Usage:
 *   bun run agent/research/sentiment-analysis.ts --topic "AI" --count 50
 */

import { getAgentClient } from "../lib/agent-api";

interface Args {
  topic?: string;
  count?: number;
  help?: boolean;
}

interface SentimentResult {
  author: string;
  engagement: number;
  text: string;
  sentiment: "positive" | "negative" | "neutral";
  score: number;
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
Sentiment Analysis Script
=========================

Analyzes the sentiment of tweets about a specific topic.

Usage:
  bun run agent/research/sentiment-analysis.ts --topic "AI" --count 50

Options:
  --topic, -t      Topic to analyze (required)
  --count, -c      Number of tweets to analyze (default: 50)
  --help, -h       Show this help message

Examples:
  bun run agent/research/sentiment-analysis.ts --topic "AI"
  bun run agent/research/sentiment-analysis.ts -t "Crypto" -c 100
`);
}

/**
 * Simple sentiment analysis based on engagement metrics and keywords.
 * In a real implementation, you would use an ML model.
 */
export function analyzeSentiment(text: string, engagement: number): SentimentResult {
  const lowerText = text.toLowerCase();
  
  // Positive keywords
  const positiveWords = [
    "great", "amazing", "love", "best", "excellent", "awesome", "excited",
    "happy", "wonderful", "fantastic", "good", "nice", "beautiful", "success",
    "win", "winning", "perfect", "brilliant", "impressive", "innovative"
  ];
  
  // Negative keywords
  const negativeWords = [
    "bad", "terrible", "awful", "hate", "worst", "horrible", "sad", "angry",
    "fail", "failed", "failing", "loss", "losing", "wrong", "stupid", "dumb",
    "ugly", "disaster", "crash", "crashed", "broken", "bug", "error", "problem"
  ];
  
  // Calculate keyword scores
  let positiveScore = 0;
  let negativeScore = 0;
  
  for (const word of positiveWords) {
    if (lowerText.includes(word)) positiveScore += 1;
  }
  
  for (const word of negativeWords) {
    if (lowerText.includes(word)) negativeScore += 1;
  }
  
  // Determine sentiment
  let sentiment: "positive" | "negative" | "neutral";
  let score: number;
  
  if (positiveScore > 0 && negativeScore > 0) {
    sentiment = "negative";
    score = (negativeScore - positiveScore) + (engagement / 1000);
  } else if (positiveScore > negativeScore) {
    sentiment = "positive";
    score = (positiveScore - negativeScore) + (engagement / 1000);
  } else if (negativeScore > positiveScore) {
    sentiment = "negative";
    score = (negativeScore - positiveScore) + (engagement / 1000);
  } else {
    sentiment = "neutral";
    score = engagement / 1000;
  }
  
  return {
    author: "", // Will be set by caller
    engagement,
    text,
    sentiment,
    score: Math.round(score * 100) / 100,
  };
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
    
    console.log(`\n🔍 Analyzing sentiment for "${args.topic}"...`);
    console.log(`   Analyzing ${count} tweets\n`);
    
    // Fetch tweets
    const tweets = await client.searchTweets(args.topic, count, true);
    
    if (tweets.length === 0) {
      console.log("   No tweets found for this topic.\n");
      return;
    }
    
    // Analyze sentiment for each tweet
    const results: SentimentResult[] = [];
    
    for (const tweet of tweets) {
      const engagement = tweet.metrics.like_count + 
                        tweet.metrics.retweet_count * 2 + 
                        tweet.metrics.reply_count;
      
      const analysis = analyzeSentiment(tweet.text, engagement);
      analysis.author = tweet.author.username;
      analysis.text = tweet.text;
      
      results.push(analysis);
    }
    
    // Sort by score
    results.sort((a, b) => b.score - a.score);
    
    // Categorize
    const positive = results.filter(r => r.sentiment === "positive");
    const negative = results.filter(r => r.sentiment === "negative");
    const neutral = results.filter(r => r.sentiment === "neutral");
    
    // Display results
    console.log("=== Sentiment Summary ===\n");
    console.log(`Total tweets analyzed: ${tweets.length}`);
    console.log(`Positive: ${positive.length} (${((positive.length / tweets.length) * 100).toFixed(1)}%)`);
    console.log(`Negative: ${negative.length} (${((negative.length / tweets.length) * 100).toFixed(1)}%)`);
    console.log(`Neutral:  ${neutral.length} (${((neutral.length / tweets.length) * 100).toFixed(1)}%)`);
    
    console.log("\n=== Most Positive Tweets ===\n");
    for (const tweet of positive.slice(0, 5)) {
      console.log(`@${tweet.author}: ${tweet.text.substring(0, 100)}...`);
      console.log(`   Score: ${tweet.score} | ❤️ ${tweet.engagement}\n`);
    }
    
    console.log("=== Most Negative Tweets ===\n");
    for (const tweet of negative.slice(0, 5)) {
      console.log(`@${tweet.author}: ${tweet.text.substring(0, 100)}...`);
      console.log(`   Score: ${tweet.score} | ❤️ ${tweet.engagement}\n`);
    }
    
    // Overall sentiment
    const overallScore = 
      (positive.length * 1 + neutral.length * 0 + negative.length * -1) / tweets.length;
    
    let overallSentiment = "😐 Neutral";
    if (overallScore > 0.2) overallSentiment = "😊 Positive";
    else if (overallScore > 0.1) overallSentiment = "🙂 Slightly Positive";
    else if (overallScore < -0.2) overallSentiment = "😞 Negative";
    else if (overallScore < -0.1) overallSentiment = "😕 Slightly Negative";
    
    console.log(`\n=== Overall Sentiment ===`);
    console.log(`${overallSentiment} (score: ${overallScore.toFixed(2)})`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
