import { describe, expect, test } from "vitest";
import { externalBinding } from "../test/external-binding.js";
import { localIdentityBindings } from "../test/signed-identity.js";
import type { Bindings } from "../types.js";
import { assertBootEnv, isDevOrTest, parseAllowedEmails, presentationTime } from "./env.js";

describe("environment resources", () => {
	test("recognizes only development and test", () => {
		for (const ENVIRONMENT of ["development", "test", "TEST"])
			expect(isDevOrTest({ ENVIRONMENT } as Bindings)).toBe(true);
		for (const ENVIRONMENT of ["production", "staging", undefined])
			expect(isDevOrTest({ ENVIRONMENT } as Bindings)).toBe(false);
	});

	test("local resources fail closed outside local modes, including empty strings", () => {
		for (const resource of [
			{ XRAY_LOCAL_JWKS: "" },
			{ XRAY_PRESENTATION_TIME: "" },
			{ XRAY_EXTERNAL: externalBinding(async () => Response.json({})) },
		]) {
			for (const ENVIRONMENT of ["production", "staging", undefined]) {
				expect(() => assertBootEnv({ ENVIRONMENT, ...resource } as Bindings)).toThrow(
					/refusing to boot/,
				);
			}
		}
		expect(() => assertBootEnv({ ENVIRONMENT: "production" } as Bindings)).not.toThrow();
	});

	test("local JWKS requires canonical issuer and audience", () => {
		const env = { ENVIRONMENT: "test", ...localIdentityBindings } as Bindings;
		expect(() => assertBootEnv(env)).not.toThrow();
		for (const override of [{ CF_ACCESS_AUD: "wrong" }, { CF_ACCESS_TEAM_DOMAIN: "wrong" }]) {
			expect(() => assertBootEnv({ ...env, ...override })).toThrow(/issuer and audience/);
		}
	});

	test("presentation clock is optional and validates UTC ISO input", () => {
		const anchor = "2026-09-20T12:00:00.000Z";
		expect(presentationTime({ XRAY_PRESENTATION_TIME: anchor })).toBe(Date.parse(anchor));
		expect(presentationTime({})).toBeGreaterThanOrEqual(Date.now() - 1000);
		expect(() =>
			assertBootEnv({ ENVIRONMENT: "development", XRAY_PRESENTATION_TIME: anchor } as Bindings),
		).not.toThrow();
		for (const time of ["", "yesterday", "2026-99-99T00:00:00Z", "2026-09-20"]) {
			expect(() =>
				assertBootEnv({ ENVIRONMENT: "test", XRAY_PRESENTATION_TIME: time } as Bindings),
			).toThrow(/ISO UTC/);
		}
	});

	test("normalizes optional email policy", () => {
		expect([...parseAllowedEmails("A@x.com, b@y.com ")]).toEqual(["a@x.com", "b@y.com"]);
		for (const raw of [undefined, "  ", ",,"]) expect(parseAllowedEmails(raw).size).toBe(0);
	});
});
