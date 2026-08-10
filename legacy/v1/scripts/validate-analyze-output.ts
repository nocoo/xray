import { loadAnalyzeOutput, loadRawTweets } from "./lib/utils";

function ensureString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
}

function ensureNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} must be a number`);
  }
}

export default async function main() {
  const raw = await loadRawTweets();
  const analyze = await loadAnalyzeOutput();

  if (!analyze) {
    throw new Error("analyze_output.json not found");
  }

  ensureString(analyze.generated_at, "generated_at");

  const inputIds = new Set(raw.tweets.map((tweet) => tweet.id));
  const outputIds = new Set(analyze.items.map((item) => item.id));

  for (const id of inputIds) {
    if (!outputIds.has(id)) {
      throw new Error(`missing analysis for tweet id: ${id}`);
    }
  }

  for (const item of analyze.items) {
    ensureString(item.id, "item.id");
    ensureString(item.evaluation, `evaluation.${item.id}`);
    ensureString(item.translation, `translation.${item.id}`);
    ensureNumber(item.score, `score.${item.id}`);
    if (!Number.isInteger(item.score) || item.score < 0 || item.score > 100) {
      throw new Error(`score.${item.id} must be integer 0-100`);
    }

    const tweet = raw.tweets.find((t) => t.id === item.id);
    if (tweet && (tweet.lang || "").toLowerCase() === "en" && item.translation.trim() === "") {
      throw new Error(`translation required for English tweet: ${item.id}`);
    }
  }

  console.log(`✅ Analyze output valid: ${analyze.items.length} item(s)`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
