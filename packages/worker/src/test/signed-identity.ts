import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { externalBinding } from "./external-binding.js";

const pair = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(pair.publicKey)), kid: "l1-identity", alg: "ES256", use: "sig" };

export const localIdentityBindings = {
	CF_ACCESS_TEAM_DOMAIN: "identity.xray.test",
	CF_ACCESS_AUD: "xray-local",
	XRAY_LOCAL_JWKS: JSON.stringify({ keys: [jwk] }),
	XRAY_EXTERNAL: externalBinding(async () => Response.json({})),
};

export async function signIdentity(payload: JWTPayload = {}, key = pair.privateKey) {
	return new SignJWT({
		email: "dev@xray.local",
		name: "Dev User",
		sub: "l1-owner",
		iss: "https://identity.xray.test",
		aud: "xray-local",
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 7200,
		...payload,
	})
		.setProtectedHeader({ alg: "ES256", kid: "l1-identity" })
		.sign(key);
}

const owner = await signIdentity();
const other = await signIdentity({
	email: "dev-b@xray.local",
	name: "Dev User B",
	sub: "l1-other",
});

export function identityHeaders(actor = "a") {
	return { "Cf-Access-Jwt-Assertion": actor === "b" ? other : owner };
}
