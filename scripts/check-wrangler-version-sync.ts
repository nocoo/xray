/**
 * Ensures the deployment workflow requests the exact Wrangler version installed
 * from the Worker workspace's frozen Bun lockfile.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const RELEASE_WORKFLOW = resolve(ROOT, ".github/workflows/release.yml");
const WORKER_PACKAGE = resolve(ROOT, "packages/worker/package.json");
const LOCKFILE = resolve(ROOT, "bun.lock");

function requiredMatch(source: string, pattern: RegExp, description: string): string {
	const match = source.match(pattern);
	if (!match?.[1]) throw new Error(`Could not find ${description}.`);
	return match[1];
}

function main(): void {
	const release = readFileSync(RELEASE_WORKFLOW, "utf-8");
	const workerPackage = JSON.parse(readFileSync(WORKER_PACKAGE, "utf-8")) as {
		devDependencies?: Record<string, string>;
	};
	const lockfile = readFileSync(LOCKFILE, "utf-8");

	const releaseVersions = [...release.matchAll(/^\s+wrangler-version:\s*"([^"]+)"\s*$/gm)].map(
		(match) => match[1],
	);
	if (releaseVersions.length !== 1 || !releaseVersions[0]) {
		throw new Error("Release workflow must declare exactly one wrangler-version.");
	}

	const manifestVersion = workerPackage.devDependencies?.wrangler;
	if (!manifestVersion) throw new Error("Worker package must declare a Wrangler devDependency.");

	const workerWorkspace = requiredMatch(
		lockfile,
		/^ {4}"packages\/worker": \{([\s\S]*?)^ {4}\},$/m,
		"Worker workspace in bun.lock",
	);
	const lockedWorkspaceVersion = requiredMatch(
		workerWorkspace,
		/^ {8}"wrangler": "([^"]+)",$/m,
		"Worker Wrangler dependency in bun.lock",
	);
	const resolvedVersion = requiredMatch(
		lockfile,
		/^ {4}"wrangler": \["wrangler@([^"]+)",/m,
		"resolved Wrangler package in bun.lock",
	);

	const versions = [releaseVersions[0], manifestVersion, lockedWorkspaceVersion, resolvedVersion];
	if (!versions.every((version) => version === manifestVersion)) {
		throw new Error(
			`Wrangler version mismatch: release=${releaseVersions[0]}, manifest=${manifestVersion}, ` +
				`workspace-lock=${lockedWorkspaceVersion}, resolved-lock=${resolvedVersion}.`,
		);
	}

	console.info(`Wrangler versions are synchronized at ${manifestVersion}.`);
}

main();
