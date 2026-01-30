import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { Config, RawTweetsFile, ClassifiedFile, ReportFile } from "./types";

// =============================================================================
// Path Constants
// =============================================================================

export const PROJECT_ROOT = join(import.meta.dir, "../..");
export const CONFIG_PATH = join(PROJECT_ROOT, "config/config.json");
export const RAW_TWEETS_PATH = join(PROJECT_ROOT, "data/raw_tweets.json");
export const CLASSIFIED_PATH = join(PROJECT_ROOT, "data/classified.json");
export const OUTPUT_DIR = join(PROJECT_ROOT, "data/output");
export const ANALYZE_OUTPUT_PATH = join(PROJECT_ROOT, "data/analyze_output.json");

// =============================================================================
// File Operations
// =============================================================================

export async function readJsonFile<T>(path: string): Promise<T> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`File not found: ${path}`);
  }
  return await file.json() as T;
}

export async function writeJsonFile<T>(path: string, data: T): Promise<void> {
  await Bun.write(path, JSON.stringify(data, null, 2));
}

export async function fileExists(path: string): Promise<boolean> {
  return await Bun.file(path).exists();
}

// =============================================================================
// Config Helpers
// =============================================================================

export async function loadConfig(): Promise<Config> {
  return await readJsonFile<Config>(CONFIG_PATH);
}

export async function loadRawTweets(): Promise<RawTweetsFile> {
  return await readJsonFile<RawTweetsFile>(RAW_TWEETS_PATH);
}

export async function saveRawTweets(data: RawTweetsFile): Promise<void> {
  await writeJsonFile(RAW_TWEETS_PATH, data);
}

export async function loadAnalyzeOutput(): Promise<{
  generated_at: string;
  items: {
    id: string;
    translation: string;
    score: number;
    evaluation: string;
  }[];
} | null> {
  const exists = await fileExists(ANALYZE_OUTPUT_PATH);
  if (!exists) return null;
  return await readJsonFile<{
    generated_at: string;
    items: {
      id: string;
      translation: string;
      score: number;
      evaluation: string;
    }[];
  }>(ANALYZE_OUTPUT_PATH);
}

export async function loadClassified(): Promise<ClassifiedFile> {
  return await readJsonFile<ClassifiedFile>(CLASSIFIED_PATH);
}

export async function saveReport(data: ReportFile, customOutputDir?: string): Promise<string> {
  const date = getLocalDateString();
  const filename = `${date}_report.json`;
  const outputDir = customOutputDir || OUTPUT_DIR;
  const path = join(outputDir, filename);
  await writeJsonFile(path, data);
  return path;
}

export async function saveWatchlistReport(mdContent: string, generatedAt: string): Promise<string> {
  const datePart = getLocalDateString(new Date(generatedAt)).replace(/-/g, "");
  const timePart = new Date(generatedAt)
    .toTimeString()
    .slice(0, 5)
    .replace(":", "");
  const filename = `xray_${datePart}_${timePart}.md`;
  const reportsDir = join(PROJECT_ROOT, "reports");
  if (!existsSync(reportsDir)) {
    mkdirSync(reportsDir, { recursive: true });
  }
  const path = join(reportsDir, filename);
  await Bun.write(path, mdContent);
  return path;
}

// =============================================================================
// Timezone Constants
// =============================================================================

// =============================================================================
// Date Helpers (Local Time)
// =============================================================================

export function nowISO(): string {
  return new Date().toISOString();
}

export function nowLocalISO(): string {
  return nowISO();
}

export function toLocalISOString(date: Date): string {
  return date.toISOString();
}

export function hoursAgoISO(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

export function hoursAgoLocalISO(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

export function getLocalDateString(date: Date = new Date()): string {
  return date.toISOString().split("T")[0];
}

export function formatDateInTimezone(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function formatDateTimeInTimezone(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  const mm = minutes.toString().padStart(2, "0");
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}, ${h12}:${mm} ${ampm}`;
}

// =============================================================================
// URL Helpers
// =============================================================================

export function extractUsername(url: string): string | null {
  const match = url.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)/);
  return match ? match[1] : null;
}

export function buildProfileUrl(username: string): string {
  return `https://x.com/${username}`;
}

// =============================================================================
// Validation Helpers
// =============================================================================

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{1,15}$/.test(username);
}

export function normalizeUsername(input: string): string {
  return input.replace(/^@/, "");
}

// =============================================================================
// Tweet Helpers
// =============================================================================

import type { Tweet } from "./types";

export function formatTweetOutput(tweet: Tweet): string {
  const engagement = `❤️ ${tweet.metrics.like_count} | 🔁 ${tweet.metrics.retweet_count} | 💬 ${tweet.metrics.reply_count} | 👁 ${tweet.metrics.view_count}`;
  return `@${tweet.author.username}: ${tweet.text.substring(0, 200)}${tweet.text.length > 200 ? "..." : ""}\n   ${engagement}\n   ${tweet.url}`;
}

export function calculateRelevanceScore(
  followers: number,
  avgEngagement: number,
  tweetsFound: number
): number {
  // Weighted scoring: followers (50%) + engagement (30%) + volume (20%)
  const logFollowers = Math.log10(followers + 1);
  const normalizedFollowers = Math.min(logFollowers / 6, 1); // Cap at 1M
  
  // Use log of engagement to balance the scale
  const logEngagement = Math.log10(avgEngagement + 1);
  const normalizedEngagement = Math.min(logEngagement / 4, 1); // Cap at 10K avg engagement
  
  const volumeScore = Math.min(tweetsFound / 10, 1);
  
  return (normalizedFollowers * 0.5 + normalizedEngagement * 0.3 + volumeScore * 0.2) * 100;
}
