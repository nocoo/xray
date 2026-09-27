import type { Context } from "hono";
import { fetchAuthorProfile } from "../lib/author-profile.js";
import type { AppEnv } from "../types.js";

export async function meRoute(c: Context<AppEnv>) {
	const user = c.get("authUser");
	if (!user) {
		return c.json({ authenticated: false, user: null }, 401);
	}

	const profile = await fetchAuthorProfile(user.email, c.env);

	return c.json({
		authenticated: true,
		user: {
			id: user.id,
			email: user.email,
			name: profile.name ?? user.name,
			image: profile.avatar ?? user.image,
		},
	});
}
