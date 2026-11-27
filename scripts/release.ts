#!/usr/bin/env bun
/**
 * Automated release for xray monorepo (adapted from bat/surety).
 *
 * Bumps root + workspace package.json + shared version constant, syncs lockfile,
 * generates CHANGELOG from conventional commits, commits, pushes, tags, GitHub release.
 *
 * Usage:
 *   bun run release              # patch Z+1 (default)
 *   bun run release -- minor     # minor Y+1
 *   bun run release -- major     # major X+1
 *   bun run release -- 2.1.0     # explicit version
 *   bun run release -- --dry-run # preview without side effects
 *
 * Requires: clean git tree, `gh` authenticated (the release waits for a
 * successful CI run on the exact pushed commit before tagging), `rg`.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

const PROJECT_ROOT = pathResolve(import.meta.dirname as string, "..");
const PACKAGE_JSON = pathResolve(PROJECT_ROOT, "package.json");
const CHANGELOG_MD = pathResolve(PROJECT_ROOT, "CHANGELOG.md");

interface VersionTarget {
	path: string;
	pattern: "json-version" | "const-version";
}

const VERSION_TARGETS: VersionTarget[] = [
	{ path: "package.json", pattern: "json-version" },
	{ path: "bun.lock", pattern: "json-version" },
	{ path: "packages/shared/package.json", pattern: "json-version" },
	{ path: "packages/ui/package.json", pattern: "json-version" },
	{ path: "packages/worker/package.json", pattern: "json-version" },
	{ path: "packages/shared/src/version.ts", pattern: "const-version" },
];

const BUMP_TYPES = ["patch", "minor", "major"] as const;
type BumpType = (typeof BUMP_TYPES)[number];

interface Commit {
	hash: string;
	subject: string;
}

interface ChangelogSections {
	added: string[];
	changed: string[];
	fixed: string[];
	removed: string[];
}

const COMMIT_TYPE_MAP: Record<string, keyof ChangelogSections> = {
	feat: "added",
	fix: "fixed",
	refactor: "changed",
	chore: "changed",
	docs: "changed",
	test: "changed",
	perf: "changed",
	style: "changed",
	ci: "changed",
	build: "changed",
};

const REMOVED_KEYWORDS = /\b(remove|delete|drop)\b/i;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const CONVENTIONAL_RE = /^(\w+)(?:\(.+?\))?!?:\s*(.+)$/;

export interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** Conventional shell code for "command not found"; keeps spawn failures distinct from tool exit codes. */
export const SPAWN_FAILURE_EXIT_CODE = 127;

/**
 * Exit code for a process killed by a signal. Must differ from 1, which is a
 * meaningful success code for tools such as `rg` (no matches).
 */
export const SIGNAL_FAILURE_EXIT_CODE = 128;

export function run(
	cmd: string,
	args: string[],
	opts?: { cwd?: string; inherit?: boolean; timeoutMs?: number },
): Promise<RunResult> {
	return new Promise((resolve) => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const child = spawn(cmd, args, {
			cwd: opts?.cwd ?? PROJECT_ROOT,
			stdio: opts?.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
			timeout: opts?.timeoutMs,
		});
		if (opts?.timeoutMs !== undefined && opts.timeoutMs > 0) {
			timer = setTimeout(() => {
				try {
					child.kill("SIGTERM");
				} catch {
					// Ignore if already dead
				}
			}, opts.timeoutMs);
		}
		let stdout = "";
		let stderr = "";
		if (!opts?.inherit) {
			child.stdout?.on("data", (d: Buffer) => {
				stdout += d.toString();
			});
			child.stderr?.on("data", (d: Buffer) => {
				stderr += d.toString();
			});
		}
		child.on("error", (err: Error) => {
			if (timer) clearTimeout(timer);
			resolve({
				code: SPAWN_FAILURE_EXIT_CODE,
				stdout,
				stderr: `${stderr}${cmd}: ${err.message}`,
			});
		});
		child.on("close", (code, signal) => {
			if (timer) clearTimeout(timer);
			if (code === null) {
				resolve({
					code: SIGNAL_FAILURE_EXIT_CODE,
					stdout,
					stderr: `${stderr}${cmd}: terminated by signal ${signal ?? "unknown"}`,
				});
				return;
			}
			resolve({ code, stdout, stderr });
		});
	});
}

