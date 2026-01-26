import { existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { join, basename } from "path";

const REPORTS_DIR = join(import.meta.dir, "../reports");
const OBSIDIAN_DIR = "/Users/nocoo/workspace/personal/obsidian/xray";

function getLatestReport(): string | null {
  if (!existsSync(REPORTS_DIR)) return null;

  const files = readdirSync(REPORTS_DIR)
    .filter((f) => f.startsWith("xray_") && f.endsWith(".md"))
    .sort()
    .reverse();

  return files.length > 0 ? join(REPORTS_DIR, files[0]) : null;
}

function syncToObsidian(reportPath: string): void {
  if (!existsSync(OBSIDIAN_DIR)) {
    mkdirSync(OBSIDIAN_DIR, { recursive: true });
    console.log(`📁 Created directory: ${OBSIDIAN_DIR}`);
  }

  const destPath = join(OBSIDIAN_DIR, basename(reportPath));
  copyFileSync(reportPath, destPath);
  console.log(`✅ Synced to Obsidian: ${destPath}`);
}

const reportPath = process.argv[2] || getLatestReport();

if (!reportPath) {
  console.error("❌ No report found to sync");
  process.exit(1);
}

if (!existsSync(reportPath)) {
  console.error(`❌ Report not found: ${reportPath}`);
  process.exit(1);
}

syncToObsidian(reportPath);
