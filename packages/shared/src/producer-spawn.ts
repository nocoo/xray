import { scrubEnvForTwitter } from "./producer-utils.js";

export type SpawnResult = { code: number; stdout: string; stderr: string };

export type SpawnFn = (
	argv: string[],
	opts: { env: Record<string, string> },
) => Promise<SpawnResult>;

export type TwitterCliDeps = {
	spawn: SpawnFn;
	bin: string;
	/** Full process env before scrub */
	env: Record<string, string | undefined>;
	max: number;
};

export type TwitterCliIssueKind = "not_installed" | "not_authenticated" | "rate_limited" | "failed";

export type TwitterCliIssue = {
	kind: TwitterCliIssueKind;
	/** Multi-line operator-facing message (stdout-ready). */
	message: string;
};

function combinedText(stdout?: string, stderr?: string, spawnError?: unknown): string {
	const parts = [stderr ?? "", stdout ?? ""];
	if (spawnError instanceof Error) parts.push(spawnError.message);
	else if (spawnError != null) parts.push(String(spawnError));
	return parts.join("\n");
}

function looksNotInstalled(bin: string, code: number | undefined, text: string): boolean {
	if (code === 127) return true;
	const t = text.toLowerCase();
	if (/\b(enoent|not found|no such file|command not found|cannot find)\b/i.test(t)) return true;
	if (t.includes(bin.toLowerCase()) && /not found|enoent/i.test(t)) return true;
	return false;
}

function looksNotAuthenticated(text: string, authenticated?: boolean): boolean {
	if (authenticated === false) return true;
	const t = text.toLowerCase();
	return (
		/\bnot_authenticated\b/.test(t) ||
		/\bnot authenticated\b/.test(t) ||
		/no twitter cookies found/.test(t) ||
		/cookie expired/.test(t) ||
		/cookies? (missing|expired|invalid)/.test(t) ||
		/\b(401|403)\b/.test(t) ||
		/login (required|expired)/.test(t) ||
		/authentication (failed|required)/.test(t)
	);
}

function looksRateLimited(text: string): boolean {
	return /429|rate limited|rate_limited|rate.limit/i.test(text);
}

/** Operator-facing guidance for missing binary / expired login / etc. */
export function formatTwitterCliIssue(input: {
	bin: string;
	code?: number;
	stdout?: string;
	stderr?: string;
	spawnError?: unknown;
	/** When status JSON parsed and authenticated known */
	authenticated?: boolean;
	/** Optional context e.g. handle for user-posts */
	context?: string;
}): TwitterCliIssue {
	const bin = input.bin || "twitter";
	const text = combinedText(input.stdout, input.stderr, input.spawnError);
	const ctx = input.context ? `\nContext: ${input.context}` : "";

	if (looksNotInstalled(bin, input.code, text) || isEnoent(input.spawnError)) {
		return {
			kind: "not_installed",
			message: [
				`twitter-cli binary not found or not executable: "${bin}"${ctx}`,
				"",
				"Install (Python 3.10+):",
				"  uv tool install twitter-cli",
				"  # or: pipx install twitter-cli",
				"",
				"Ensure it is on PATH, or point explicitly:",
				"  export TWITTER_BIN=$(command -v twitter)",
				"  # or: bun run refresh:watchlists -- --twitter-bin /full/path/to/twitter",
				"",
				"Verify:",
				"  twitter --help",
				"  twitter status --json",
				"",
				"Docs: docs/09-local-producer-twitter-cli.md",
			].join("\n"),
		};
	}

	if (looksRateLimited(text)) {
		return {
			kind: "rate_limited",
			message: [
				`twitter-cli rate limited (HTTP 429).${ctx}`,
				"",
				"Wait 15+ minutes, increase --handle-delay-ms (e.g. 4000), then retry.",
				"Already-fetched handles: bun run refresh:watchlists -- --from-cache ...",
			].join("\n"),
		};
	}

	if (looksNotAuthenticated(text, input.authenticated) || input.authenticated === false) {
		return {
			kind: "not_authenticated",
			message: [
				`twitter-cli is not logged in (session missing or expired).${ctx}`,
				"",
				"Fix — pick one:",
				"  1) Browser cookies (recommended): log into https://x.com in Chrome/Arc/Firefox/Edge/Brave,",
				"     then run:",
				"       twitter whoami",
				"       twitter status --json",
				"     (expect data.authenticated === true)",
				"",
				"  2) Env vars:",
				"       export TWITTER_AUTH_TOKEN='…'   # from x.com cookie",
				"       export TWITTER_CT0='…'",
				"       twitter whoami",
				"",
				"  3) Offline if you already have cache:",
				"       bun run refresh:watchlists -- --from-cache --members-file config/members.json",
				"",
				"If whoami still fails: re-login on x.com (password change invalidates cookies), then retry.",
				"Docs: docs/09-local-producer-twitter-cli.md § twitter-cli auth",
			].join("\n"),
		};
	}

	const detail = text.trim().slice(0, 400) || `(exit ${input.code ?? "?"})`;
	return {
		kind: "failed",
		message: [
			`twitter-cli command failed${ctx}`,
			detail,
			"",
			"Try:",
			`  ${bin} status --json`,
			`  ${bin} whoami`,
			"Docs: docs/09-local-producer-twitter-cli.md",
		].join("\n"),
	};
}

