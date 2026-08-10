#!/usr/bin/env bun
/**
 * Pre-commit hook: Scan for hardcoded secrets
 * 
 * Detects patterns like:
 * - API keys (sk-, Bearer token, etc.)
 * - Cookie strings
 * - Hardcoded passwords
 * 
 * Exits with code 1 if secrets are found.
 */

import { readFileSync } from "fs";
import { join, relative } from "path";

const SUSPICIOUS_PATTERNS = [
  // API Key patterns
  { pattern: /sk-[a-zA-Z0-9]{20,}/, name: "API Key (sk-)" },
  { pattern: /Bearer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/, name: "Bearer Token" },
  
  // Cookie patterns
  { pattern: /cookie["']?\s*[:=]\s*["'][^"']{30,}["']/i, name: "Cookie value" },
  { pattern: /auth_token["']?\s*[:=]\s*["'][^"']+/i, name: "Auth token" },
  { pattern: /session["']?\s*[:=]\s*["'][^"']+/i, name: "Session" },
  
  // Generic secrets
  { pattern: /password\s*[:=]\s*["'][^"']+["']/i, name: "Password" },
  { pattern: /secret\s*[:=]\s*["'][^"']+["']/i, name: "Secret" },
];

// Direct key patterns (high confidence)
const DIRECT_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /AE_[A-Z0-9]{20,}/,  // AWS Access Key
];

const EXCLUDED_PATHS = [
  "node_modules",
  ".git",
  "coverage",
  "dist",
  "build",
  ".next",
  "data",
  "obsidian",
];

const EXCLUDED_FILES = [
  "config.example.json",
  ".gitignore",
  "package.json",
  "bun.lockb",
  "package-lock.json",
];

function isExcluded(path: string): boolean {
  const parts = path.split("/");
  return parts.some(p => EXCLUDED_PATHS.includes(p)) ||
         EXCLUDED_FILES.some(f => path.endsWith(f));
}

async function scanFile(filePath: string): Promise<Array<{line: number; name: string; match: string}>> {
  const issues: Array<{line: number; name: string; match: string}> = [];
  
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      // Check for direct key patterns (high severity)
      for (const pattern of DIRECT_KEY_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          issues.push({
            line: lineNum,
            name: "Direct API Key",
            match: match[0].substring(0, 15) + "...",
          });
          continue;
        }
      }
      
      // Check for suspicious patterns
      for (const { pattern, name } of SUSPICIOUS_PATTERNS) {
        if (pattern.test(line)) {
          // Avoid false positives
          if (line.includes("YOUR_") || line.includes("EXAMPLE") || 
              line.includes("REPLACE") || line.includes("TODO") ||
              line.includes("REMOVED") || line.includes("test") ||
              line.includes("Test") || line.includes("TEST")) {
            continue;
          }
          issues.push({
            line: lineNum,
            name,
            match: line.substring(0, 40).trim(),
          });
        }
      }
    }
  } catch {
    // Skip unreadable files
  }
  
  return issues;
}

async function scanForSecrets(): Promise<void> {
  const extensions = [".ts", ".js", ".json", ".yaml", ".yml", ".env"];
  const issuesByFile = new Map<string, Array<{line: number; name: string; match: string}>>();
  
  // Recursive file scan
  function scanDir(dir: string) {
    try {
      const entries = Bun.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!EXCLUDED_PATHS.includes(entry.name)) {
            scanDir(fullPath);
          }
        } else if (entry.isFile()) {
          if (extensions.some(ext => entry.name.endsWith(ext)) && !isExcluded(entry.name)) {
            const relPath = relative(process.cwd(), fullPath);
            scanFile(fullPath).then(issues => {
              if (issues.length > 0) {
                issuesByFile.set(relPath, issues);
              }
            });
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }
  
  scanDir(process.cwd());
  
  // Wait a bit for async operations
  await new Promise(resolve => setTimeout(resolve, 100));
  
  if (issuesByFile.size > 0) {
    console.log("\n🚨 SECRETS SCAN FAILED - Hardcoded secrets detected!\n");
    console.log("Found the following issues:\n");
    
    for (const [file, issues] of issuesByFile) {
      console.log(`📄 ${file}`);
      for (const issue of issues) {
        console.log(`   Line ${issue.line}: [${issue.name}]`);
        console.log(`   ${issue.match}`);
      }
      console.log("");
    }
    
    console.log("\n❌ ABORTING COMMIT - Secrets must not be hardcoded!\n");
    console.log("💡 Fix: Move secrets to config/config.json and use loadConfig()");
    console.log("📖 See: MEMORY.md for best practices\n");
    
    process.exit(1);
  }
  
  console.log("✅ Secrets scan passed - No hardcoded secrets found");
  process.exit(0);
}

scanForSecrets();
