import { join } from "path";

export function getAgentOutputDir(): string {
  return join(process.cwd(), "data", "agent");
}

export function getAgentOutputPath(prefix: string, timestamp: string): string {
  const compact = timestamp.replace(/[-:]/g, "").replace(".", "");
  return join(getAgentOutputDir(), `${prefix}_${compact}.json`);
}
