/**
 * Render Report Script
 *
 * Renders a report JSON file to HTML using templates
 *
 * Usage:
 *   bun run scripts/render-report.ts                     # Render latest report
 *   bun run scripts/render-report.ts data/output/2026-01-21_report.json
 *   bun run scripts/render-report.ts --serve             # Render and start server
 */

import { join, basename } from "path";
import type { ReportFile, ReportTweet, CommandResult } from "./lib/types";
import { readJsonFile, fileExists, PROJECT_ROOT } from "./lib/utils";

// =============================================================================
// Constants
// =============================================================================

const TEMPLATES_DIR = join(PROJECT_ROOT, "templates");
const PUBLIC_DIR = join(PROJECT_ROOT, "public");
const OUTPUT_DIR = join(PROJECT_ROOT, "data/output");
const DEFAULT_TEMPLATE = "report.html";

// =============================================================================
// Template Engine (Simple Mustache-like)
// =============================================================================

export interface TemplateData {
  date: string;
  time_range: string;
  generated_at: string;
  total_fetched: number;
  tech_related: number;
  hot_topics: number;
  filtered_count: number;
  categories: { name: string; count: number }[];
  tweets: ProcessedTweet[];
}

export interface ProcessedMedia {
  type: "PHOTO" | "VIDEO" | "GIF";
  url: string;
  thumbnail_url?: string;
}

export interface ProcessedQuotedTweet {
  id: string;
  url: string;
  author_name: string;
  author_username: string;
  author_profile_image_url?: string;
  author_initial: string;
  text: string;
  text_html: string;
  has_media: boolean;
  media: ProcessedMedia[];
}

export interface ProcessedTweet extends ReportTweet {
  text_html: string;
  score_class: string;
  created_at_formatted: string;
  author: ReportTweet["author"] & { initial: string };
  has_media: boolean;
  media_list: ProcessedMedia[];
  has_photos: boolean;
  photos: ProcessedMedia[];
  has_video: boolean;
  video?: ProcessedMedia;
  has_quoted: boolean;
  quoted?: ProcessedQuotedTweet;
}

