import { describe, expect, test } from "bun:test";

import {
	assertCiRunIdentity,
	CI_BRANCH,
	CI_POLL_MS,
	CI_REGISTRATION_TIMEOUT_MS,
	CI_RUN_FIELDS,
	CI_VIEW_TIMEOUT_MS,
	CI_WATCH_TIMEOUT_MS,
	CI_WORKFLOW,
	CI_WORKFLOW_NAME,
	type CiRunMetadata,
	type CiWaitDeps,
	parseCiRun,
	parseCiRuns,
	waitForCiSuccess,
} from "./release.ts";

describe("release CI gate constants", () => {
	test("targets the CI workflow on main", () => {
		expect(CI_WORKFLOW).toBe(".github/workflows/ci.yml");
		expect(CI_WORKFLOW_NAME).toBe("CI");
		expect(CI_BRANCH).toBe("main");
		expect(CI_RUN_FIELDS).toBe(
			"databaseId,headSha,headBranch,event,workflowName,status,conclusion",
		);
	});

	test("keeps registration, watch, poll and view budgets bounded", () => {
		expect(CI_REGISTRATION_TIMEOUT_MS).toBe(5 * 60_000);
		expect(CI_WATCH_TIMEOUT_MS).toBe(25 * 60_000);
		expect(CI_POLL_MS).toBe(10_000);
		expect(CI_VIEW_TIMEOUT_MS).toBe(30_000);
	});
});

describe("parseCiRuns", () => {
	test("parses a run list", () => {
		const run: CiRunMetadata = {
			databaseId: 42,
			headSha: "abc",
			headBranch: "main",
			event: "push",
			workflowName: "CI",
			status: "completed",
			conclusion: "success",
		};

		expect(parseCiRuns(JSON.stringify([run]))).toEqual([run]);
		expect(parseCiRuns("[]")).toEqual([]);
	});

	test("fails closed on malformed or non-array output", () => {
		expect(() => parseCiRuns("not json")).toThrow(/could not parse `gh run list` output/);
		expect(() => parseCiRuns('{"total_count":0}')).toThrow(/unexpected `gh run list` output/);
	});
});

describe("parseCiRun", () => {
	test("parses a single run payload", () => {
		const run: CiRunMetadata = {
			databaseId: 7,
			headSha: "abc",
			headBranch: "main",
			event: "push",
			workflowName: "CI",
			status: "completed",
			conclusion: "success",
		};

		expect(parseCiRun(JSON.stringify(run), "gh run view")).toEqual(run);
	});

	test("fails closed on malformed output", () => {
		expect(() => parseCiRun("not json", "gh run view")).toThrow(
			/could not parse `gh run view` output/,
		);
	});
});

describe("assertCiRunIdentity", () => {
	const SHA = "aaf10fd0c0ffee";

	function ciRun(overrides: Partial<CiRunMetadata> = {}): CiRunMetadata {
		return {
			databaseId: 42,
			headSha: SHA,
			headBranch: "main",
			event: "push",
			workflowName: "CI",
			status: "in_progress",
			conclusion: "",
			...overrides,
		};
	}

	test("accepts the CI push run on main for the pushed commit", () => {
		expect(() => assertCiRunIdentity(ciRun(), SHA)).not.toThrow();
	});

	test("rejects a different commit, branch, event or workflow", () => {
		expect(() => assertCiRunIdentity(ciRun({ headSha: "deadbeef" }), SHA)).toThrow(
			/does not match the pushed commit/,
		);
		expect(() => assertCiRunIdentity(ciRun({ headBranch: "feature" }), SHA)).toThrow(
			/branch=feature/,
		);
		expect(() => assertCiRunIdentity(ciRun({ event: "pull_request" }), SHA)).toThrow(
			/event=pull_request/,
		);
		expect(() => assertCiRunIdentity(ciRun({ workflowName: "Release" }), SHA)).toThrow(
			/workflow=Release/,
		);
	});
});

