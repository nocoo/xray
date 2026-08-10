import type { Context } from "hono";
import { jsonOk, requireUser } from "../lib/http.js";
import { getDashboardAggregates } from "../repos/dashboard.js";
import type { AppEnv } from "../types.js";

export async function getDashboardRoute(c: Context<AppEnv>) {
	const user = requireUser(c);
	if (user instanceof Response) return user;
	const data = await getDashboardAggregates(c.env.DB, user.id);
	return jsonOk(c, data);
}