/**
 * Simple template engine supporting:
 * - {{variable}} - simple replacement
 * - {{#array}}...{{/array}} - iteration
 * - {{^array}}...{{/array}} - inverted section (if empty)
 * - {{.}} - current item in array
 */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  let result = template;

  // Handle sections (arrays and conditionals)
  result = result.replace(
    /\{\{#(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key, content) => {
      const value = getNestedValue(data, key);
      if (Array.isArray(value)) {
        return value
          .map((item) => {
            if (typeof item === "string" || typeof item === "number") {
              // For simple arrays, replace {{.}} with the item
              return content.replace(/\{\{\.\}\}/g, String(item));
            }
            return renderTemplate(content, item as Record<string, unknown>);
          })
          .join("");
      }
      if (value) {
        return renderTemplate(content, typeof value === "object" ? value as Record<string, unknown> : data);
      }
      return "";
    }
  );

  // Handle inverted sections (if empty/falsy)
  result = result.replace(
    /\{\{\^(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, key, content) => {
      const value = getNestedValue(data, key);
      if (!value || (Array.isArray(value) && value.length === 0)) {
        return content;
      }
      return "";
    }
  );

  // Handle raw HTML variable replacements (triple mustache - no escaping)
  result = result.replace(/\{\{\{(\w+(?:\.\w+)*)\}\}\}/g, (_, key) => {
    const value = getNestedValue(data, key);
    if (value === undefined || value === null) {
      return "";
    }
    return String(value);
  });

  // Handle simple variable replacements (double mustache - escaped)
  result = result.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
    const value = getNestedValue(data, key);
    if (value === undefined || value === null) {
      return "";
    }
    return escapeHtml(String(value));
  });

  return result;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =============================================================================
// Data Processing
// =============================================================================

export function processReportData(report: ReportFile): TemplateData {
  const date = report.generated_at.split("T")[0];
  const fromDate = new Date(report.time_range.from);
  const toDate = new Date(report.time_range.to);

  const timeRange = `${formatDate(fromDate)} - ${formatDate(toDate)}`;

  const categories = Object.entries(report.summary.categories)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const tweets = report.filtered_tweets.map((tweet) => processTweet(tweet));

  return {
    date,
    time_range: timeRange,
    generated_at: formatDateTime(new Date(report.generated_at)),
    total_fetched: report.summary.total_fetched,
    tech_related: report.summary.tech_related,
    hot_topics: report.summary.hot_topics,
    filtered_count: report.filtered_tweets.length,
    categories,
    tweets,
  };
}

function processTweet(tweet: ReportTweet): ProcessedTweet {
  const score = tweet.classification.relevance_score;
  let scoreClass = "score-low";
  if (score >= 80) {
    scoreClass = "score-high";
  } else if (score >= 50) {
    scoreClass = "score-medium";
  }

  const mediaList: ProcessedMedia[] = (tweet.media ?? []).map((m) => ({
    type: m.type,
    url: m.url,
    thumbnail_url: m.thumbnail_url,
  }));

  const photos = mediaList.filter((m) => m.type === "PHOTO");
  const video = mediaList.find((m) => m.type === "VIDEO" || m.type === "GIF");

  let quoted: ProcessedQuotedTweet | undefined;
  if (tweet.quoted_tweet) {
    const qt = tweet.quoted_tweet;
    const qtMediaList: ProcessedMedia[] = (qt.media ?? []).map((m) => ({
      type: m.type,
      url: m.url,
      thumbnail_url: m.thumbnail_url,
    }));
    quoted = {
      id: qt.id,
      url: qt.url,
      author_name: qt.author.name,
      author_username: qt.author.username,
      author_profile_image_url: qt.author.profile_image_url,
      author_initial: qt.author.name.charAt(0).toUpperCase(),
      text: qt.text,
      text_html: linkifyText(qt.text),
      has_media: qtMediaList.length > 0,
      media: qtMediaList,
    };
  }

  return {
    ...tweet,
    text_html: linkifyText(tweet.text),
    score_class: scoreClass,
    created_at_formatted: formatDateTime(new Date(tweet.created_at)),
    author: {
      ...tweet.author,
      initial: tweet.author.name.charAt(0).toUpperCase(),
    },
    has_media: mediaList.length > 0,
    media_list: mediaList,
    has_photos: photos.length > 0,
    photos,
    has_video: !!video,
    video,
    has_quoted: !!quoted,
    quoted,
  };
}

function linkifyText(text: string): string {
  // Convert URLs to links
  let result = text.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>'
  );

  // Convert @mentions to links
  result = result.replace(
    /@(\w+)/g,
    '<a href="https://x.com/$1" target="_blank" rel="noopener">@$1</a>'
  );

  // Convert #hashtags to links
  result = result.replace(
    /#(\w+)/g,
    '<a href="https://x.com/hashtag/$1" target="_blank" rel="noopener">#$1</a>'
  );

  return result;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// =============================================================================
// Core Functions
// =============================================================================

export async function findLatestReport(): Promise<string | null> {
  const glob = new Bun.Glob("*_report.json");
  const files: string[] = [];

  for await (const file of glob.scan(OUTPUT_DIR)) {
    files.push(file);
  }

  if (files.length === 0) {
    return null;
  }

  // Sort by filename (date) descending
  files.sort((a, b) => b.localeCompare(a));
  return join(OUTPUT_DIR, files[0]);
}

export async function renderReport(
  reportPath?: string,
  templateName: string = DEFAULT_TEMPLATE
): Promise<CommandResult<{ html: string; outputPath: string }>> {
  // Find report file
  let actualReportPath = reportPath;
  if (!actualReportPath) {
    const latest = await findLatestReport();
    if (!latest) {
      return {
        success: false,
        message: "No report files found in data/output/",
        error: "NO_REPORTS",
      };
    }
    actualReportPath = latest;
  }

  if (!(await fileExists(actualReportPath))) {
    return {
      success: false,
      message: `Report file not found: ${actualReportPath}`,
      error: "FILE_NOT_FOUND",
    };
  }

  // Load template
  const templatePath = join(TEMPLATES_DIR, templateName);
  if (!(await fileExists(templatePath))) {
    return {
      success: false,
      message: `Template not found: ${templatePath}`,
      error: "TEMPLATE_NOT_FOUND",
    };
  }

  const template = await Bun.file(templatePath).text();
  const report = await readJsonFile<ReportFile>(actualReportPath);

  // Process and render
  const data = processReportData(report);
  const html = renderTemplate(template, data as unknown as Record<string, unknown>);

  // Write to public directory
  const reportName = basename(actualReportPath, ".json");
  const outputPath = join(PUBLIC_DIR, `${reportName}.html`);
  await Bun.write(outputPath, html);

  // Also write as index.html for easy access
  await Bun.write(join(PUBLIC_DIR, "index.html"), html);

  return {
    success: true,
    message: `Rendered report to ${outputPath}`,
    data: { html, outputPath },
  };
}

export async function startServer(port: number = 3000): Promise<void> {
  console.log(`Starting server at http://localhost:${port}`);

  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      let filePath = join(PUBLIC_DIR, url.pathname);

      // Default to index.html
      if (url.pathname === "/" || url.pathname === "") {
        filePath = join(PUBLIC_DIR, "index.html");
      }

      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`Server running. Press Ctrl+C to stop.`);
}

// =============================================================================
// CLI Handler
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  let reportPath: string | undefined;
  let shouldServe = false;
  let port = 3000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--serve" || args[i] === "-s") {
      shouldServe = true;
    } else if (args[i] === "--port" || args[i] === "-p") {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (!args[i].startsWith("-")) {
      reportPath = args[i];
    }
  }

  const result = await renderReport(reportPath);
  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    process.exit(1);
  }

  if (shouldServe) {
    await startServer(port);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
  });
}