async function runOrDie(cmd: string, args: string[], errorMsg: string): Promise<string> {
	const result = await run(cmd, args);
	if (result.code !== 0) {
		console.error(`❌ ${errorMsg}`);
		if (result.stderr.trim()) console.error(result.stderr.trim());
		process.exit(1);
	}
	return result.stdout.trim();
}

function parseSemver(version: string): [number, number, number] {
	if (!SEMVER_RE.test(version)) {
		console.error(`❌ Invalid semver: "${version}"`);
		process.exit(1);
	}
	return version.split(".").map(Number) as [number, number, number];
}

function compareSemver(a: string, b: string): number {
	const [a0, a1, a2] = parseSemver(a);
	const [b0, b1, b2] = parseSemver(b);
	if (a0 !== b0) return a0 - b0;
	if (a1 !== b1) return a1 - b1;
	return a2 - b2;
}

function bumpVersion(current: string, bumpArg: string): string {
	if (SEMVER_RE.test(bumpArg)) {
		if (compareSemver(bumpArg, current) <= 0) {
			console.error(`❌ Explicit version ${bumpArg} must be greater than current ${current}`);
			process.exit(1);
		}
		return bumpArg;
	}
	if (!BUMP_TYPES.includes(bumpArg as BumpType)) {
		console.error(`❌ Invalid bump type: "${bumpArg}"`);
		console.error("   Use: patch | minor | major | x.y.z");
		process.exit(1);
	}
	const [major, minor, patch] = parseSemver(current);
	switch (bumpArg as BumpType) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
		default:
			throw new Error(`Unexpected bump type: ${bumpArg}`);
	}
}

function readCurrentVersion(): string {
	const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8")) as { version: string };
	return pkg.version;
}

function updateVersionInFile(
	target: VersionTarget,
	oldVersion: string,
	newVersion: string,
): boolean {
	const abs = pathResolve(PROJECT_ROOT, target.path);
	const content = readFileSync(abs, "utf-8");
	let updated: string;
	if (target.pattern === "json-version") {
		const pattern = `"version": "${oldVersion}"`;
		if (!content.includes(pattern)) {
			console.error(`  ✗ ${target.path} — pattern not found: ${pattern}`);
			return false;
		}
		updated = content.replaceAll(pattern, `"version": "${newVersion}"`);
	} else {
		const escaped = oldVersion.replace(/\./g, "\\.");
		const re = new RegExp(`"${escaped}"`, "g");
		if (!re.test(content)) {
			console.error(`  ✗ ${target.path} — version "${oldVersion}" not found`);
			return false;
		}
		updated = content.replace(new RegExp(`"${escaped}"`, "g"), `"${newVersion}"`);
	}
	writeFileSync(abs, updated, "utf-8");
	console.info(`  ✓ ${target.path}`);
	return true;
}

async function getLastTag(): Promise<string | undefined> {
	const result = await run("git", ["describe", "--tags", "--abbrev=0"]);
	if (result.code !== 0) return undefined;
	return result.stdout.trim();
}

async function getCommitsSinceTag(tag: string | undefined): Promise<Commit[]> {
	const range = tag ? `${tag}..HEAD` : "HEAD";
	const stdout = await runOrDie(
		"git",
		["log", range, "--format=%H|||%s"],
		"Failed to read git log",
	);
	if (!stdout) return [];
	return stdout
		.split("\n")
		.filter((line) => line.includes("|||"))
		.map((line) => {
			const sepIdx = line.indexOf("|||");
			return { hash: line.slice(0, sepIdx), subject: line.slice(sepIdx + 3) };
		})
		.filter((c) => !c.subject.startsWith("release: v"));
}

