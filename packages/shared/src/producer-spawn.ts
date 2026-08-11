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

/** Run `twitter status --json` with scrubbed env. */
export async function twitterStatus(deps: TwitterCliDeps): Promise<{
	authenticated: boolean;
	raw: unknown;
	spawnEnv: Record<string, string>;
}> {
	const spawnEnv = scrubEnvForTwitter(deps.env);
	const res = await deps.spawn([deps.bin, "status", "--json"], { env: spawnEnv });
	if (res.code !== 0) {
		throw new Error(`twitter status failed (${res.code}): ${res.stderr || res.stdout}`);
	}
	const start = res.stdout.indexOf("{");
	const raw = JSON.parse(start >= 0 ? res.stdout.slice(start) : res.stdout) as {
		ok?: boolean;
		data?: { authenticated?: boolean };
	};
	return {
		authenticated: Boolean(raw.ok && raw.data?.authenticated),
		raw,
		spawnEnv,
	};
}

/** Run `twitter user-posts <handle> --json --max N` with scrubbed env. */
export async function twitterUserPosts(
	deps: TwitterCliDeps,
	handle: string,
): Promise<{ data: unknown; spawnEnv: Record<string, string>; rateLimited: boolean }> {
	const spawnEnv = scrubEnvForTwitter(deps.env);
	const res = await deps.spawn(
		[deps.bin, "user-posts", handle, "--json", "--max", String(deps.max)],
		{ env: spawnEnv },
	);
	const combined = `${res.stderr}\n${res.stdout}`;
	if (res.code !== 0) {
		const rateLimited = /429|Rate limited|rate_limited|rate.limit/i.test(combined);
		const err = new Error(`user-posts @${handle}: ${combined.slice(0, 400)}`) as Error & {
			rateLimited?: boolean;
		};
		err.rateLimited = rateLimited;
		throw err;
	}
	const start = res.stdout.indexOf("{");
	if (start < 0) throw new Error(`no JSON from user-posts @${handle}`);
	return {
		data: JSON.parse(res.stdout.slice(start)) as unknown,
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
