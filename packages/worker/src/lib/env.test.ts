import { describe, expect, test } from "vitest";
import { assertBootEnv, authDevBypassEnabled, isDevOrTest, parseAllowedEmails } from "./env.js";

describe("env", () => {
	test("isDevOrTest", () => {
		expect(isDevOrTest({ ENVIRONMENT: "development" } as never)).toBe(true);
		expect(isDevOrTest({ ENVIRONMENT: "test" } as never)).toBe(true);
		expect(isDevOrTest({ ENVIRONMENT: "production" } as never)).toBe(false);
		expect(isDevOrTest({} as never)).toBe(false);
		expect(isDevOrTest({ ENVIRONMENT: "TEST" } as never)).toBe(true);
	});

	test("assertBootEnv fails closed when bypass in production", () => {
		expect(() =>
			assertBootEnv({ ENVIRONMENT: "production", AUTH_DEV_BYPASS: "true" } as never),
		).toThrow(/refusing to boot/);
		expect(() =>
			assertBootEnv({ ENVIRONMENT: "production", AUTH_DEV_BYPASS: "1" } as never),
		).toThrow(/refusing to boot/);
	});

	test("assertBootEnv allows bypass in development", () => {
		expect(() =>
			assertBootEnv({ ENVIRONMENT: "development", AUTH_DEV_BYPASS: "true" } as never),
		).not.toThrow();
		expect(() => assertBootEnv({ ENVIRONMENT: "production" } as never)).not.toThrow();
	});

	test("parseAllowedEmails", () => {
		expect([...parseAllowedEmails("A@x.com, b@y.com ")]).toEqual(["a@x.com", "b@y.com"]);
		expect(parseAllowedEmails(undefined).size).toBe(0);
		expect(parseAllowedEmails("  ").size).toBe(0);
		expect(parseAllowedEmails(",,").size).toBe(0);
		expect(authDevBypassEnabled({ AUTH_DEV_BYPASS: "true" } as never)).toBe(true);
		expect(authDevBypassEnabled({ AUTH_DEV_BYPASS: "1" } as never)).toBe(true);
		expect(authDevBypassEnabled({ AUTH_DEV_BYPASS: "yes" } as never)).toBe(false);
		expect(authDevBypassEnabled({} as never)).toBe(false);
	});
});
