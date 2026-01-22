#!/usr/bin/env bun
import raw from "../data/raw_tweets.json" with { type: "json" };

interface Tweet {
  id: string;
  text: string;
  author: { username: string; name: string; followers_count: number };
  reply_to_id: string | null;
  created_at: string;
  metrics: { like_count: number; retweet_count: number; reply_count: number; view_count: number };
  url: string;
}

const tweets = raw.tweets as Tweet[];

// Build ID to tweet map
const tweetMap = new Map<string, Tweet>();
for (const t of tweets) {
  tweetMap.set(t.id, t);
}

// Find thread roots (tweets where author replies to their own tweet)
function findThreadRoot(tweet: Tweet): Tweet | null {
  if (!tweet.reply_to_id) return null;

  let currentId = tweet.reply_to_id;
  let visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const parent = tweetMap.get(currentId);
    if (!parent) return null; // Parent not in dataset

    if (parent.author.username === tweet.author.username) {
      // Same author, check if this parent also has a parent
      if (!parent.reply_to_id) {
        return parent; // Found root
      }
      currentId = parent.reply_to_id;
    } else {
      return null; // Different author, not a thread
    }
  }
  return null;
}

// Group tweets by thread
const threadMap = new Map<string, Tweet[]>();
const standaloneTweets: Tweet[] = [];
const processedIds = new Set<string>();

for (const tweet of tweets) {
  if (processedIds.has(tweet.id)) continue;

  const root = findThreadRoot(tweet);
  if (root) {
    if (!threadMap.has(root.id)) {
      threadMap.set(root.id, [root]);
      processedIds.add(root.id);
    }
    threadMap.get(root.id)!.push(tweet);
    processedIds.add(tweet.id);
  } else if (!tweet.reply_to_id) {
    // Standalone tweet (not a reply)
    standaloneTweets.push(tweet);
  }
}

// Count thread sizes
const threads: { root: Tweet; count: number; tweets: Tweet[] }[] = [];
for (const [rootId, threadTweets] of threadMap) {
  const root = tweetMap.get(rootId)!;
  threads.push({ root, count: threadTweets.length, tweets: threadTweets });
}

// Sort threads by size (more replies = more value)
threads.sort((a, b) => b.count - a.count);

console.log(`Total tweets: ${tweets.length}`);
console.log(`Threads found: ${threads.length}`);
console.log(`Standalone tweets: ${standaloneTweets.length}`);
console.log("\n=== Threads ===");
for (const t of threads) {
  console.log(`  ${t.root.author.username}: ${t.count} tweets - ${t.root.text.slice(0, 60)}...`);
}

// Select top 20 most valuable
// Prioritize: 1) Tech/AI content, 2) Thread depth, 3) Engagement, 4) Unique insights
const selected: { tweet_id: string; reason: string }[] = [];

// Helper: check if tweet is tech-related
function isTechRelated(tweet: Tweet): boolean {
  const keywords = ["AI", "Claude", "OpenAI", "GPT", "LLM", "代码", "编程", "开发", "技术", "skill", "Prompt", "API", "agent", "vibe", "coding", "软件", "工程师", "工程师", "产品"];
  const text = tweet.text.toLowerCase();
  return keywords.some(k => text.toLowerCase().includes(k.toLowerCase()));
}

// Helper: check if tweet has substance
function hasSubstance(tweet: Tweet): boolean {
  if (tweet.text.length < 50) return false;
  if (tweet.text.startsWith("@") && tweet.text.length < 100) return false;
  if (tweet.metrics.like_count === 0 && tweet.metrics.reply_count === 0 && tweet.metrics.view_count < 100) {
    return false; // Low engagement might mean low quality
  }
  return true;
}

// Add top threads first
for (const thread of threads) {
  if (selected.length >= 20) break;
  const root = thread.root;
  if (isTechRelated(root) || hasSubstance(root)) {
    selected.push({
      tweet_id: root.id,
      reason: `${root.author.username}: ${thread.count}条连续回复 - ${root.text.slice(0, 50)}...`
    });
  }
}

// Add standalone tweets
const filteredStandalone = standaloneTweets.filter(t => hasSubstance(t) && !t.text.startsWith("http"));
// Sort by engagement
filteredStandalone.sort((a, b) => {
  const scoreA = a.metrics.like_count + a.metrics.retweet_count * 2 + a.metrics.reply_count;
  const scoreB = b.metrics.like_count + b.metrics.retweet_count * 2 + b.metrics.reply_count;
  return scoreB - scoreA;
});

for (const tweet of filteredStandalone) {
  if (selected.length >= 20) break;
  const techBonus = isTechRelated(tweet) ? " [Tech]" : "";
  selected.push({
    tweet_id: tweet.id,
    reason: `${tweet.author.username}${techBonus}: ${tweet.text.slice(0, 60).replace(/\n/g, " ")}...`
  });
}

console.log(`\n=== Selected ${selected.length} ===`);
for (const s of selected) {
  console.log(`  ${s.tweet_id}: ${s.reason}`);
}

// Write output
const output = {
  classified_at: new Date().toISOString(),
  source_file: "data/raw_tweets.json",
  total_count: tweets.length,
  thread_count: threads.length,
  results: selected.slice(0, 20).map(s => ({ tweet_id: s.tweet_id, reason: s.reason }))
};

await Bun.write("data/classified.json", JSON.stringify(output, null, 2));
console.log("\n✅ Wrote data/classified.json");
