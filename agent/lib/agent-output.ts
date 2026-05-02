import { join, dirname } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";

export function getAgentOutputDir(): string {
  return join(process.cwd(), "data", "agent");
}

export function getAgentOutputPath(prefix: string, timestamp: string): string {
  const compact = timestamp.replace(/[-:]/g, "").replace(".", "");
  return join(getAgentOutputDir(), `${prefix}_${compact}.json`);
}

export async function writeAgentOutput<T>(
  prefix: string,
  payload: T & { generated_at?: string },
  outPath?: string
): Promise<string> {
  const timestamp = payload.generated_at || new Date().toISOString();
  const path = outPath || getAgentOutputPath(prefix, timestamp);
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(path, JSON.stringify(payload, null, 2));
  return path;
}
