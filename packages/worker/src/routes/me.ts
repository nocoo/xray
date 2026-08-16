import type { Context } from "hono";
import {
	type AuthorProfileFetch,
	fetchAuthorProfile,
	shouldLookupAuthorProfile,
} from "../lib/author-profile.js";
import type { AppEnv } from "../types.js";

export async function meRoute(c: Context<AppEnv>) {
	const user = c.get("authUser");
	if (!user) {
		return c.json({ authenticated: false, user: null }, 401);
	}

	let name = user.name;
	let image = user.image;
	if (shouldLookupAuthorProfile(c.env)) {
		const fetchFn: AuthorProfileFetch = c.env.AUTHOR_PROFILE_FETCH ?? globalThis.fetch;
		const profile = await fetchAuthorProfile(user.email, fetchFn);
		name = profile.name ?? name;
		image = profile.avatar ?? image;
	}

	return c.json({
		authenticated: true,
		user: {
			id: user.id,
			email: user.email,
			name,
			image,
		},
	});
}
