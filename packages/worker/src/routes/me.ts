import type { Context } from "hono";
import type { AppEnv } from "../types.js";

export function meRoute(c: Context<AppEnv>) {
	const user = c.get("authUser");
	if (!user) {
		return c.json({ authenticated: false, user: null }, 401);
	}
	return c.json({
		authenticated: true,
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
		},
	});
}
