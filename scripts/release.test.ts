import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

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
	classifyStaleVersionScan,
	parseCiRun,
	parseCiRuns,
	run,
	SIGNAL_FAILURE_EXIT_CODE,
	SPAWN_FAILURE_EXIT_CODE,
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

const WORKFLOW_DIR = pathResolve(import.meta.dirname as string, "..", ".github/workflows");
/** Audited `nocoo/base-ci` revision; bumping it requires re-auditing the release contract. */
const BASE_CI_SHA = "e5876a604547b1ddb0916f16dd841a4f832609a0";
const BASE_CI_VERSION = "v2026.20";
/** 1 deploy workflow reference plus 13 quality-slot action references. */
const BASE_CI_REFERENCE_COUNT = 14;

function workflow(name: string): string {
	return readFileSync(pathResolve(WORKFLOW_DIR, name), "utf8");
}

function workflowFiles(): string[] {
	return readdirSync(WORKFLOW_DIR).filter((name) => /\.ya?ml$/.test(name));
}

interface WorkflowJob {
	key: string;
	name?: string;
	uses?: string;
}

/** Top-level jobs of a workflow, with their `name:` and `uses:` values. */
function workflowJobs(source: string): WorkflowJob[] {
	const lines = source.split("\n");
	const jobsStart = lines.indexOf("jobs:");
	if (jobsStart === -1) return [];
	const jobs: WorkflowJob[] = [];
	let current: WorkflowJob | undefined;
	for (const line of lines.slice(jobsStart + 1)) {
		if (line.trim() === "") continue;
		const indent = line.length - line.trimStart().length;
		if (indent < 2) break;
		if (indent === 2) {
			current = { key: line.trim().replace(/:$/, "") };
			jobs.push(current);
			continue;
		}
		const property = line.trim().match(/^(name|uses):\s*(.+)$/);
		if (!current || indent !== 4 || !property) continue;
		const value = property[2]
			.trim()
			.replace(/^["']+/, "")
			.replace(/["']+$/, "");
		if (property[1] === "name") current.name = value;
		else current.uses = value;
	}
	return jobs;
}

interface BaseCiMention {
	file: string;
	ref: string;
}

/** Every `nocoo/base-ci` mention on active (non-comment) lines. */
function baseCiMentions(): BaseCiMention[] {
	return workflowFiles().flatMap((file) =>
		workflow(file)
			.split("\n")
			.filter((line) => !line.trimStart().startsWith("#"))
			.flatMap((line) => {
				const stripped = line.replace(/#.*$/, "");
				return (stripped.match(/nocoo\/base-ci[^\s'"]*/g) ?? []).map((raw) => ({
					file,
					ref: raw
						.trim()
						.replace(/^["']+/, "")
						.replace(/["']+$/, ""),
				}));
			}),
	);
}

describe("release workflow contract", () => {
	test("pins the deploy workflow to the audited base-ci revision", () => {
		const release = workflow("release.yml");

		expect(release).toContain(`nocoo/base-ci/.github/workflows/deploy-worker.yml@${BASE_CI_SHA}`);
	});

	test("pins every base-ci reference in the workflows to the audited revision", () => {
		const mentions = baseCiMentions();

		expect(mentions.length).toBe(BASE_CI_REFERENCE_COUNT);
		expect(mentions.filter(({ file }) => file === "release.yml").length).toBe(1);
		expect(mentions.filter(({ file }) => file === "quality-slots.yml").length).toBe(13);
		expect(
			mentions.filter(({ file }) => file !== "release.yml" && file !== "quality-slots.yml"),
		).toEqual([]);
		expect(
			mentions.filter(({ ref }) => !/^nocoo\/base-ci\/[^@\s]+@[0-9a-f]{40}$/.test(ref)),
		).toEqual([]);
		expect(
			mentions.filter(({ ref }) => /[0-9a-f]{40}$/.test(ref) && !ref.endsWith(`@${BASE_CI_SHA}`)),
		).toEqual([]);
	});

	test("labels every base-ci pin with the audited version", () => {
		const offenders: string[] = [];
		for (const file of workflowFiles()) {
			for (const line of workflow(file).split("\n")) {
				if (!line.includes("nocoo/base-ci")) continue;
				const markers = (line.match(/#\s*v[0-9]+(?:\.[0-9]+)*/g) ?? []).map((m) => m.trim());
				if (markers.length !== 1 || markers[0] !== `# ${BASE_CI_VERSION}`) {
					offenders.push(`${file}: ${line.trim()}`);
				}
			}
		}

		expect(offenders).toEqual([]);
	});

	test("passes the CI workflow identity the release script waits for", () => {
		const release = workflow("release.yml");

		expect(release).toContain(`expected-workflow-path: "${CI_WORKFLOW}"`);
		expect(release).toContain(`expected-workflow-name: "${CI_WORKFLOW_NAME}"`);
	});

	test("requires the quality gate check that CI produces", () => {
		const caller = workflowJobs(workflow("ci.yml")).find((job) => job.key === "quality");
		const gate = workflowJobs(workflow("quality-slots.yml")).find((job) => job.key === "z1-gate");

		expect(caller).toBeDefined();
		expect(gate).toBeDefined();
		// The caller job must not rename itself: the check prefix is its display name.
		expect(caller?.name ?? "quality").toBe("quality");
		expect(gate?.name).toBe("Z1: Gate");
		const checkName = `${caller?.name ?? caller?.key} / ${gate?.name}`;
		expect(checkName).toBe("quality / Z1: Gate");
		const match = workflow("release.yml").match(/required-quality-check:\s*["']?([^"'\n#]+)/);
		const configuredCheck = match ? match[1].trim() : "";
		expect(configuredCheck).toBe(checkName);
	});

	test("pins every base-ci action in the quality slots to the same revision", () => {
		const pins = [
			...workflow("quality-slots.yml").matchAll(/nocoo\/base-ci\/[^@\s]+@([0-9a-f]{40})/g),
		].map((match) => match[1]);

		expect(pins.length).toBeGreaterThan(0);
		expect(new Set(pins)).toEqual(new Set([BASE_CI_SHA]));
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

describe("run", () => {
	test("reports a missing binary as a spawn failure with a message", async () => {
		const result = await run("xray-no-such-binary-4d1f", ["--version"]);

		expect(result.code).toBe(SPAWN_FAILURE_EXIT_CODE);
		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("xray-no-such-binary-4d1f");
	});

	test("reports a non-zero exit code from a real command", async () => {
		const result = await run("git", ["rev-parse", "--verify", "refs/heads/xray-no-such-ref"]);

		expect(result.code).not.toBe(0);
		expect(result.code).not.toBe(SPAWN_FAILURE_EXIT_CODE);
	});

	test("captures stdout of a successful command", async () => {
		const result = await run("git", ["--version"]);

		expect(result.code).toBe(0);
		expect(result.stdout).toContain("git version");
	});

	test("reports a signal-terminated process with a non-1 exit code", async () => {
		const result = await run("sh", ["-c", "kill -TERM $$"]);

		expect(result.code).toBe(SIGNAL_FAILURE_EXIT_CODE);
		expect(result.code).not.toBe(1);
		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("terminated by signal");
	});

	test("reports a timed-out process with a non-1 exit code", async () => {
		const result = await run("sh", ["-c", "sleep 2"], { timeoutMs: 100 });

		expect(result.code).toBe(SIGNAL_FAILURE_EXIT_CODE);
		expect(result.code).not.toBe(1);
		expect(result.code).not.toBe(0);
	}, 10_000);
});

describe("classifyStaleVersionScan", () => {
	function scan(code: number, stdout = "", stderr = "") {
		return classifyStaleVersionScan({ code, stdout, stderr });
	}

	test("reports matches as stale", () => {
		const result = scan(0, 'packages/shared/src/version.ts:const V = "1.0.0";\n');

		expect(result.outcome).toBe("stale");
		expect(result.outcome === "stale" && result.matches).toContain("version.ts");
	});

	test("treats a match-free exit as clean", () => {
		expect(scan(1).outcome).toBe("clean");
		expect(scan(0, "   \n").outcome).toBe("clean");
	});

	test("fails closed when the scanner could not be started", () => {
		const result = scan(SPAWN_FAILURE_EXIT_CODE, "", "rg: command not found");

		expect(result.outcome).toBe("failed");
		expect(result.outcome === "failed" && result.reason).toContain("rg");
	});

	test("fails closed when the scanner errored", () => {
		const result = scan(2, "", "rg: regex parse error");

		expect(result.outcome).toBe("failed");
		expect(result.outcome === "failed" && result.reason).toContain("2");
	});

	test("fails closed when the scanner was terminated by a signal", () => {
		const result = scan(SIGNAL_FAILURE_EXIT_CODE, "", "rg: terminated by signal SIGTERM");

		expect(result.outcome).toBe("failed");
		expect(result.outcome === "failed" && result.reason).toContain("128");
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
		/** Advances the clock before each `gh run view` returns, like a stalled command. */
		viewDelayMs?: number;
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
						state.now += steps.viewDelayMs ?? 0;
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

	test("clamps the view timeout to the remaining watch budget", async () => {
		const { deps, timeouts } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			views: [ciRun(), ciRun({ status: "completed", conclusion: "success" })],
		});

		await waitForCiSuccess(SHA, deps, { watchMs: 25_000, pollMs: 10_000 });

		const viewTimeouts = timeouts.slice(1);
		expect(viewTimeouts[0]).toBe(25_000);
		expect(viewTimeouts[1]).toBe(15_000);
		for (const timeout of viewTimeouts) {
			expect(timeout).toBeLessThanOrEqual(CI_VIEW_TIMEOUT_MS);
		}
	});

	test("rejects a verdict that arrives after the watch deadline expired", async () => {
		const { deps } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			view: ciRun({ status: "completed", conclusion: "success" }),
			viewDelayMs: 40_000,
		});

		await expect(waitForCiSuccess(SHA, deps, { watchMs: 30_000, pollMs: 10_000 })).rejects.toThrow(
			/did not complete within 30000ms/,
		);
	});

	test("reports a deadline miss instead of a verification error when the poll times out", async () => {
		const { deps } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			view: ciRun({ status: "in_progress" }),
			viewDelayMs: 40_000,
			viewCode: 1,
		});

		await expect(waitForCiSuccess(SHA, deps, { watchMs: 30_000, pollMs: 10_000 })).rejects.toThrow(
			/did not complete within 30000ms/,
		);
	});

	test("reports a registration deadline miss instead of a list error when the poll times out", async () => {
		const { deps } = fakeDeps({
			list: ["[]"],
			listCode: 1,
			listDelayMs: 40_000,
		});

		await expect(
			waitForCiSuccess(SHA, deps, { registrationMs: 30_000, pollMs: 10_000 }),
		).rejects.toThrow(/no CI run registered for commit .* within 30000ms/);
	});
});