describe("waitForCiSuccess", () => {
	const SHA = "aaf10fd0c0ffee";

	function ciRun(overrides: Partial<CiRunMetadata> = {}): CiRunMetadata {
		return {
			databaseId: 42,
			headSha: SHA,
			headBranch: "main",
			event: "push",
			workflowName: "CI",
			status: "in_progress",
			conclusion: "",
			...overrides,
		};
	}

	interface FakeSteps {
		/** Successive `gh run list` payloads; the last one repeats. */
		list: string[];
		/** Advances the clock before each `gh run list` returns, like a stalled command. */
		listDelayMs?: number;
		/** Successive `gh run view` payloads; the last one repeats. */
		views?: (CiRunMetadata | string)[];
		view?: CiRunMetadata | string;
		viewCode?: number;
		listCode?: number;
	}

	function fakeDeps(steps: FakeSteps) {
		const state = { now: 0 };
		const calls: string[][] = [];
		const timeouts: (number | undefined)[] = [];
		const list = [...steps.list];
		const deps: CiWaitDeps = {
			run: async (args, timeoutMs) => {
				calls.push(args);
				timeouts.push(timeoutMs);
				switch (args[1]) {
					case "list": {
						const payload = list.length > 1 ? (list.shift() as string) : (list[0] ?? "[]");
						state.now += steps.listDelayMs ?? 0;
						return { code: steps.listCode ?? 0, stdout: payload, stderr: "" };
					}
					case "view": {
						const next =
							steps.views && steps.views.length > 1
								? steps.views.shift()
								: (steps.views?.[0] ?? steps.view);
						const stdout = typeof next === "string" ? next : next ? JSON.stringify(next) : "";
						return { code: steps.viewCode ?? 0, stdout, stderr: "" };
					}
					default:
						throw new Error(`unexpected gh call: ${args.join(" ")}`);
				}
			},
			sleep: async (ms) => {
				state.now += ms;
			},
			now: () => state.now,
		};
		return { deps, calls, timeouts };
	}

	test("polls while registration is pending, then requires a successful run", async () => {
		const { deps, calls, timeouts } = fakeDeps({
			list: ["[]", JSON.stringify([ciRun()])],
			view: ciRun({ status: "completed", conclusion: "success" }),
		});

		const final = await waitForCiSuccess(SHA, deps, { registrationMs: 60_000, pollMs: 10_000 });

		expect(final.conclusion).toBe("success");
		expect(calls.filter((call) => call[1] === "list")).toHaveLength(2);
		const listCall = calls[0] ?? [];
		expect(listCall).toContain(".github/workflows/ci.yml");
		expect(listCall).toContain(SHA);
		expect(listCall).toContain("push");
		expect(listCall).toContain("main");
		expect(timeouts).toEqual([60_000, 50_000, CI_VIEW_TIMEOUT_MS]);
	});

	test("keeps polling when the run is still in progress", async () => {
		const { deps, calls } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			views: [ciRun(), ciRun({ status: "completed", conclusion: "success" })],
		});

		const final = await waitForCiSuccess(SHA, deps, { watchMs: 60_000, pollMs: 10_000 });

		expect(final.conclusion).toBe("success");
		expect(calls.filter((call) => call[1] === "view")).toHaveLength(2);
	});

	test("fails closed when the verification call errors", async () => {
		const { deps, timeouts } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			viewCode: 1,
		});

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(
			/could not verify CI run 42 \(exit 1\)/,
		);
		expect(timeouts.at(-1)).toBe(CI_VIEW_TIMEOUT_MS);
	});

	test("fails closed when the run list errors", async () => {
		const { deps } = fakeDeps({
			list: ["[]"],
			listCode: 2,
		});

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/`gh run list` failed \(exit 2\)/);
	});

	test("fails closed when the run never registers within the registration deadline", async () => {
		const { deps } = fakeDeps({ list: ["[]"] });

		await expect(
			waitForCiSuccess(SHA, deps, { registrationMs: 30_000, pollMs: 10_000 }),
		).rejects.toThrow(/no CI run registered for commit .* within 30000ms/);
	});

	test("rejects a matching record that only arrives after the registration deadline", async () => {
		const { deps, timeouts } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			listDelayMs: CI_REGISTRATION_TIMEOUT_MS + 1_000,
			view: ciRun({ status: "completed", conclusion: "success" }),
		});

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(
			/no CI run registered for commit .* within 300000ms/,
		);
		expect(timeouts).toEqual([CI_REGISTRATION_TIMEOUT_MS]);
	});

	test("fails closed on a run for a different commit", async () => {
		const { deps } = fakeDeps({ list: [JSON.stringify([ciRun({ headSha: "deadbeef" })])] });

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/does not match the pushed commit/);
	});

	test("fails closed on a run for a different branch", async () => {
		const { deps } = fakeDeps({ list: [JSON.stringify([ciRun({ headBranch: "feature" })])] });

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/branch=feature/);
	});

	test("fails closed on a different workflow", async () => {
		const { deps } = fakeDeps({ list: [JSON.stringify([ciRun({ workflowName: "Release" })])] });

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/does not match the pushed commit/);
	});

	test("throws when the run fails", async () => {
		const { deps } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			view: ciRun({ status: "completed", conclusion: "failure" }),
		});

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/conclusion `failure`/);
	});

	test("throws when the run was not green", async () => {
		const { deps } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			view: ciRun({ status: "completed", conclusion: "cancelled" }),
		});

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/conclusion `cancelled`/);
	});

	test("times out when the run never completes", async () => {
		const { deps } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			views: [ciRun()],
		});

		await expect(waitForCiSuccess(SHA, deps, { watchMs: 30_000, pollMs: 10_000 })).rejects.toThrow(
			/did not complete within 30000ms/,
		);
	});
});
