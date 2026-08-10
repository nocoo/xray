import { createXRayAPIClient } from "../../scripts/lib/xray-api-client";

export async function getAgentClient() {
  return createXRayAPIClient();
}
