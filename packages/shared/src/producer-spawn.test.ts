import { describe, expect, test } from "vitest";
import {
	atomicWriteJson,
	type SpawnFn,
	twitterStatus,
	twitterUserPosts,
} from "./producer-spawn.js";

describe("twitterStatus / twitterUserPosts orchestration", () => {
	test("passes scrubbed env to spawn (no ambient secrets)", async () => {
		let seenEnv: Record<string, string> | undefined;
		const spawn: SpawnFn = async (argv, opts) => {
			seenEnv = opts.env;
			expect(argv[0]).toBe("twitter");
			expect(argv).toContain("status");
			return {
				code: 0,
				stdout: JSON.stringify({
					ok: true,
					data: { authenticated: true },
				}),
				stderr: "",
			};
		};
		const r = await twitterStatus({
			spawn,
			bin: "twitter",
			max: 20,
			env: {
				PATH: "/bin",
				XRAY_PUSH_TOKEN: "secret",
				GITHUB_TOKEN: "g",
				TWITTER_CT0: "ct0",
			},
		});
		expect(r.authenticated).toBe(true);
		expect(seenEnv?.PATH).toBe("/bin");
		expect(seenEnv?.TWITTER_CT0).toBe("ct0");
		expect(seenEnv?.XRAY_PUSH_TOKEN).toBeUndefined();
		expect(seenEnv?.GITHUB_TOKEN).toBeUndefined();
		expect(r.spawnEnv.XRAY_PUSH_TOKEN).toBeUndefined();
	});

	test("user-posts marks rateLimited on 429 stderr", async () => {
		const spawn: SpawnFn = async () => ({
			code: 1,
			stdout: "",
			stderr: "Rate limited (429), retrying",
		});
		await expect(
			twitterUserPosts(
				{
					spawn,
					bin: "twitter",
					max: 20,
					env: { PATH: "/bin" },
				},
				"sama",
			),
		).rejects.toMatchObject({ rateLimited: true });
	});

	test("user-posts returns parsed envelope on success", async () => {
		const spawn: SpawnFn = async (argv) => {
			expect(argv).toEqual(["twitter", "user-posts", "sama", "--json", "--max", "20"]);
			return {
				code: 0,
				stdout: JSON.stringify({ ok: true, data: [{ id: "1", text: "hi" }] }),
				stderr: "",
			};
		};
		const r = await twitterUserPosts(
			{ spawn, bin: "twitter", max: 20, env: { PATH: "/usr/bin" } },
			"sama",
		);
		expect(r.data).toEqual({ ok: true, data: [{ id: "1", text: "hi" }] });
	});
});

describe("atomicWriteJson", () => {
	test("writes tmp then renames; cleans tmp on rename failure", () => {
		const ops: string[] = [];
		const fs = {
			writeFileSync: (p: string, data: string) => {
				ops.push(`write:${p}:${data.includes("hello")}`);
			},
			renameSync: (from: string, to: string) => {
				ops.push(`rename:${from}->${to}`);
			},
			unlinkSync: (p: string) => {
				ops.push(`unlink:${p}`);
			},
		};
		atomicWriteJson("/cache/a.json", { hello: 1 }, fs, 99);
		expect(ops[0]?.startsWith("write:/cache/a.json.99.tmp")).toBe(true);
		expect(ops[1]).toBe("rename:/cache/a.json.99.tmp->/cache/a.json");

		const fsFail = {
			writeFileSync: () => {},
			renameSync: () => {
				throw new Error("eexist");
			},
			unlinkSync: (p: string) => {
				ops.push(`unlink2:${p}`);
			},
		};
		expect(() => atomicWriteJson("/cache/b.json", {}, fsFail, 1)).toThrow(/eexist/);
		expect(ops.some((x) => x.startsWith("unlink2:"))).toBe(true);
	});
});
