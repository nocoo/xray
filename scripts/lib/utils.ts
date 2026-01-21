import { join } from "path";
import type { Config, RawTweetsFile, ClassifiedFile, ReportFile } from "./types";

// =============================================================================
// Path Constants
// =============================================================================

export const PROJECT_ROOT = join(import.meta.dir, "../..");
export const CONFIG_PATH = join(PROJECT_ROOT, "config/config.json");
export const RAW_TWEETS_PATH = join(PROJECT_ROOT, "data/raw_tweets.json");
export const CLASSIFIED_PATH = join(PROJECT_ROOT, "data/classified.json");
export const OUTPUT_DIR = join(PROJECT_ROOT, "data/output");

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

export async function loadClassified(): Promise<ClassifiedFile> {
  return await readJsonFile<ClassifiedFile>(CLASSIFIED_PATH);
}

export async function saveReport(data: ReportFile, customOutputDir?: string): Promise<string> {
  const date = new Date().toISOString().split("T")[0];
  const filename = `${date}_report.json`;
  const outputDir = customOutputDir || OUTPUT_DIR;
  const path = join(outputDir, filename);
  await writeJsonFile(path, data);
  return path;
}

// =============================================================================
// Date Helpers
// =============================================================================

export function nowISO(): string {
  return new Date().toISOString();
}

export function hoursAgoISO(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
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
