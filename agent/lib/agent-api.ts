import { loadConfig } from "../../scripts/lib/utils";
import { createXRayClient } from "../../scripts/lib/xray-client";

export async function getAgentClient() {
  const config = await loadConfig();
  return createXRayClient(config);
}
