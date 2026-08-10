import { describe, expect, test } from "vitest";
import { assertBootEnv, authDevBypassEnabled, isDevOrTest, parseAllowedEmails } from "./env.js";

describe("env", () => {
	test("isDevOrTest", () => {
		expect(isDevOrTest({ ENVIRONMENT: "development" } as never)).toBe(true);
		expect(isDevOrTest({ ENVIRONMENT: "test" } as never)).toBe(true);
		expect(isDevOrTest({ ENVIRONMENT: "production" } as never)).toBe(false);
	});

	test("assertBootEnv fails closed when bypass in production", () => {
		expect(() =>
			assertBootEnv({ ENVIRONMENT: "production", AUTH_DEV_BYPASS: "true" } as never),
		).toThrow(/refusing to boot/);
	});

	test("assertBootEnv allows bypass in development", () => {
		expect(() =>
			assertBootEnv({ ENVIRONMENT: "development", AUTH_DEV_BYPASS: "true" } as never),
		).not.toThrow();
	});

	test("parseAllowedEmails", () => {
		expect([...parseAllowedEmails("A@x.com, b@y.com ")]).toEqual(["a@x.com", "b@y.com"]);
		expect(authDevBypassEnabled({ AUTH_DEV_BYPASS: "true" } as never)).toBe(true);
	});
});
