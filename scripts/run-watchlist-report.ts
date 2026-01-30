import { fetchAllTweets } from "./fetch-tweets";
import { loadAnalyzeOutput } from "./lib/utils";

async function main() {
  const fetchResult = await fetchAllTweets();
  if (!fetchResult.success) {
    console.error(fetchResult.message);
    process.exit(1);
  }

  const analyzeOutput = await loadAnalyzeOutput();
  if (!analyzeOutput) {
    console.log("⏳ Analyze required: analyze_output.json missing.");
    console.log("请先完成 analyze 并写入 data/analyze_output.json，然后再运行：");
    console.log("bun run scripts/validate-analyze-output.ts");
    console.log("bun run scripts/generate-watchlist-report.ts");
    return;
  }

  const { default: validate } = await import("./validate-analyze-output");
  await validate();
  const { default: generate } = await import("./generate-watchlist-report");
  await generate();
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