function capitalizeFirst(s: string): string {
	if (!s) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function classifyCommits(commits: Commit[]): ChangelogSections {
	const sections: ChangelogSections = { added: [], changed: [], fixed: [], removed: [] };
	for (const commit of commits) {
		const { subject } = commit;
		if (subject.startsWith("Merge ")) continue;
		let description: string;
		let section: keyof ChangelogSections;
		const match = CONVENTIONAL_RE.exec(subject);
		if (match) {
			const type = (match[1] as string).toLowerCase();
			description = capitalizeFirst((match[2] as string).trim());
			section = COMMIT_TYPE_MAP[type] ?? "changed";
		} else {
			description = capitalizeFirst(subject.trim());
			section = "changed";
		}
		if (REMOVED_KEYWORDS.test(subject) && section === "changed") section = "removed";
		if (!sections[section].includes(description)) sections[section].push(description);
	}
	return sections;
}

function formatChangelogSection(version: string, sections: ChangelogSections): string {
	const lines: string[] = [`## v${version}`];
	const order: [keyof ChangelogSections, string][] = [
		["added", "Added"],
		["changed", "Changed"],
		["fixed", "Fixed"],
		["removed", "Removed"],
	];
	for (const [key, heading] of order) {
		const items = sections[key];
		if (items.length > 0) {
			lines.push("", `### ${heading}`, "");
			for (const item of items) lines.push(`- ${item}`);
		}
	}
	return lines.join("\n");
}

function ensureChangelogHeader(): void {
	if (existsSync(CHANGELOG_MD)) return;
	writeFileSync(
		CHANGELOG_MD,
		`# Changelog

All notable changes to X-Ray are documented in this file.

`,
		"utf-8",
	);
}

function updateChangelog(newSection: string): void {
	ensureChangelogHeader();
	const content = readFileSync(CHANGELOG_MD, "utf-8");
	const marker = "## v";
	const idx = content.indexOf(marker);
	const updated =
		idx === -1
			? `${content.trimEnd()}\n\n${newSection}\n`
			: `${content.slice(0, idx) + newSection}\n\n${content.slice(idx)}`;
	writeFileSync(CHANGELOG_MD, updated);
}

// ---------------------------------------------------------------------------
// Stale version scan
// ---------------------------------------------------------------------------

export type StaleVersionScan =
	| { outcome: "clean" }
	| { outcome: "stale"; matches: string }
	| { outcome: "failed"; reason: string };

/**
 * Classify a `rg` scan result. `rg` exits 0 with matches, 1 without matches and
 * 2+ on a real error; a missing binary is a spawn failure. Anything other than
 * "no matches" must fail closed — an unusable scanner must never be reported as
 * a clean source tree.
 */
export function classifyStaleVersionScan(result: RunResult): StaleVersionScan {
	if (result.code === 0) {
		const matches = result.stdout.trim();
		return matches ? { outcome: "stale", matches } : { outcome: "clean" };
	}
	if (result.code === 1) return { outcome: "clean" };
	if (result.code === SPAWN_FAILURE_EXIT_CODE) {
		return { outcome: "failed", reason: "`rg` could not be started" };
	}
	return { outcome: "failed", reason: `\`rg\` exited with code ${result.code}` };
}

// ---------------------------------------------------------------------------
// CI gate before tagging
// ---------------------------------------------------------------------------

export const CI_WORKFLOW = ".github/workflows/pipeline.yml";
export const CI_WORKFLOW_NAME = "Pipeline";
export const CI_BRANCH = "main";
export const CI_RUN_FIELDS = "databaseId,headSha,headBranch,event,workflowName,status,conclusion";
export const CI_REGISTRATION_TIMEOUT_MS = 5 * 60_000;
export const CI_WATCH_TIMEOUT_MS = 25 * 60_000;
export const CI_POLL_MS = 10_000;
export const CI_VIEW_TIMEOUT_MS = 30_000;

export interface CiRunMetadata {
	databaseId: number;
	headSha: string;
	headBranch: string;
	event: string;
	workflowName: string;
	status: string;
	conclusion: string;
}

export interface CiWaitDeps {
	run: (args: string[], timeoutMs?: number) => Promise<RunResult>;
	sleep: (ms: number) => Promise<void>;
	now: () => number;
}

export function parseCiRun(raw: string, source: string): CiRunMetadata {
	try {
		return JSON.parse(raw) as CiRunMetadata;
	} catch {
		throw new Error(`could not parse \`${source}\` output`);
	}
}

export function parseCiRuns(raw: string): CiRunMetadata[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("could not parse `gh run list` output");
	}
	if (!Array.isArray(parsed)) {
		throw new Error("unexpected `gh run list` output");
	}
	return parsed as CiRunMetadata[];
}

