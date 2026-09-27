import { generateKeyPair } from "jose";
import { describe, expect, test } from "vitest";
import app from "../index.js";
import { identityHeaders, localIdentityBindings, signIdentity } from "../test/signed-identity.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import type { Bindings } from "../types.js";

function environment(): Bindings {
	return { DB: createSqliteD1(), ENVIRONMENT: "test", ...localIdentityBindings };
}

async function identity(env: Bindings, jwt?: string, extra = {}) {
	return app.request(
		"/api/me",
		{
			headers: { host: "localhost", ...(jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {}), ...extra },
		},
		env,
	);
}

describe("signed local identities through the production application", () => {
	test("stable issuer/subject binds identity and isolates the second tenant", async () => {
		const env = environment();
		const owner = (await (await identity(env, await signIdentity())).json()) as {
			user: { id: string };
		};
		const repeat = (await (
			await identity(env, await signIdentity({ email: "renamed@xray.test" }))
		).json()) as { user: { id: string; email: string } };
		expect(repeat.user).toMatchObject({ id: owner.user.id, email: "renamed@xray.test" });
		const other = await identity(env, undefined, identityHeaders("b"));
		expect(other.status).toBe(200);
		expect(((await other.json()) as { user: { id: string } }).user.id).not.toBe(owner.user.id);
	});

	test("rejects missing JWT and ignores actor headers", async () => {
		const env = environment();
		expect((await identity(env, undefined, { "x-test-actor": "a" })).status).toBe(401);
		const res = await identity(env, await signIdentity(), { "x-test-actor": "b" });
		expect(((await res.json()) as { user: { email: string } }).user.email).toBe("dev@xray.local");
	});

	test("signature, issuer, audience, expiry and not-before are always verified", async () => {
		const env = { ...environment(), XRAY_PRESENTATION_TIME: "2000-01-01T00:00:00.000Z" };
		const other = await generateKeyPair("ES256");
		expect((await identity(env, await signIdentity({}, other.privateKey))).status).toBe(403);
		for (const payload of [
			{ iss: "https://evil.example.com" },
			{ aud: "wrong" },
			{ exp: 1 },
			{ exp: undefined },
			{ nbf: Math.floor(Date.now() / 1000) + 3600 },
			{ email: null },
			{ sub: undefined },
		]) {
			expect(
				(await identity(env, await signIdentity(payload))).status,
				JSON.stringify(payload),
			).toBe(403);
		}
		expect((await identity(env, await signIdentity())).status).toBe(200);
	});

	test("email policy and stable binding conflicts stay enforced", async () => {
		const env = { ...environment(), ALLOWED_EMAILS: " DEV@XRAY.LOCAL " };
		expect((await identity(env, await signIdentity({ email: "other@xray.test" }))).status).toBe(
			403,
		);
		expect((await identity(env, await signIdentity())).status).toBe(200);
		expect((await identity(env, await signIdentity({ sub: "conflicting-owner" }))).status).toBe(
			403,
		);
	});

	test("invalid or nonpublic JWKS never authenticates", async () => {
		for (const jwks of [
			"invalid",
			"null",
			"{}",
			'{"keys":[]}',
			'{"keys":[null]}',
			'{"keys":[{"kty":"oct","k":"secret"}]}',
		]) {
			expect(
				(await identity({ ...environment(), XRAY_LOCAL_JWKS: jwks }, await signIdentity())).status,
			).toBe(403);
		}
		const jwks = JSON.parse(localIdentityBindings.XRAY_LOCAL_JWKS);
		jwks.keys[0].d = "private-material";
		expect(
			(
				await identity(
					{ ...environment(), XRAY_LOCAL_JWKS: JSON.stringify(jwks) },
					await signIdentity(),
				)
			).status,
		).toBe(403);
	});

	test("production rejects all local bindings before even public routes run", async () => {
		for (const field of ["XRAY_LOCAL_JWKS", "XRAY_EXTERNAL", "XRAY_PRESENTATION_TIME"] as const) {
			const res = await app.request(
				"/api/live",
				{ headers: { host: "localhost" } },
				{
					DB: createSqliteD1(),
					ENVIRONMENT: "production",
					[field]:
						field === "XRAY_PRESENTATION_TIME"
							? "2026-09-20T12:00:00Z"
							: localIdentityBindings[field],
				},
			);
			expect(res.status).toBe(500);
		}
	});
});
