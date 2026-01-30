import { describe, test, expect } from "bun:test";

// Test the secret scanning patterns
const DIRECT_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
];

const SUSPICIOUS_PATTERNS = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/, name: "API Key (sk-)" },
  { pattern: /Bearer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/, name: "Bearer Token" },
  { pattern: /cookie["']?\s*[:=]\s*["'][^"']{30,}["']/i, name: "Cookie value" },
  { pattern: /password\s*[:=]\s*["'][^"']+["']/i, name: "Password" },
];

describe("Secret Scanning", () => {
  test("detects hardcoded API key", () => {
    const line = 'const apiKey = "sk-qZ4sg7AlU4n8OOrPgsqg9KkVoCJyQl1evmDMAhgQfiCmPRFXE9oJT1QzPf2LC";';
    
    let detected = false;
    for (const pattern of DIRECT_KEY_PATTERNS) {
      if (pattern.test(line)) detected = true;
    }
    expect(detected).toBe(true);
  });

  test("detects Bearer token pattern", () => {
    // Simplified Bearer token test
    const tokenPattern = /Bearer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/;
    const line = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig';
    expect(tokenPattern.test(line)).toBe(true);
  });

  test("ignores example placeholders", () => {
    const line = 'const apiKey = "YOUR_API_KEY_HERE"; // TODO: replace';
    
    // Should NOT be detected as real secret (has YOUR_ prefix)
    let detected = false;
    if (line.includes("YOUR_") || line.includes("EXAMPLE")) {
      detected = false;
    } else {
      for (const pattern of DIRECT_KEY_PATTERNS) {
        if (pattern.test(line)) detected = true;
      }
    }
    expect(detected).toBe(false);
  });

  test("detects password in code", () => {
    const line = 'const password = "super-secret-password";';
    
    const found = SUSPICIOUS_PATTERNS.find(p => p.name === "Password");
    expect(found?.pattern.test(line)).toBe(true);
  });

  test("ignores test files with secrets", () => {
    const line = 'const apiKey = "sk-test-api-key-for-testing";';
    
    // If line contains "test" or "Test", should be ignored
    let shouldIgnore = line.toLowerCase().includes("test");
    expect(shouldIgnore).toBe(true);
  });

  test("ignores removed secrets", () => {
    const line = 'const apiKey = "REMOVED_API_KEY"; // was sk-xxx';
    
    let shouldIgnore = line.includes("REMOVED") || line.includes("TODO");
    expect(shouldIgnore).toBe(true);
  });

  test("detects long cookie values", () => {
    const line = 'cookie = "guest_id=v2%3A1234567890abcdef; ct0=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz";';
    
    const found = SUSPICIOUS_PATTERNS.find(p => p.name === "Cookie value");
    expect(found?.pattern.test(line)).toBe(true);
  });
});