/** Refuse to trust a run that is not the CI workflow push on main for this commit. */
export function assertCiRunIdentity(run: CiRunMetadata, sha: string): void {
	if (
		run.headSha !== sha ||
		run.headBranch !== CI_BRANCH ||
		run.event !== "push" ||
		run.workflowName !== CI_WORKFLOW_NAME
	) {
		throw new Error(
			`CI run ${run.databaseId} does not match the pushed commit (sha=${run.headSha}, branch=${run.headBranch}, event=${run.event}, workflow=${run.workflowName})`,
		);
	}
}

/**
 * Block until the CI workflow for the exact pushed commit succeeds. The run is
 * located by commit/event/branch, its metadata is re-verified, and any failed,
 * cancelled, mismatched or timed-out run throws so the caller never tags
 * unproven source.
 */
export async function waitForCiSuccess(
	sha: string,
	deps: CiWaitDeps,
	timeouts: { registrationMs?: number; watchMs?: number; pollMs?: number } = {},
): Promise<CiRunMetadata> {
	const registrationMs = timeouts.registrationMs ?? CI_REGISTRATION_TIMEOUT_MS;
	const watchMs = timeouts.watchMs ?? CI_WATCH_TIMEOUT_MS;
	const pollMs = timeouts.pollMs ?? CI_POLL_MS;
	const deadline = deps.now() + registrationMs;

	let registered: CiRunMetadata | undefined;
	while (registered === undefined) {
		const remainingMs = Math.max(1, deadline - deps.now());
		const listed = await deps.run(
			[
				"run",
				"list",
				"--workflow",
				CI_WORKFLOW,
				"--commit",
				sha,
				"--event",
				"push",
				"--branch",
				CI_BRANCH,
				"--limit",
				"10",
				"--json",
				CI_RUN_FIELDS,
			],
			remainingMs,
		);
		if (listed.code !== 0) {
			// A list call that ran out of the registration budget is a deadline miss.
			if (deps.now() >= deadline) {
				throw new Error(`no CI run registered for commit ${sha} within ${registrationMs}ms`);
			}
			throw new Error(`\`gh run list\` failed (exit ${listed.code})`);
		}
		if (deps.now() >= deadline) {
			throw new Error(`no CI run registered for commit ${sha} within ${registrationMs}ms`);
		}
		const [found] = parseCiRuns(listed.stdout);
		if (found !== undefined) {
			assertCiRunIdentity(found, sha);
			registered = found;
			break;
		}
		await deps.sleep(pollMs);
	}

	const id = String(registered.databaseId);
	const watchDeadline = deps.now() + watchMs;
	let final: CiRunMetadata;
	while (true) {
		if (deps.now() >= watchDeadline) {
			throw new Error(`CI run ${id} did not complete within ${watchMs}ms`);
		}
		// Never let one poll outlive the watch deadline.
		const viewTimeoutMs = Math.min(CI_VIEW_TIMEOUT_MS, Math.max(1, watchDeadline - deps.now()));
		const viewed = await deps.run(["run", "view", id, "--json", CI_RUN_FIELDS], viewTimeoutMs);
		if (viewed.code !== 0) {
			// A view call that ran out of the clamped budget is a deadline miss.
			if (deps.now() >= watchDeadline) {
				throw new Error(`CI run ${id} did not complete within ${watchMs}ms`);
			}
			throw new Error(`could not verify CI run ${id} (exit ${viewed.code})`);
		}
		final = parseCiRun(viewed.stdout, "gh run view");
		assertCiRunIdentity(final, sha);
		if (final.status === "completed") {
			// A verdict obtained after the budget expired is not trustworthy.
			if (deps.now() >= watchDeadline) {
				throw new Error(`CI run ${id} did not complete within ${watchMs}ms`);
			}
			break;
		}
		if (deps.now() >= watchDeadline) {
			throw new Error(`CI run ${id} did not complete within ${watchMs}ms`);
		}
		await deps.sleep(pollMs);
	}
	if (final.conclusion !== "success") {
		throw new Error(
			`CI run ${id} completed with conclusion \`${final.conclusion}\`, expected success`,
		);
	}
	return final;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Resolve the remote a plain `git push` would use, following git's own
 * precedence: `branch.<name>.pushRemote`, `remote.pushDefault`,
 * `branch.<name>.remote`, then `origin`. The tag must reach the same remote
 * that received the branch push.
 */
async function resolvePushRemote(branch: string): Promise<string> {
	const candidates = [
		["branch", `${branch}.pushRemote`],
		["remote", "pushDefault"],
		["branch", `${branch}.remote`],
	];
	for (const [scope, key] of candidates) {
		const result = await run("git", ["config", "--get", `${scope}.${key}`]);
		const value = result.code === 0 ? result.stdout.trim() : "";
		if (value) return value;
	}
	return "origin";
}

/**
 * Recovery guidance for a release that stopped after the commit was created.
 * The steps are ordered so tagging is only reachable after CI has been verified
 * green on the exact commit; `--no-follow-tags` keeps a `push.followTags=true`
 * configuration from publishing unrelated local tags.
 */
function printTagRecovery(
	version: string,
	sha: string,
	remote: string,
	branch: string,
	pushBranch: boolean,
): void {
	const steps: string[] = [];
	if (pushBranch) {
		steps.push(
			`1. Push the commit to ${remote}/${branch}:`,
			`     git push --no-follow-tags ${remote} ${branch}`,
		);
	}
	const verifyStep = pushBranch ? 2 : 1;
	steps.push(
		`${verifyStep}. Wait and verify CI is green for ${sha} on ${CI_BRANCH}:`,
		`     gh run watch $(gh run list --workflow ${CI_WORKFLOW} --commit ${sha} --event push --branch ${CI_BRANCH} --limit 1 --json databaseId -q '.[0].databaseId') --exit-status`,
		`${verifyStep + 1}. Only after CI is green, tag that exact commit and push that one ref:`,
		`     git tag -a v${version} ${sha} -m "v${version}"`,
		`     git push --no-follow-tags ${remote} refs/tags/v${version}`,
		`${verifyStep + 2}. Create the GitHub release:`,
		`     gh release create v${version} --title "v${version}" --notes "..."`,
	);
	console.error(`   Recovery for v${version} (commit ${sha}):`);
	for (const step of steps) console.error(`     ${step}`);
}

async function main(): Promise<void> {
	const { packageManager } = JSON.parse(readFileSync(PACKAGE_JSON, "utf-8")) as {
		packageManager: string;
	};
	if (`bun@${process.versions.bun}` !== packageManager) {
		throw new Error(`Release requires ${packageManager}; use the declared runtime.`);
	}
	const rawArgs = process.argv.slice(2).filter((a) => a !== "--");
	const isDryRun = rawArgs.includes("--dry-run");
	const bumpArg = rawArgs.find((a) => a !== "--dry-run") ?? "patch";

	if (isDryRun) console.info("🏃 Dry-run mode — no changes will be written.\n");

	const status = await runOrDie("git", ["status", "--porcelain"], "Failed to check git status");
	if (status) {
		console.error("❌ Working tree is not clean. Commit or stash changes first.");
		console.error(status);
		process.exit(1);
	}

	const branch = await runOrDie(
		"git",
		["symbolic-ref", "--short", "HEAD"],
		"Detached HEAD — checkout a branch first",
	);
	if (!isDryRun && branch !== CI_BRANCH) {
		console.error(`❌ Release must run on \`${CI_BRANCH}\`, current branch is \`${branch}\`.`);
		console.error("   The tag must point at a main commit so CI runs on main for that SHA.");
		process.exit(1);
	}

	const ghResult = await run("gh", ["auth", "status"]);
	if (ghResult.code !== 0) {
		if (ghResult.code === SPAWN_FAILURE_EXIT_CODE) {
			console.error("❌ gh CLI is not installed — cannot verify CI or create the release.");
		} else {
			console.error("❌ gh CLI is not authenticated — cannot verify CI or create the release.");
		}
		console.error("   Run `gh auth login`, then retry. No tag was created.");
		process.exit(1);
	}

	const currentVersion = readCurrentVersion();
	const newVersion = bumpVersion(currentVersion, bumpArg);
	const lastTag = await getLastTag();

	console.info("📦 xray release");
	console.info(`   Current:  ${currentVersion}`);
	console.info(`   New:      ${newVersion}`);
	console.info(`   Bump:     ${bumpArg}`);
	console.info(`   Branch:   ${branch}`);
	console.info(`   Last tag: ${lastTag ?? "(none)"}`);
	console.info("");

	console.info("📝 Updating version targets...\n");
	if (isDryRun) {
		for (const t of VERSION_TARGETS) console.info(`  [dry-run] would update ${t.path}`);
	} else {
		let failures = 0;
		for (const target of VERSION_TARGETS) {
			if (!updateVersionInFile(target, currentVersion, newVersion)) failures++;
		}
		if (failures > 0) {
			console.error(`\n❌ Failed to update ${failures}/${VERSION_TARGETS.length} files.`);
			console.error("   Run `git checkout -- .` to revert partial changes.");
			process.exit(1);
		}
		console.info("\n   🔄 bun install (lockfile)...");
		const installResult = await run("bun", ["install"], { inherit: true });
		if (installResult.code !== 0) {
			console.error("❌ bun install failed");
			process.exit(1);
		}
		if (/", "https?:\/\//.test(readFileSync(pathResolve(PROJECT_ROOT, "bun.lock"), "utf-8"))) {
			throw new Error("Registry URLs entered bun.lock. Normalize the lockfile before publishing.");
		}
	}

	const commits = await getCommitsSinceTag(lastTag);
	if (commits.length === 0) console.warn("⚠️  No commits found since last tag.");
	const sections = classifyCommits(commits);
	const changelogSection = formatChangelogSection(newVersion, sections);
	console.info("\n--- CHANGELOG ---\n");
	console.info(changelogSection);
	console.info("\n--- end ---\n");

	if (isDryRun) {
		console.info("[dry-run] Would update CHANGELOG.md");
	} else {
		updateChangelog(changelogSection);
		console.info("✅ CHANGELOG.md updated");
	}

	// Stale version check in source
	const escaped = currentVersion.replace(/\./g, "\\.");
	const versionPattern = `(?<![.\\d])(?:["']${escaped}["']|v${escaped})(?![.\\d])`;
	const rgResult = await run("rg", [
		"-P",
		versionPattern,
		"--glob",
		"*.ts",
		"--glob",
		"*.tsx",
		"--glob",
		"!node_modules/**",
		"--glob",
		"!scripts/release.ts",
		"--glob",
		"!**/dist/**",
		"--glob",
		"!**/*.test.ts",
	]);
	const scan = classifyStaleVersionScan(rgResult);
	if (scan.outcome === "failed") {
		console.error(`❌ Stale version scan failed: ${scan.reason}.`);
		if (rgResult.stderr.trim()) console.error(rgResult.stderr.trim());
		if (!isDryRun) {
			console.error("   Aborting.");
			process.exit(1);
		}
	} else if (scan.outcome === "stale") {
		console.error(`❌ Found stale version "${currentVersion}" in source files:`);
		console.error(scan.matches);
		if (!isDryRun) {
			console.error("   Aborting.");
			process.exit(1);
		}
	} else {
		console.info("✅ No stale version references in source.");
	}

	const filesToStage = [...VERSION_TARGETS.map((t) => t.path), "CHANGELOG.md"];

	if (isDryRun) {
		console.info("[dry-run] Would commit, push, tag, release.");
		process.exit(0);
	}

	await runOrDie("git", ["add", ...filesToStage], "Failed to stage files");
	const commitResult = await run("git", ["commit", "-m", `release: v${newVersion}`]);
	if (commitResult.code !== 0) {
		console.error("❌ Commit failed (pre-commit hooks?)");
		if (commitResult.stderr.trim()) console.error(commitResult.stderr.trim());
		process.exit(1);
	}
	console.info(`✅ Committed release: v${newVersion}`);

	// Resolve the exact commit before pushing so the tag can never drift from
	// the SHA that CI is asked to prove.
	const headSha = await runOrDie("git", ["rev-parse", "HEAD"], "Failed to resolve release commit");
	const pushRemote = await resolvePushRemote(branch);

	const pushResult = await run("git", ["push", "--no-follow-tags"], { inherit: true });
	if (pushResult.code !== 0) {
		console.error("❌ git push failed");
		printTagRecovery(newVersion, headSha, pushRemote, branch, true);
		process.exit(1);
	}

	// CI gate: only tag source that CI proved on the exact pushed commit.
	console.info(`⏳ Waiting for CI (${CI_WORKFLOW}) on ${headSha} ...`);
	try {
		await waitForCiSuccess(headSha, {
			run: (args, timeoutMs) => run("gh", args, { timeoutMs }),
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			now: () => Date.now(),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`❌ CI gate failed for ${headSha}: ${message}`);
		console.error(`   Tag v${newVersion} was NOT created.`);
		printTagRecovery(newVersion, headSha, pushRemote, branch, false);
		process.exit(1);
	}
	console.info("✅ CI passed for the pushed commit.");

	const tagResult = await run("git", [
		"tag",
		"-a",
		`v${newVersion}`,
		headSha,
		"-m",
		`v${newVersion}`,
	]);
	if (tagResult.code !== 0) {
		console.error(`❌ Failed to create tag v${newVersion}`);
		if (tagResult.stderr.includes("already exists")) {
			console.error(`   Delete with: git tag -d v${newVersion}`);
		}
		process.exit(1);
	}
	const pushTagResult = await run(
		"git",
		["push", "--no-follow-tags", pushRemote, `refs/tags/v${newVersion}`],
		{ inherit: true },
	);
	if (pushTagResult.code !== 0) {
		console.error(`❌ git push --no-follow-tags ${pushRemote} refs/tags/v${newVersion} failed`);
		printTagRecovery(newVersion, headSha, pushRemote, branch, false);
		process.exit(1);
	}

	const releaseResult = await run("gh", [
		"release",
		"create",
		`v${newVersion}`,
		"--title",
		`v${newVersion}`,
		"--notes",
		changelogSection,
	]);
	if (releaseResult.code !== 0) {
		console.error("⚠️  GitHub release creation failed (tag is pushed)");
		console.error(`   gh release create v${newVersion} --title "v${newVersion}"`);
	} else {
		const url = releaseResult.stdout.trim();
		if (url) console.info(`🔗 Release: ${url}`);
	}

	console.info(`\n✅ Released v${newVersion}`);
	console.info("   Next: wait for GitHub Actions «Release» (tag + CI-gated main deploy).");
}

if (import.meta.main) {
	main().catch((err: unknown) => {
		console.error("❌ Unexpected error:", err);
		process.exit(1);
	});
}
