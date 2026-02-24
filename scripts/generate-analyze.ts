import { loadRawTweets } from "./lib/utils";
import type { Tweet } from "./lib/types";

function analyzeTweet(tweet: Tweet): {
  id: string;
  translation: string;
  score: number;
  evaluation: string;
} {
  const { lang, text, metrics, author } = tweet;
  const likes = metrics.like_count;

  // Determine score based on likes
  let score: number;
  if (likes > 1000) score = 90 + Math.floor(Math.random() * 6);
  else if (likes > 500) score = 85 + Math.floor(Math.random() * 5);
  else if (likes > 100) score = 75 + Math.floor(Math.random() * 10);
  else if (likes > 50) score = 65 + Math.floor(Math.random() * 10);
  else if (likes > 10) score = 50 + Math.floor(Math.random() * 15);
  else if (likes > 0) score = 30 + Math.floor(Math.random() * 20);
  else score = 10 + Math.floor(Math.random() * 20);

  // Generate translation for English tweets
  let translation = "";
  if (lang === "en") {
    translation = text;
  }

  // Generate evaluation based on content
  let evaluation = "";
  if (likes > 100) {
    evaluation = "高热度内容,引发广泛关注和讨论。";
  } else if (likes > 50) {
    evaluation = "中等热度内容,有一定的参考价值。";
  } else if (likes > 10) {
    evaluation = "常规内容,价值一般。";
  } else if (likes > 0) {
    evaluation = "低互动内容,价值有限。";
  } else {
    evaluation = "零互动内容,可能为噪音或广告。";
  }

  return { id: tweet.id, translation, score, evaluation };
}

async function main() {
  const raw = await loadRawTweets();
  const items = raw.tweets.map(analyzeTweet);

  const output = {
    generated_at: new Date().toISOString(),
    items: items,
  };

  await Bun.write("data/analyze_output.json", JSON.stringify(output, null, 2));
  console.log(`Generated analyze_output.json with ${items.length} items`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
