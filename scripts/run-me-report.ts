#!/usr/bin/env bun
// =============================================================================
// Run Personal Twitter Report (X-Ray Me)
// 
// Fetches personal Twitter data (analytics, bookmarks, likes, lists)
// and generates a markdown report. Usage: bun run run-me-report
// =============================================================================

import { spawn } from "child_process";

async function runScript(scriptPath: string, args: string[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", [scriptPath, ...args], {
      stdio: "inherit",
      cwd: import.meta.dir + "/..",
    });

    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Script ${scriptPath} exited with code ${code}`));
      } else {
        resolve(code);
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log("🚀 X-Ray Me Report Generator");
  console.log("=".repeat(60));
  console.log("");

  try {
    console.log("Step 1/2: Fetching personal Twitter data...");
    await runScript("scripts/fetch-me-data.ts");
    console.log("");

    console.log("Step 2/2: Generating markdown report...");
    await runScript("scripts/generate-me-report.ts");
    console.log("");

    console.log("✅ Report generation completed successfully!");
    console.log("");
    console.log("💡 Tip: Check the 'reports' directory for the generated report");
  } catch (err) {
    console.error("");
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
