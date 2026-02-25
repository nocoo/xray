import { loadConfig } from "../../scripts/lib/utils";
import { createAPIClient } from "../../scripts/lib/api";

export async function getAgentClient() {
  const config = await loadConfig();
  return createAPIClient(config);
}
