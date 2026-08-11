import { describe, expect, test } from "vitest";
import { createTwitterCliSource } from "./twitter-cli-source.js";

describe("createTwitterCliSource", () => {
	test("ready / fetchHandle / parseCachedRaw", async () => {
		const spawn = async (argv: string[]) => {
			if (argv.includes("status")) {
				return {
					code: 0,
					stdout: JSON.stringify({ ok: true, data: { authenticated: true } }),
					stderr: "",
				};
			}
			return {
				code: 0,
				stdout: JSON.stringify({
					ok: true,
					data: [
						{
							id: "1",
							text: "hi",
							created_at: "2026-08-10T12:00:00.000Z",
							author: { id: "u", username: "a", name: "A" },
						},
					],
				}),
				stderr: "",
			};
		};
		const src = createTwitterCliSource({
			spawn,
			bin: "twitter",
			env: { PATH: "/bin" },
			max: 10,
		});
		expect(src.id).toBe("twitter-cli");
		await src.ready();
		const live = await src.fetchHandle("alice");
		expect(live.items.length).toBeGreaterThanOrEqual(0);
		const cached = src.parseCachedRaw({ ok: true, data: [] });
		expect(cached.items).toEqual([]);
	});

	test("parseCachedRaw throws on envelope error", () => {
		const src = createTwitterCliSource({
			spawn: async () => ({ code: 0, stdout: "{}", stderr: "" }),
			bin: "twitter",
			env: {},
			max: 1,
		});
		expect(() => src.parseCachedRaw({ ok: false, error: "x" })).toThrow();
	});
});
