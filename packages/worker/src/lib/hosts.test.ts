import { describe, expect, test } from "vitest";
import { classifyHost, isIngestAllowedPath, normalizeHost } from "./hosts.js";

describe("classifyHost", () => {
	test("exact browser and ingest hosts", () => {
		expect(classifyHost("xray.hexly.ai")).toBe("browser");
		expect(classifyHost("xray-staging.hexly.ai")).toBe("browser");
		expect(classifyHost("xray.dev.hexly.ai")).toBe("browser");
		expect(classifyHost("xray-ingest.hexly.ai")).toBe("ingest");
		expect(classifyHost("xray-ingest-staging.hexly.ai")).toBe("ingest");
		expect(classifyHost("localhost:8787")).toBe("local");
	});

	test("rejects lookalike hosts", () => {
		expect(classifyHost("xray.evil.example")).toBe("unknown");
		expect(classifyHost("not-xray.hexly.ai")).toBe("unknown");
		expect(classifyHost("prefix-xray-ingest.hexly.ai")).toBe("unknown");
	});

	test("ingest path allowlist", () => {
		expect(isIngestAllowedPath("GET", "/api/live")).toBe(true);
		expect(isIngestAllowedPath("GET", "/api/v1/ingest/graph")).toBe(true);
		expect(isIngestAllowedPath("POST", "/api/v1/ingest/push")).toBe(true);
		expect(isIngestAllowedPath("GET", "/api/me")).toBe(false);
		expect(isIngestAllowedPath("GET", "/")).toBe(false);
	});

	test("normalizeHost strips port", () => {
		expect(normalizeHost("xray.hexly.ai:443")).toBe("xray.hexly.ai");
		expect(normalizeHost("XRAY.HEXLY.AI")).toBe("xray.hexly.ai");
		expect(normalizeHost("")).toBe("");
	});

	test("local hosts", () => {
		expect(classifyHost("127.0.0.1")).toBe("local");
		expect(classifyHost("127.0.0.1:8787")).toBe("local");
		expect(classifyHost("app.localhost")).toBe("local");
	});
});
