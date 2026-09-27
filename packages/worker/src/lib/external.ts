import type { Bindings } from "../types.js";

export type ExternalEnv = Pick<Bindings, "XRAY_EXTERNAL">;

export function externalFetch(
	env: ExternalEnv = {},
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	return env.XRAY_EXTERNAL ? env.XRAY_EXTERNAL.fetch(input, init) : fetch(input, init);
}
