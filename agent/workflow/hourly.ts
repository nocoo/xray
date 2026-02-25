/**
 * Hourly Analysis Workflow
 *
 * Main workflow that:
 * 1. Fetches new tweets (incremental)
 * 2. Analyzes with AI
 * 3. Generates report
 * 4. Saves to Obsidian
 * 5. Sends to Slack
 */

import { resolve } from "path";
import { existsSync, writeFileSync, readFileSync } from "fs";
import { nowISO } from "../../scripts/lib/utils";
import { writeAgentOutput } from "../lib/agent-output";
import { fetchIncremental, IncrementalOptions } from "../fetch/incremental";
import { analyzeTweets, generateMarkdownReport, AnalyzeOptions } from "../analyze/ai-analyze";
import type { AnalysisReport } from "../analyze/ai-analyze";

export interface WorkflowOptions {
  fetchOptions?: IncrementalOptions;
  analyzeOptions?: AnalyzeOptions;
  dryRun?: boolean;
}

const OBSIDIAN_DIR = resolve(__dirname, "..", "..", "..", "obsidian");
const REPORTS_DIR = resolve(OBSIDIAN_DIR, "potato", "hourly-reports");
const SLACK_CHANNEL = "#studio";

/**
 * Save report to Obsidian
 */
async function saveToObsidian(report: AnalysisReport, mdContent: string): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const timeStr = new Date().toISOString().slice(11, 16).replace(/:/g, "");
  const filename = `report_${dateStr}_${timeStr}.md`;
  const filepath = resolve(REPORTS_DIR, filename);

  // Ensure directory exists
  if (!existsSync(REPORTS_DIR)) {
     
    console.log("[potato] Creating reports directory...");
  }

  writeFileSync(filepath, mdContent, "utf-8");

  // Also update index
  const indexPath = resolve(REPORTS_DIR, "index.md");
  let indexContent = "# Hourly Reports\n\n";
  indexContent += `Last updated: ${nowISO()}\n\n`;
  indexContent += "## Reports\n";
  indexContent += `| Date | Time | File |\n`;
  indexContent += "|------|------|------|\n";

  if (existsSync(indexPath)) {
    const existing = readFileSync(indexPath, "utf-8");
    indexContent = existing;
    // Remove old table and add new entry
    const parts = existing.split("## Reports\n");
    if (parts.length > 1) {
      indexContent = parts[0] + "## Reports\n" + `| ${dateStr} | ${timeStr} | [${filename}](./${filename}) |\n` + parts[1];
    }
  } else {
    indexContent += `| ${dateStr} | ${timeStr} | [${filename}](./${filename}) |\n`;
  }

  writeFileSync(indexPath, indexContent, "utf-8");

  return filepath;
}

/**
 * Send summary to Slack
 */
async function sendToSlack(report: AnalysisReport): Promise<boolean> {
  try {
    // Import message function
    // @ts-expect-error - external runtime tool
    const { message } = await import("../../../../.cursor/tools/clawdbot.js");
    
    // Send a summary (first part of report)
    const summary = `**Potato Hourly Report** 🌟

📊 **统计**
- 分析推文: ${report.totalAnalyzed} 条
- 精选推文: ${report.selectedCount} 条
- 时间范围: ${report.timeRange.from.slice(11, 16)} - ${report.timeRange.to.slice(11, 16)}

📁 **完整报告已保存**到 Obsidian`;

    await message({
      action: "send",
      channel: "slack",
      target: SLACK_CHANNEL,
      message: summary,
    });

    return true;
  } catch (err) {
     
    console.error("[potato] Failed to send to Slack:", err);
    return false;
  }
}

/**
 * Main hourly workflow
 */
export async function runHourlyWorkflow(
  options: WorkflowOptions = {}
): Promise<{
  success: boolean;
  fetched: number;
  analyzed: number;
  reportPath?: string;
  slackSent: boolean;
  outputPath?: string;
}> {
  const startTime = Date.now();
   
  console.log(`[potato] Starting hourly workflow at ${nowISO()}...`);

  const { fetchOptions = {}, analyzeOptions = {}, dryRun = false } = options;

  let fetchedCount = 0;
  let analyzedCount = 0;
  let reportPath: string | undefined;
  let outputPath: string | undefined;
  let slackSent = false;

  try {
    // Step 1: Fetch new tweets (incremental)
     
    console.log("[potato] Step 1: Fetching new tweets...");
    const fetchResult = await fetchIncremental({
      hoursBack: 1,
      batchSize: 20,
      delayMs: 500,
      ...fetchOptions,
    });
    fetchedCount = fetchResult.newTweets;
     
    console.log(`[potato]   Fetched ${fetchedCount} new tweets`);

    // Step 2: Analyze with AI
     
    console.log("[potato] Step 2: Analyzing with AI...");
    const analyzeResult = await analyzeTweets({
      hoursBack: 1,
      limit: 100,
      topN: 20,
      translateToChinese: true,
      ...analyzeOptions,
    });

    if (analyzeResult.data) {
      analyzedCount = analyzeResult.data.selectedCount;

      // Step 3: Generate markdown report
       
      console.log("[potato] Step 3: Generating report...");
      const mdContent = generateMarkdownReport(analyzeResult.data);

      const output = {
        generated_at: nowISO(),
        summary: {
          fetched: fetchedCount,
          analyzed: analyzedCount,
        },
        report: analyzeResult.data,
      };
      outputPath = await writeAgentOutput("hourly_workflow", output);

      if (!dryRun) {
        // Step 4: Save to Obsidian
         
        console.log("[potato] Step 4: Saving to Obsidian...");
        reportPath = await saveToObsidian(analyzeResult.data, mdContent);
         
        console.log(`[potato]   Saved to: ${reportPath}`);

        // Step 5: Send to Slack
         
        console.log("[potato] Step 5: Sending to Slack...");
        slackSent = await sendToSlack(analyzeResult.data);
         
        console.log(`[potato]   Slack sent: ${slackSent}`);
      }
    } else {
       
      console.log("[potato]   No new tweets to analyze");
    }

    const duration = Date.now() - startTime;
     
    console.log(`[potato] Workflow complete in ${duration}ms`);
     
    console.log(`[potato]   Fetched: ${fetchedCount}`);
     
    console.log(`[potato]   Analyzed: ${analyzedCount}`);

    return {
      success: true,
      fetched: fetchedCount,
      analyzed: analyzedCount,
      reportPath,
      slackSent,
      outputPath,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
     
    console.error(`[potato] Workflow failed: ${error}`);

    return {
      success: false,
      fetched: fetchedCount,
      analyzed: analyzedCount,
      slackSent,
      outputPath,
    };
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  let dryRun = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  const result = await runHourlyWorkflow({ dryRun });

   
  console.log("\n=== Final Result ===");
   
  console.log(`Success: ${result.success}`);
   
  console.log(`Fetched: ${result.fetched}`);
   
  console.log(`Analyzed: ${result.analyzed}`);
  if (result.reportPath) {
     
    console.log(`Report: ${result.reportPath}`);
  }
  if (result.outputPath) {
     
    console.log(`Output: ${result.outputPath}`);
  }
   
  console.log(`Slack: ${result.slackSent ? "✓" : "✗"}`);

  process.exit(result.success ? 0 : 1);
}

if (import.meta.main) {
  main().catch((err) => {
     
    console.error("Error:", err.message);
    process.exit(1);
  });
}