function isEnoent(err: unknown): boolean {
	if (!err || typeof err !== "object") return false;
	const e = err as { code?: string; message?: string };
	return e.code === "ENOENT" || /enoent|not found/i.test(e.message ?? "");
}

export class TwitterCliError extends Error {
	readonly kind: TwitterCliIssueKind;
	constructor(issue: TwitterCliIssue) {
		super(issue.message);
		this.name = "TwitterCliError";
		this.kind = issue.kind;
	}
}

/** Run `twitter status --json` with scrubbed env. */
export async function twitterStatus(deps: TwitterCliDeps): Promise<{
	authenticated: boolean;
	raw: unknown;
	spawnEnv: Record<string, string>;
}> {
	const spawnEnv = scrubEnvForTwitter(deps.env);
	let res: SpawnResult;
	try {
		res = await deps.spawn([deps.bin, "status", "--json"], { env: spawnEnv });
	} catch (spawnError) {
		throw new TwitterCliError(
			formatTwitterCliIssue({ bin: deps.bin, spawnError, context: "twitter status" }),
		);
	}
	if (res.code !== 0) {
		throw new TwitterCliError(
			formatTwitterCliIssue({
				bin: deps.bin,
				code: res.code,
				stdout: res.stdout,
				stderr: res.stderr,
				context: "twitter status",
			}),
		);
	}
	const start = res.stdout.indexOf("{");
	let raw: { ok?: boolean; data?: { authenticated?: boolean }; error?: { code?: string } };
	try {
		raw = JSON.parse(start >= 0 ? res.stdout.slice(start) : res.stdout) as typeof raw;
	} catch {
		throw new TwitterCliError(
			formatTwitterCliIssue({
				bin: deps.bin,
				code: res.code,
				stdout: res.stdout,
				stderr: res.stderr,
				context: "twitter status (invalid JSON)",
			}),
		);
	}
	const authenticated = Boolean(raw.ok && raw.data?.authenticated);
	if (!authenticated) {
		throw new TwitterCliError(
			formatTwitterCliIssue({
				bin: deps.bin,
				code: res.code,
				stdout: res.stdout,
				stderr: res.stderr,
				authenticated: false,
				context: "twitter status",
			}),
		);
	}
	return { authenticated: true, raw, spawnEnv };
}

/** Run `twitter user-posts <handle> --json --max N` with scrubbed env. */
export async function twitterUserPosts(
	deps: TwitterCliDeps,
	handle: string,
): Promise<{ data: unknown; spawnEnv: Record<string, string>; rateLimited: boolean }> {
	const spawnEnv = scrubEnvForTwitter(deps.env);
	let res: SpawnResult;
	try {
		res = await deps.spawn([deps.bin, "user-posts", handle, "--json", "--max", String(deps.max)], {
			env: spawnEnv,
		});
	} catch (spawnError) {
		const issue = formatTwitterCliIssue({
			bin: deps.bin,
			spawnError,
			context: `user-posts @${handle}`,
		});
		const err = new TwitterCliError(issue) as TwitterCliError & { rateLimited?: boolean };
		err.rateLimited = issue.kind === "rate_limited";
		throw err;
	}
	const combined = `${res.stderr}\n${res.stdout}`;
	if (res.code !== 0) {
		const issue = formatTwitterCliIssue({
			bin: deps.bin,
			code: res.code,
			stdout: res.stdout,
			stderr: res.stderr,
			context: `user-posts @${handle}`,
		});
		const err = new TwitterCliError(issue) as TwitterCliError & { rateLimited?: boolean };
		err.rateLimited = issue.kind === "rate_limited" || looksRateLimited(combined);
		throw err;
	}
	const start = res.stdout.indexOf("{");
	if (start < 0) {
		throw new TwitterCliError(
			formatTwitterCliIssue({
				bin: deps.bin,
				code: res.code,
				stdout: res.stdout,
				stderr: res.stderr,
				context: `user-posts @${handle} (no JSON)`,
			}),
		);
	}
	const data = JSON.parse(res.stdout.slice(start)) as unknown;
	// envelope ok:false → auth-ish
	if (data && typeof data === "object" && (data as { ok?: boolean }).ok === false) {
		const issue = formatTwitterCliIssue({
			bin: deps.bin,
			stdout: res.stdout,
			stderr: res.stderr,
			authenticated: false,
			context: `user-posts @${handle}`,
		});
		throw new TwitterCliError(issue);
	}
	return {
		data,
		spawnEnv,
		rateLimited: false,
	};
}

export type AtomicWriteFn = (path: string, contents: string) => void;

/** Write via tmp + rename (caller supplies fs ops for testability). */
export function atomicWriteJson(
	path: string,
	value: unknown,
	fs: {
		writeFileSync: (p: string, data: string) => void;
		renameSync: (from: string, to: string) => void;
		unlinkSync: (p: string) => void;
	},
	pid: number,
): void {
	const tmp = `${path}.${pid}.tmp`;
	try {
		fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
		fs.renameSync(tmp, path);
	} catch (e) {
		try {
			fs.unlinkSync(tmp);
		} catch {
			/* ignore */
		}
		throw e;
	}
}
