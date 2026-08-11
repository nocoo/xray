import { describe, expect, test } from "vitest";
import {
	atomicWriteJson,
	formatTwitterCliIssue,
	type SpawnFn,
	TwitterCliError,
	twitterStatus,
	twitterUserPosts,
} from "./producer-spawn.js";

describe("formatTwitterCliIssue", () => {
	test("not_installed guides install + PATH", () => {
		const issue = formatTwitterCliIssue({
			bin: "twitter",
			code: 127,
			stderr: "twitter: command not found",
		});
		expect(issue.kind).toBe("not_installed");
		expect(issue.message).toMatch(/uv tool install twitter-cli/);
		expect(issue.message).toMatch(/TWITTER_BIN/);
	});

	test("ENOENT spawnError → not_installed", () => {
		const err = Object.assign(new Error("spawn twitter ENOENT"), { code: "ENOENT" });
		const issue = formatTwitterCliIssue({ bin: "/missing/twitter", spawnError: err });
		expect(issue.kind).toBe("not_installed");
		expect(issue.message).toContain("/missing/twitter");
	});

	test("not_authenticated guides browser + env + from-cache", () => {
		const issue = formatTwitterCliIssue({
			bin: "twitter",
			authenticated: false,
			stdout: JSON.stringify({ ok: true, data: { authenticated: false } }),
		});
		expect(issue.kind).toBe("not_authenticated");
		expect(issue.message).toMatch(/twitter whoami/);
		expect(issue.message).toMatch(/TWITTER_AUTH_TOKEN/);
		expect(issue.message).toMatch(/--from-cache/);
		expect(issue.message).toMatch(/x\.com/);
	});

	test("cookie expired text → not_authenticated", () => {
		const issue = formatTwitterCliIssue({
			bin: "twitter",
			code: 1,
			stderr: "Cookie expired (401/403)",
		});
		expect(issue.kind).toBe("not_authenticated");
	});
});

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

	test("status unauthenticated throws TwitterCliError with fix steps", async () => {
		const spawn: SpawnFn = async () => ({
			code: 0,
			stdout: JSON.stringify({ ok: true, data: { authenticated: false } }),
			stderr: "",
		});
		await expect(
			twitterStatus({ spawn, bin: "twitter", max: 20, env: { PATH: "/bin" } }),
		).rejects.toBeInstanceOf(TwitterCliError);
		await expect(
			twitterStatus({ spawn, bin: "twitter", max: 20, env: { PATH: "/bin" } }),
		).rejects.toMatchObject({ kind: "not_authenticated" });
	});

	test("status missing binary throws not_installed", async () => {
		const spawn: SpawnFn = async () => {
			throw Object.assign(new Error('Executable not found in $PATH: "twitter"'), {
				code: "ENOENT",
			});
		};
		await expect(twitterStatus({ spawn, bin: "twitter", max: 20, env: {} })).rejects.toMatchObject({
			kind: "not_installed",
		});
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
		).rejects.toMatchObject({ rateLimited: true, kind: "rate_limited" });
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

		const fsUnlinkFail = {
			writeFileSync: () => {},
			renameSync: () => {
				throw new Error("rename-fail");
			},
			unlinkSync: () => {
				throw new Error("unlink-fail");
			},
		};
		expect(() => atomicWriteJson("/cache/c.json", {}, fsUnlinkFail, 2)).toThrow(/rename-fail/);
	});
});

describe("twitterStatus / user-posts more branches", () => {
	test("status non-zero code throws", async () => {
		const spawn: SpawnFn = async () => ({
			code: 2,
			stdout: "",
			stderr: "boom",
		});
		await expect(twitterStatus({ spawn, bin: "twitter", max: 1, env: {} })).rejects.toBeInstanceOf(
			TwitterCliError,
		);
	});

	test("status invalid JSON throws", async () => {
		const spawn: SpawnFn = async () => ({
			code: 0,
			stdout: "not-json",
			stderr: "",
		});
		await expect(twitterStatus({ spawn, bin: "twitter", max: 1, env: {} })).rejects.toMatchObject({
			kind: expect.any(String),
		});
	});

	test("user-posts spawn ENOENT", async () => {
		const spawn: SpawnFn = async () => {
			throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
		};
		await expect(
			twitterUserPosts({ spawn, bin: "twitter", max: 5, env: {} }, "x"),
		).rejects.toMatchObject({ kind: "not_installed" });
	});

	test("user-posts non-zero without rate limit", async () => {
		const spawn: SpawnFn = async () => ({
			code: 1,
			stdout: "",
			stderr: "other error",
		});
		await expect(
			twitterUserPosts({ spawn, bin: "twitter", max: 5, env: {} }, "x"),
		).rejects.toBeInstanceOf(TwitterCliError);
	});

	test("user-posts no JSON in stdout", async () => {
		const spawn: SpawnFn = async () => ({
			code: 0,
			stdout: "plain text only",
			stderr: "",
		});
		await expect(
			twitterUserPosts({ spawn, bin: "twitter", max: 5, env: {} }, "x"),
		).rejects.toBeInstanceOf(TwitterCliError);
	});

	test("user-posts envelope ok=false", async () => {
		const spawn: SpawnFn = async () => ({
			code: 0,
			stdout: JSON.stringify({ ok: false, error: { code: "auth" } }),
			stderr: "",
		});
		await expect(
			twitterUserPosts({ spawn, bin: "twitter", max: 5, env: {} }, "x"),
		).rejects.toBeInstanceOf(TwitterCliError);
	});

	test("formatTwitterCliIssue generic failure", () => {
		const issue = formatTwitterCliIssue({
			bin: "twitter",
			code: 1,
			stderr: "something else",
			context: "ctx",
		});
		expect(issue.kind).toBe("failed");
		expect(issue.message).toMatch(/ctx|twitter|something else/i);
	});

	test("ENOENT via message text and empty bin", () => {
		const issue = formatTwitterCliIssue({
			bin: "",
			spawnError: new Error("spawn ENOENT failed"),
		});
		expect(issue.kind).toBe("not_installed");
		const rate = formatTwitterCliIssue({
			bin: "twitter",
			stderr: "HTTP 429 Too Many Requests",
		});
		expect(rate.kind).toBe("rate_limited");
		// isEnoent false paths
		const failed = formatTwitterCliIssue({
			bin: "twitter",
			spawnError: "string-err",
			code: 1,
			stderr: "x",
		});
		expect(failed.kind).toBe("failed");
		const failed2 = formatTwitterCliIssue({
			bin: "twitter",
			spawnError: null,
			code: 99,
		});
		expect(failed2.kind).toBe("failed");
	});
});
